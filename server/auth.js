// Phiên đăng nhập theo phòng: người chơi (vào bằng mã phòng + tên), chủ phòng (mã chủ phòng),
// màn chiếu (mã màn chiếu của phòng).
// Token ngẫu nhiên 32 byte; DB chỉ lưu SHA-256 của token. Mã chủ phòng băm bằng scrypt.

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

const SESSION_MS = 12 * 60 * 60_000

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

export function createAuth(db, { now = Date.now } = {}) {
  const insert = db.prepare(`INSERT INTO sessions (token_hash, role, room_id, team_id, player_id, no_host, expires_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`)
  const find = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?')

  // noHost: phiên vào lại bằng tên của người đang giữ quyền chủ phòng — chỉ là người chơi (tên ai cũng biết, không đủ để nhận quyền)
  function createSession(role, { roomId, teamId = null, playerId = null, noHost = false }) {
    const token = randomBytes(32).toString('base64url')
    insert.run(tokenKey(token), role, roomId, teamId, playerId, noHost ? 1 : 0, now() + SESSION_MS)
    return { token, maxAgeSec: SESSION_MS / 1000 }
  }

  // Phiên bị xóa theo khi phòng / người chơi bị xóa (ON DELETE CASCADE)
  function getSession(token) {
    if (!token || token.length > 100) return null
    const s = find.get(tokenKey(token), now()) ?? null
    if (s?.role === 'player') {
      s.player_name = db.prepare('SELECT name FROM players WHERE id = ?').get(s.player_id)?.name ?? null
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
