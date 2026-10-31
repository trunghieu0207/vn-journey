// Tạo database SQLite từ db/schema.sql và nạp dữ liệu tĩnh từ data/*.json.
// Chỉ dùng module built-in của Node (node:sqlite). Không gọi mạng.
//
// Cách dùng:
//   pnpm run db:init     → tạo mới; dừng lại nếu DB đã tồn tại
//   pnpm run db:reset    → xóa DB cũ (chỉ trong thư mục var/ của project) rồi tạo lại

import { existsSync, mkdirSync, rmSync, chmodSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { ROOT, openDatabase, seedDatabase } from '../server/db.js'

const VAR_DIR = join(ROOT, 'var')
const dbPath = resolve(ROOT, process.env.DB_PATH || 'var/game.db')
const reset = process.argv.includes('--reset')

// An toàn: chỉ cho phép DB nằm trong var/ của project, để --reset không thể xóa nhầm file khác
const rel = relative(VAR_DIR, dbPath)
if (rel.startsWith('..') || isAbsolute(rel)) {
  console.error(`DB_PATH phải nằm trong ${VAR_DIR} (đang là ${dbPath})`)
  process.exit(1)
}

if (existsSync(dbPath)) {
  if (!reset) {
    console.error(`Đã có ${relative(ROOT, dbPath)}. Dùng "pnpm run db:reset" nếu muốn xóa và tạo lại.`)
    process.exit(1)
  }
  for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true })
}

mkdirSync(VAR_DIR, { recursive: true, mode: 0o700 })
chmodSync(VAR_DIR, 0o700)
const db = openDatabase(dbPath)
chmodSync(dbPath, 0o600)

try {
  seedDatabase(db)
} catch (e) {
  db.close()
  for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true })
  console.error(`Nạp dữ liệu thất bại, đã xóa DB dở dang: ${e.message}`)
  process.exit(1)
}

const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
console.log(`Đã tạo ${relative(ROOT, dbPath)}: ${count('provinces')} tỉnh, ${count('adjacency') / 2} cặp giáp ranh, ` +
  `${count('collections')} bộ sưu tập, ${count('questions')} câu hỏi.`)
db.close()
