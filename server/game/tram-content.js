// Nội dung chế độ "Chạy trạm": thời kỳ lịch sử (data/periods.json) và gợi ý theo tỉnh (data/key-hints.json).
// Chỉ nạp mục đã duyệt (reviewed === true). File rỗng là hợp lệ.

import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

// dir: thư mục chứa 2 file; mặc định là data/ ở gốc repo
export function loadTramContent(dir = join(ROOT, 'data')) {
  const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'))
  const periods = new Map()
  for (const p of read('periods.json').periods ?? []) {
    if (p.reviewed === true) periods.set(p.id, p)
  }
  const hints = new Map()
  for (const [province, list] of Object.entries(read('key-hints.json').hints ?? {})) {
    const ok = (list ?? []).filter(h => h.reviewed === true)
    if (ok.some(h => h.level === 1)) hints.set(province, ok) // cần mức 1: giveHint / luật cứu chỉ bắt đầu từ mức 1
  }
  return { periods, hints }
}
