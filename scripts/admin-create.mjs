// Tạo tài khoản quản trị (dùng cho tài khoản đầu tiên, hoặc khi quên hết mật khẩu). Chạy trên máy chủ:
//   pnpm run admin:create -- <tên-đăng-nhập> "<Tên hiển thị>"
// In ra mật khẩu tạm (chỉ hiện một lần) — lần đầu đăng nhập /quan-tri phải đổi.
// Không nhận mật khẩu qua tham số dòng lệnh (lộ trong lịch sử shell).

import { existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { ROOT, openDatabase } from '../server/db.js'
import { createSysadmin } from '../server/sysadmin.js'
import { GameError } from '../server/game.js'

const dbPath = resolve(ROOT, process.env.DB_PATH || 'var/game.db')
const [username, ...rest] = process.argv.slice(2).filter(a => a !== '--') // pnpm truyền nguyên dấu -- vào
if (!username) {
  console.error('Cách dùng: pnpm run admin:create -- <tên-đăng-nhập> "<Tên hiển thị>"')
  process.exit(1)
}
if (!existsSync(dbPath)) {
  console.error(`Chưa có database ${relative(ROOT, dbPath)}. Chạy "pnpm run db:init" trước.`)
  process.exit(1)
}

const db = openDatabase(dbPath)
// Chỉ dùng phần tài khoản — không cần game, realtime, khóa mã hóa
const sys = createSysadmin({ db, game: null, hub: null, sealer: null })
try {
  const a = sys.createAdmin({ username, displayName: rest.join(' ') })
  console.log(`Đã tạo tài khoản quản trị "${a.username}" (${a.displayName}).`)
  console.log(`Mật khẩu tạm: ${a.tempPassword}`)
  console.log('Đăng nhập /quan-tri bằng mật khẩu này rồi đổi mật khẩu mới (ít nhất 12 ký tự). Mật khẩu tạm không hiện lại.')
} catch (e) {
  console.error(e instanceof GameError ? e.message : e)
  process.exitCode = 1
} finally {
  db.close()
}
