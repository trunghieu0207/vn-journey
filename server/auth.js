// Phiên đăng nhập theo phòng: người chơi (vào bằng mã phòng + tên), chủ phòng (mã chủ phòng),
// màn chiếu (mã màn chiếu của phòng); phiên quản trị (tài khoản admin, không gắn phòng).
// Token ngẫu nhiên 32 byte; DB chỉ lưu SHA-256 của token. Mã chủ phòng, mật khẩu quản trị băm bằng scrypt.

import { randomBytes, scryptSync, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const SESSION_MS = 12 * 60 * 60_000
export const ADMIN_SESSION_MS = 8 * 60 * 60_000

const sha256 = s => createHash('sha256').update(s).digest()

export function hashSecret(secret) {
  const salt = randomBytes(16)
  const hash = scryptSync(String(secret), salt, 32)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifySecret(secret, stored) {
  const [scheme, salt, hash] = String(stored).split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = scryptSync(String(secret), Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

// So sánh chuỗi bí mật không lộ thông tin qua thời gian phản hồi
export const safeEqual = (a, b) => timingSafeEqual(sha256(String(a)), sha256(String(b)))

export const tokenKey = token => sha256(String(token)).toString('hex')

// Mã hóa được mở lại (AES-256-GCM) — cho mã chủ phòng: quản trị xem lại được, DB / bản sao lưu bị lộ cũng không đọc được nếu không có khóa
export function createSealer(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Khóa mã hóa phải dài 32 byte')
  return {
    seal(text) {
      const iv = randomBytes(12)
      const c = createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()])
      return `gcm$${iv.toString('base64')}$${c.getAuthTag().toString('base64')}$${data.toString('base64')}`
    },
    // Sai khóa / dữ liệu hỏng → null (không ném lỗi ra trang)
    open(sealed) {
      const [scheme, iv, tag, data] = String(sealed ?? '').split('$')
      if (scheme !== 'gcm' || !iv || !tag || !data) return null
      try {
        const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
        d.setAuthTag(Buffer.from(tag, 'base64'))
        return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8')
      } catch {
        return null
      }
    },
  }
}

// Khóa mã hóa: biến SECRET_KEY (64 ký tự hex) hoặc file `path` (tự tạo lần đầu, quyền 600)
export function loadSecretKey(path, envValue) {
  if (envValue) {
    const key = Buffer.from(envValue, 'hex')
    if (key.length !== 32) throw new Error('SECRET_KEY phải là 64 ký tự hex')
    return key
  }
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    writeFileSync(path, randomBytes(32).toString('hex'), { mode: 0o600 })
  }
  return Buffer.from(readFileSync(path, 'utf8').trim(), 'hex')
}

export function createAuth(db, { now = Date.now } = {}) {
  const insert = db.prepare(`INSERT INTO sessions (token_hash, role, room_id, team_id, player_id, no_host, admin_id, expires_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const find = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?')

  // noHost: phiên vào lại bằng tên của người đang giữ quyền chủ phòng — chỉ là người chơi (tên ai cũng biết, không đủ để nhận quyền)
  // adminId: phiên quản trị (role 'sysadmin', không gắn phòng, hết hạn sau 8 giờ)
  function createSession(role, { roomId = null, teamId = null, playerId = null, noHost = false, adminId = null }) {
    const token = randomBytes(32).toString('base64url')
    const ms = role === 'sysadmin' ? ADMIN_SESSION_MS : SESSION_MS
    insert.run(tokenKey(token), role, roomId, teamId, playerId, noHost ? 1 : 0, adminId, now() + ms)
    return { token, maxAgeSec: ms / 1000 }
  }

  // Phiên bị xóa theo khi phòng / người chơi bị xóa (ON DELETE CASCADE)
  function getSession(token) {
    if (!token || token.length > 100) return null
    const s = find.get(tokenKey(token), now()) ?? null
    if (s?.role === 'player') {
      s.player_name = db.prepare('SELECT name FROM players WHERE id = ?').get(s.player_id)?.name ?? null
    }
    if (s?.role === 'sysadmin') {
      // Tài khoản bị khóa giữa chừng → phiên hết hiệu lực ngay
      s.admin = db.prepare('SELECT id, username, display_name, must_change FROM admins WHERE id = ? AND disabled = 0').get(s.admin_id) ?? null
      if (!s.admin) return null
    }
    return s
  }

  const exists = db.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?')
  const isValid = session => !!exists.get(session.token_hash, now())

  function destroySession(token) {
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenKey(token))
  }

  function cleanup() {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now())
  }

  return { createSession, getSession, isValid, destroySession, cleanup }
}
