// Kiểm tra dữ liệu tỉnh + câu hỏi trước khi nạp vào DB.
// Chỉ đọc file trong thư mục data/, không ghi, không gọi mạng. Chỉ dùng module built-in của Node.
//
// Cách dùng: node scripts/validate-data.mjs

import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeText } from '../server/game/rules.js'
import { ICON_NAMES } from '../public/shared/icons.js'

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
  if (q.status !== undefined && !['new', 'ok', 'fix'].includes(q.status)) err(`${where}: status phải là new / ok / fix`)
  if (q.hidden !== undefined && typeof q.hidden !== 'boolean') err(`${where}: hidden phải là true/false`)
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

// ---------- Chạy trạm: thời kỳ + gợi ý (file rỗng hợp lệ) ----------
const httpsOk = u => { try { return new URL(u).protocol === 'https:' } catch { return false } }
const checkSources = (where, sources, min) => {
  if (!Array.isArray(sources) || sources.length < min) err(`${where}: cần ít nhất ${min} link nguồn`)
  else for (const u of sources) if (!httpsOk(u)) err(`${where}: link nguồn không hợp lệ (${u})`)
}
const periods = readJson('periods.json').periods ?? []
const periodIds = new Set()
for (const p of periods) {
  const where = `Thời kỳ ${p.id}`
  if (periodIds.has(p.id)) err(`${where}: trùng id`)
  periodIds.add(p.id)
  for (const f of ['id', 'name', 'years']) if (!p[f]) err(`${where}: thiếu ${f}`)
  const sc = p.scene
  if (!sc || !sc.color || !sc.blurb || !Array.isArray(sc.icons) || sc.icons.length !== 3) err(`${where}: scene cần color, blurb và 3 icons`)
  else for (const n of sc.icons) if (!ICON_NAMES.includes(n)) err(`${where}: icon "${n}" chưa có trong public/shared/icons.js`)
  if (!Array.isArray(p.questions) || !p.questions.length) err(`${where}: thiếu questions`)
  for (const q of p.questions ?? []) {
    const w = `${where} câu ${q.id}`
    if (!q.id || !q.content) err(`${w}: thiếu id/content`)
    if (q.kind !== 'choice') err(`${w}: kind phải là choice`)
    if (!Array.isArray(q.options) || q.options.length !== 4) err(`${w}: cần đúng 4 lựa chọn`)
    else if (new Set(q.options).size !== 4) err(`${w}: lựa chọn bị trùng`)
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) err(`${w}: answer ngoài phạm vi`)
    if (!q.explanation) err(`${w}: thiếu explanation`)
    if (![1, 2, 3].includes(q.level)) err(`${w}: level phải là 1, 2 hoặc 3`)
    checkSources(w, q.sources, 2)
  }
  const pz = p.puzzle
  if (!pz || !pz.text || !pz.explanation) err(`${where}: puzzle thiếu text/explanation`)
  else {
    checkSources(`${where} puzzle`, pz.sources, 2)
    const flat = s => String(s).split(/\s+/).filter(Boolean).join(' ')
    for (let n = 3; n <= 7; n++) {
      const parts = pz.splits?.[n]
      if (!Array.isArray(parts) || parts.length !== n) err(`${where}: puzzle.splits[${n}] phải có ${n} mảnh`)
      else if (flat(parts.join(' ')) !== flat(pz.text)) err(`${where}: puzzle.splits[${n}] nối lại không khớp puzzle.text`)
    }
  }
}
const hintFile = readJson('key-hints.json').hints ?? {}
let hintCount = 0
for (const [pid, list] of Object.entries(hintFile)) {
  const prov = provinces.find(p => p.id === pid)
  if (!prov) { err(`Gợi ý: tỉnh không tồn tại (${pid})`); continue }
  const banned = [prov.name, ...prov.mergedFrom, prov.adminCenterAt].filter(Boolean).map(normalizeText).filter(Boolean)
  for (const [i, h] of (list ?? []).entries()) {
    hintCount++
    const w = `Gợi ý ${pid}#${i + 1}`
    if (![1, 2].includes(h.level)) err(`${w}: level phải là 1 hoặc 2`)
    if (!h.text || h.text.length > 200) err(`${w}: text bắt buộc và ≤ 200 ký tự`)
    checkSources(w, h.sources, 1)
    const t = ` ${normalizeText(h.text ?? '')} `
    for (const b of banned) if (t.includes(` ${b} `)) err(`${w}: lộ tên "${b}"`)
  }
}

// ---------- Báo cáo ----------
const byKind = {}
for (const q of questions) byKind[q.kind] = (byKind[q.kind] || 0) + 1
console.log(`Tỉnh: ${provinces.length} · Bộ sưu tập: ${collections.length}`)
console.log(`Câu hỏi: ${questions.length} (thường ${questions.filter(q => q.difficulty === 'normal').length}, công thành ${questions.filter(q => q.difficulty === 'siege').length})`)
console.log(`Theo dạng: ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}`)
console.log(`Theo chủ đề: ${Object.entries(byTopic).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${topics[t] || t} ${n} (${pct(n)}%)`).join(', ')}`)
console.log(`Vị trí đáp án đúng (A/B/C/D): ${dist.join(' / ')}`)
console.log(`Tỉnh đã có câu hỏi: ${covered.length}/34${missing.length ? ` · Chưa có: ${missing.join(', ')}` : ''}`)
console.log(`Chạy trạm: ${periods.length} thời kỳ, ${hintCount} gợi ý`)
console.log(`Có link nguồn: ${questions.filter(q => q.sources).length}/${questions.length} (câu cũ chưa có nguồn: ${questions.filter(q => !q.sources && LEGACY.has(q.id)).length})`)
if (warnings.length) console.log(`\nCảnh báo (${warnings.length}):\n- ${warnings.join('\n- ')}`)
if (errors.length) {
  console.error(`\nLỖI (${errors.length}):\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log('\n✅ Không có lỗi.')
