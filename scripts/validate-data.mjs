// Kiểm tra dữ liệu tỉnh + câu hỏi trước khi nạp vào DB.
// Chỉ đọc file trong thư mục data/, không ghi, không gọi mạng. Chỉ dùng module built-in của Node.
//
// Cách dùng: node scripts/validate-data.mjs

import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = name => JSON.parse(readFileSync(join(ROOT, 'data', name), 'utf8'))

const errors = []
const warnings = []
const err = msg => errors.push(msg)
const warn = msg => warnings.push(msg)

const { provinces, collections, scoring } = readJson('provinces.json')
const { questions, topics, legacyUnsourced = [] } = readJson('questions.json')
// 204 câu soạn đợt đầu (27/10/2026) chưa lưu link nguồn — mọi câu khác BẮT BUỘC có `sources`
const LEGACY = new Set(legacyUnsourced)
const geo = readJson('map-geo.json')

// ---------- Tỉnh ----------
const REGIONS = new Set(['north', 'central', 'south'])
const ids = new Set()
for (const p of provinces) {
  if (ids.has(p.id)) err(`Tỉnh trùng id: ${p.id}`)
  ids.add(p.id)
  if (!REGIONS.has(p.region)) err(`${p.id}: region không hợp lệ (${p.region})`)
  if (!Array.isArray(p.mergedFrom) || !p.mergedFrom.length) err(`${p.id}: thiếu mergedFrom`)
  const expected = p.isCity ? scoring.city
    : p.mergedFrom.length >= 3 ? scoring.merged3
    : p.mergedFrom.length === 2 ? scoring.merged2 : scoring.single
  if (p.points !== expected) err(`${p.id}: points=${p.points}, theo quy tắc phải là ${expected}`)
}
if (provinces.length !== 34) err(`Cần 34 tỉnh/thành, đang có ${provinces.length}`)
if (provinces.filter(p => p.isCapital).length !== 1) err('Phải có đúng 1 thủ đô')

// Khớp với dữ liệu bản đồ
const geoById = new Map(geo.provinces.map(g => [g.id, g]))
for (const p of provinces) {
  const g = geoById.get(p.id)
  if (!g) { err(`${p.id}: không có trong map-geo.json`); continue }
  if (g.code !== p.code) err(`${p.id}: mã ${p.code} khác map-geo.json (${g.code})`)
  if (g.isCity !== p.isCity) err(`${p.id}: isCity khác map-geo.json`)
}
for (const g of geo.provinces) if (!ids.has(g.id)) err(`map-geo.json có ${g.id} nhưng provinces.json không có`)

// Bộ sưu tập
for (const c of collections) {
  for (const m of c.members) if (!ids.has(m)) err(`Bộ "${c.id}": thành viên không tồn tại ${m}`)
  if (c.need > c.members.length) err(`Bộ "${c.id}": need lớn hơn số thành viên`)
  if (c.needsReview) warn(`Bộ "${c.id}" cần xác minh: ${c.needsReview}`)
}

// ---------- Câu hỏi ----------
const KINDS = new Set(['choice', 'truefalse', 'text'])
const qids = new Set()
const perProvince = new Map([...ids].map(id => [id, { normal: 0, siege: 0 }]))
for (const q of questions) {
  const where = `Câu ${q.id}`
  if (qids.has(q.id)) err(`${where}: trùng id`)
  qids.add(q.id)
  if (!ids.has(q.province)) { err(`${where}: tỉnh không tồn tại (${q.province})`); continue }
  if (!['normal', 'siege'].includes(q.difficulty)) err(`${where}: difficulty không hợp lệ`)
  if (!topics[q.topic]) err(`${where}: topic không hợp lệ (${q.topic})`)
  if (!KINDS.has(q.kind)) err(`${where}: kind không hợp lệ (${q.kind})`)
  if (!q.content || q.content.length < 10) err(`${where}: thiếu nội dung`)
  if (!q.explanation) warn(`${where}: thiếu giải thích`)
  if (![1, 2, 3].includes(q.level)) err(`${where}: level phải là 1, 2 hoặc 3`)
  else if (q.difficulty === 'siege' && q.level === 1) warn(`${where}: câu công thành nhưng mức Dễ`)

  if (q.kind === 'choice') {
    if (!Array.isArray(q.options) || q.options.length < 2) err(`${where}: cần ít nhất 2 lựa chọn`)
    else {
      if (new Set(q.options).size !== q.options.length) err(`${where}: lựa chọn bị trùng`)
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) err(`${where}: answer ngoài phạm vi`)
    }
  } else if (q.kind === 'truefalse') {
    if (typeof q.answer !== 'boolean') err(`${where}: answer phải là true/false`)
  } else if (q.kind === 'text') {
    if (!Array.isArray(q.answer) || !q.answer.length || q.answer.some(a => typeof a !== 'string' || !a.trim())) {
      err(`${where}: answer phải là danh sách chuỗi`)
    }
  }
  perProvince.get(q.province)[q.difficulty === 'siege' ? 'siege' : 'normal']++

  // Nguồn: danh sách link https thật (không bịa); bắt buộc với câu mới
  if (q.sources !== undefined) {
    if (!Array.isArray(q.sources) || !q.sources.length) err(`${where}: sources phải là danh sách link`)
    else for (const u of q.sources) {
      let ok = false
      try { ok = new URL(u).protocol === 'https:' } catch {}
      if (!ok) err(`${where}: link nguồn không hợp lệ (${u})`)
    }
  } else if (!LEGACY.has(q.id)) {
    err(`${where}: câu mới phải có sources (link bài viết làm nguồn)`)
  }

  // Lộ đáp án: người chơi đang đứng ở tỉnh này, nên đáp án đúng không được là tên tỉnh đó
  const provName = provinces.find(p => p.id === q.province).name.toLowerCase()
  const correct = q.kind === 'choice' ? [q.options[q.answer]] : q.kind === 'text' ? q.answer : []
  if (correct.some(a => String(a).toLowerCase().includes(provName))) {
    warn(`${where}: đáp án đúng chứa tên tỉnh "${provName}" — người chơi đang đứng ở đây nên dễ đoán`)
  }
}

// Trùng nội dung trong cùng tỉnh (so sau khi bỏ dấu, chữ thường)
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const seenContent = new Map()
for (const q of questions) {
  const key = `${q.province}|${norm(q.content)}`
  if (seenContent.has(key)) err(`Câu ${q.id}: trùng nội dung với ${seenContent.get(key)}`)
  seenContent.set(key, q.id)
}

// Độ phủ (cảnh báo, chưa phải lỗi — đang soạn theo từng đợt)
const covered = [...perProvince].filter(([, c]) => c.normal + c.siege > 0)
for (const [id, c] of covered) {
  if (c.normal < 4) warn(`${id}: mới có ${c.normal} câu thường (mục tiêu ≥ 4)`)
  if (c.siege < 2) warn(`${id}: mới có ${c.siege} câu công thành (mục tiêu ≥ 2)`)
}
const missing = [...perProvince].filter(([, c]) => c.normal + c.siege === 0).map(([id]) => id)

// Phân bố đáp án trắc nghiệm (tránh đáp án dồn vào một vị trí)
const dist = [0, 0, 0, 0]
for (const q of questions) if (q.kind === 'choice' && q.options.length === 4) dist[q.answer]++

// Cân bằng chủ đề: ưu tiên ẩm thực, đời sống; hạn chế câu hỏi hành chính
const byTopic = {}
for (const q of questions) byTopic[q.topic] = (byTopic[q.topic] || 0) + 1
const pct = n => Math.round((n || 0) / questions.length * 100)
if (pct(byTopic['sap-nhap']) > 10) warn(`Câu hỏi sáp nhập/hành chính chiếm ${pct(byTopic['sap-nhap'])}% (nên ≤ 10%)`)
if (pct((byTopic['am-thuc'] || 0) + (byTopic['doi-song'] || 0)) < 35) warn('Ẩm thực + đời sống nên chiếm ≥ 35%')

// ---------- Báo cáo ----------
const byKind = {}
for (const q of questions) byKind[q.kind] = (byKind[q.kind] || 0) + 1
console.log(`Tỉnh: ${provinces.length} · Bộ sưu tập: ${collections.length}`)
console.log(`Câu hỏi: ${questions.length} (thường ${questions.filter(q => q.difficulty === 'normal').length}, công thành ${questions.filter(q => q.difficulty === 'siege').length})`)
console.log(`Theo dạng: ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}`)
console.log(`Theo chủ đề: ${Object.entries(byTopic).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${topics[t] || t} ${n} (${pct(n)}%)`).join(', ')}`)
console.log(`Vị trí đáp án đúng (A/B/C/D): ${dist.join(' / ')}`)
console.log(`Tỉnh đã có câu hỏi: ${covered.length}/34${missing.length ? ` · Chưa có: ${missing.join(', ')}` : ''}`)
console.log(`Có link nguồn: ${questions.filter(q => q.sources).length}/${questions.length} (câu cũ chưa có nguồn: ${questions.filter(q => !q.sources && LEGACY.has(q.id)).length})`)
if (warnings.length) console.log(`\nCảnh báo (${warnings.length}):\n- ${warnings.join('\n- ')}`)
if (errors.length) {
  console.error(`\nLỖI (${errors.length}):\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log('\n✅ Không có lỗi.')
