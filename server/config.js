// Đọc cấu hình từ biến môi trường (nạp bằng `node --env-file=.env`).

import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { ROOT } from './db.js'

const env = process.env
const int = (v, d) => (Number.isInteger(Number(v)) && v !== '' && v != null ? Number(v) : d)

// Mật khẩu/mã ngẫu nhiên dễ đọc (bỏ ký tự dễ nhầm: 0 O 1 I l)
export function randomCode(length, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') {
  const bytes = randomBytes(length)
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}

export const config = {
  host: env.HOST || '127.0.0.1',
  port: int(env.PORT, 3000),
  dbPath: resolve(ROOT, env.DB_PATH || 'var/game.db'),
  backupIntervalMin: int(env.BACKUP_INTERVAL_MIN, 5),
  cookieSecure: env.COOKIE_SECURE === 'true',
  allowedOrigin: env.ALLOWED_ORIGIN || `http://127.0.0.1:${int(env.PORT, 3000)}`,
  // Chạy sau Nginx: IP thật của người dùng lấy từ header X-Real-IP do Nginx đặt (không thì mọi người chung IP 127.0.0.1 → chung giới hạn tần suất).
  // Chỉ bật khi Node bind 127.0.0.1 sau proxy — để trần ra Internet thì ai cũng tự đặt header này được
  trustProxy: env.TRUST_PROXY === 'true',
  gameDurationMin: int(env.GAME_DURATION_MIN, 45),
  freezeBeforeEndMin: int(env.FREEZE_BEFORE_END_MIN, 10),
  presetRooms: env.PRESET_ROOMS !== '0', // phòng chơi đơn có sẵn (RULES.presetRooms); PRESET_ROOMS=0 để tắt
}
