// Ghi nội dung giả đã "duyệt" cho chế độ Chạy trạm vào var/tram-dev/ để thử trên máy dev.
// Dùng: pnpm run tram:dev-content && TRAM_CONTENT_DIR=var/tram-dev pnpm run dev
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tramFixture } from '../tests/fixtures/tram-content.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'var', 'tram-dev')
mkdirSync(out, { recursive: true })

const periods = [...tramFixture.periods.values()].map(p => ({ ...p, reviewed: true }))
const hints = {}
for (const [province, list] of tramFixture.hints) hints[province] = list.map(h => ({ ...h, reviewed: true }))

writeFileSync(join(out, 'periods.json'), JSON.stringify({ periods }, null, 2))
writeFileSync(join(out, 'key-hints.json'), JSON.stringify({ hints }, null, 2))
console.log(`Đã ghi ${periods.length} thời kỳ và gợi ý cho ${Object.keys(hints).length} tỉnh vào ${out}`)
