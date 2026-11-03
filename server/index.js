// Khởi động server. Chạy: pnpm run dev  (cần tạo DB trước: pnpm run db:init)

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { openDatabase, backupDatabase, upgradeDatabase } from './db.js'
import { config } from './config.js'
import { loadSecretKey } from './auth.js'
import { createApp } from './app.js'

if (!existsSync(config.dbPath)) {
  console.error(`Chưa có database ${config.dbPath}. Chạy "pnpm run db:init" trước.`)
  process.exit(1)
}

const db = openDatabase(config.dbPath)
upgradeDatabase(db) // DB tạo từ bản cũ: thêm cột mới, không mất dữ liệu
// Khóa mã hóa mã chủ phòng (trang quản trị xem lại được): SECRET_KEY hoặc var/secret.key (tự tạo lần đầu, quyền 600)
const secretKey = loadSecretKey(join(dirname(config.dbPath), 'secret.key'), process.env.SECRET_KEY)
const app = createApp({ db, config: { ...config, secretKey } })
if (config.presetRooms && app.sys.settings().presetRooms) app.game.ensurePresetRooms() // phòng chơi đơn có sẵn (tắt được trong trang quản trị)

const server = createServer((req, res) => {
  app.handle(req, res).catch(e => {
    console.error(e)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
})
server.requestTimeout = 30_000
server.headersTimeout = 10_000

const tick = setInterval(app.tick, 1000)

// Sao lưu định kỳ vào var/backups, giữ 12 bản gần nhất
const backupDir = join(dirname(config.dbPath), 'backups')
mkdirSync(backupDir, { recursive: true, mode: 0o700 })
const backup = setInterval(() => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backupDatabase(db, join(backupDir, `backup-${stamp}.db`))
    const files = readdirSync(backupDir).filter(f => f.startsWith('backup-')).sort()
    for (const f of files.slice(0, -12)) rmSync(join(backupDir, f))
  } catch (e) {
    console.error('Sao lưu thất bại:', e.message)
  }
}, config.backupIntervalMin * 60_000)

server.listen(config.port, config.host, () => {
  console.log(`Hành trình 3 miền đang chạy: http://${config.host}:${config.port}`)
  console.log(`  Vào / để tạo phòng hoặc tham gia phòng · Màn chiếu: /screen.html · Chủ phòng (MC): /admin.html`)
  console.log(app.sys.adminCount() ? '  Quản trị: /quan-tri' : '  Quản trị: chưa có tài khoản — tạo bằng "pnpm run admin:create -- <tên-đăng-nhập> <Tên hiển thị>"')
  // Cấu hình hay sai khi deploy: còn để giá trị máy dev → mọi nút bấm (POST) bị từ chối 403 "Yêu cầu không hợp lệ"
  const origin = config.allowedOrigin
  if (config.cookieSecure && !origin.startsWith('https://')) console.warn(`CẢNH BÁO: COOKIE_SECURE=true nhưng ALLOWED_ORIGIN="${origin}" không phải https:// — đặt ALLOWED_ORIGIN=https://<domain>`)
  if (origin.endsWith('/')) console.warn(`CẢNH BÁO: ALLOWED_ORIGIN="${origin}" có dấu "/" ở cuối — bỏ đi, không thì mọi nút bấm bị từ chối`)
  if (config.trustProxy && /127\.0\.0\.1|localhost/.test(origin)) console.warn(`CẢNH BÁO: TRUST_PROXY=true (chạy sau Nginx) nhưng ALLOWED_ORIGIN vẫn là "${origin}" — đặt ALLOWED_ORIGIN=https://<domain>`)
})

function shutdown() {
  clearInterval(tick)
  clearInterval(backup)
  app.hub.close()
  server.close(() => {
    db.close()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
