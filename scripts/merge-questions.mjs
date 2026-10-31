// Gộp câu hỏi mới (đã kiểm chứng chéo) vào data/questions.json.
// Chỉ nhận batch có cả file -new.json và -verify.json. ok → giữ; fix → áp các trường sửa; drop → bỏ.
// Câu không có kết luận kiểm chứng → KHÔNG gộp (báo ra).
// Cách dùng: node scripts/merge-questions.mjs <thư mục có batch-N-new.json + batch-N-verify.json> data/questions.json [--write]
// Không có --write: chỉ chạy thử, in báo cáo. Quy trình đầy đủ: docs/question-sourcing/README.md
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [dir, target, flag] = process.argv.slice(2)
const data = JSON.parse(readFileSync(target, 'utf8'))
const have = new Set(data.questions.map(q => q.id))
const ALLOWED_FIX = new Set(['content', 'options', 'answer', 'explanation', 'sources', 'level', 'topic'])

const accepted = []
const report = { ok: 0, fix: 0, drop: [], noVerdict: [], badFix: [] }
for (let b = 1; b <= 40; b++) {
  const nf = join(dir, `batch-${b}-new.json`), vf = join(dir, `batch-${b}-verify.json`)
  if (!existsSync(nf) && !existsSync(vf)) continue
  if (!existsSync(nf) || !existsSync(vf)) { console.log(`batch-${b}: chưa đủ file, bỏ qua`); continue }
  const qs = JSON.parse(readFileSync(nf, 'utf8'))
  const verdicts = new Map(JSON.parse(readFileSync(vf, 'utf8')).map(v => [v.id, v]))
  for (const q of qs) {
    const v = verdicts.get(q.id)
    if (!v) { report.noVerdict.push(q.id); continue }
    if (v.verdict === 'drop') { report.drop.push(`${q.id}: ${v.issue ?? ''}`); continue }
    if (v.verdict === 'fix') {
      const keys = Object.keys(v.fix ?? {})
      if (!keys.length || keys.some(k => !ALLOWED_FIX.has(k))) { report.badFix.push(`${q.id}: ${JSON.stringify(v.fix)}`); continue }
      Object.assign(q, v.fix)
      report.fix++
    } else if (v.verdict === 'ok') report.ok++
    else { report.noVerdict.push(`${q.id} (verdict lạ: ${v.verdict})`); continue }
    if (have.has(q.id)) { report.badFix.push(`${q.id}: trùng id với câu đã có`); continue }
    accepted.push(q)
  }
}

// Chèn vào sau câu cuối cùng của cùng tỉnh (giữ thứ tự theo tỉnh), thường trước công thành
const rank = q => (q.difficulty === 'siege' ? 1 : 0)
const byProvince = new Map()
for (const q of [...data.questions, ...accepted]) {
  if (!byProvince.has(q.province)) byProvince.set(q.province, [])
  byProvince.get(q.province).push(q)
}
const merged = [...byProvince.values()].flatMap(list => list.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id)))

console.log(`Giữ nguyên ${report.ok}, sửa ${report.fix}, bỏ ${report.drop.length}, chưa có kết luận ${report.noVerdict.length}, sửa không hợp lệ ${report.badFix.length}`)
console.log(`Gộp thêm ${accepted.length} câu → tổng ${merged.length}`)
if (report.drop.length) console.log('Bỏ:\n- ' + report.drop.join('\n- '))
if (report.noVerdict.length) console.log('Chưa có kết luận:\n- ' + report.noVerdict.join('\n- '))
if (report.badFix.length) console.log('Sửa không hợp lệ (cần xem tay):\n- ' + report.badFix.join('\n- '))

if (flag === '--write') {
  // Ghi lại, mỗi câu một khối như định dạng gốc
  const head = JSON.stringify({ version: data.version, note: data.note, topics: data.topics }, null, 2).slice(0, -2)
  // Cùng kiểu dòng gốc: {"id": "…", "province": "…", …} — có khoảng trắng sau dấu : và ,
  const val = v => (Array.isArray(v) ? '[' + v.map(x => JSON.stringify(x)).join(', ') + ']' : JSON.stringify(v))
  const line = q => '{' + Object.entries(q).map(([k, v]) => JSON.stringify(k) + ': ' + val(v)).join(', ') + '}'
  const body = merged.map(q => '    ' + line(q)).join(',\n')
  const out = `${head},\n  "legacyUnsourced": ${val(data.legacyUnsourced)},\n  "questions": [\n${body}\n  ]\n}\n`
  JSON.parse(out)
  writeFileSync(target, out)
  console.log(`Đã ghi ${target}`)
}
