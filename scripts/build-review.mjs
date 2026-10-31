// Dựng lại dữ liệu nhúng trong docs/questions-review.html từ data/*.json (trang duyệt câu hỏi, mở bằng trình duyệt).
// Chỉ đọc data/ và ghi đúng file docs/questions-review.html; không gọi mạng.
//
// Cách dùng: pnpm run review:build

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = name => JSON.parse(readFileSync(join(ROOT, 'data', name), 'utf8'))
const { provinces } = readJson('provinces.json')
const { topics, questions } = readJson('questions.json')

const data = {
  topics,
  provinces: Object.fromEntries(provinces.map(p => [p.id, { name: p.name, region: p.region }])),
  order: provinces.map(p => p.id),
  questions,
}
// Nhúng an toàn trong <script>: không để chuỗi "</script" trong dữ liệu đóng thẻ sớm
const json = JSON.stringify(data).replace(/</g, '\\u003c')

const file = join(ROOT, 'docs', 'questions-review.html')
const html = readFileSync(file, 'utf8')
const re = /^const DATA = .*;$/m
if (!re.test(html)) throw new Error('Không tìm thấy dòng "const DATA = …;" trong questions-review.html')
writeFileSync(file, html.replace(re, () => `const DATA = ${json};`))
console.log(`Đã cập nhật docs/questions-review.html: ${questions.length} câu (${questions.filter(q => q.sources).length} có link nguồn)`)
