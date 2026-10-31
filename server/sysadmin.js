// Trang quản trị (/quan-tri): tài khoản admin (một vai trò), đăng nhập, xem / sửa mọi phòng, người chơi,
// bảng xếp hạng cá nhân, nhật ký thao tác. Điều khiển trận của một phòng dùng lại trang chủ phòng (phiên chủ phòng cấp cho admin).

import { randomCode } from './config.js'
import { hashSecret, verifySecret } from './auth.js'
import { GameError, RULES, normalizeText } from './game.js'
import { cleanName } from './game/rules.js'
import { transaction } from './db.js'

export const ADMIN_RULES = {
  maxFails: 5,
  lockMs: 15 * 60_000,
  minPassword: 12,
  logKeepMs: 30 * 24 * 3_600_000,
}

const USERNAME = /^[a-z0-9._-]{3,32}$/
// Mật khẩu tạm: 12 ký tự dễ đọc, chia 3 nhóm (vd. R7KQ-2MXP-9TZ4)
const tempPassword = () => [4, 4, 4].map(n => randomCode(n)).join('-')
// Băm sẵn để tên đăng nhập không tồn tại vẫn tốn thời gian như khi có (không dò được tên nào tồn tại)
const DUMMY_HASH = hashSecret('dummy-admin-password')

export function createSysadmin({ db, now = Date.now, game, hub, sealer, newCode = randomCode }) {
  const getAdmin = id => db.prepare('SELECT * FROM admins WHERE id = ?').get(Number(id))

  function log(admin, action, detail = '') {
    db.prepare('INSERT INTO admin_log (admin_id, admin_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(admin?.id ?? null, admin?.username ?? '', action, String(detail).slice(0, 300), now())
  }

  // ---------- Tài khoản ----------
  const adminCount = () => db.prepare('SELECT COUNT(*) AS n FROM admins').get().n

  function checkPassword(password) {
    if (typeof password !== 'string' || [...password].length < ADMIN_RULES.minPassword) {
      throw new GameError('weak-password', `Mật khẩu cần ít nhất ${ADMIN_RULES.minPassword} ký tự`)
    }
    if (password.length > 200) throw new GameError('weak-password', 'Mật khẩu quá dài')
  }

  // Tạo tài khoản với mật khẩu tạm (phải đổi lần đầu đăng nhập). Trả về mật khẩu tạm — chỉ hiện một lần
  function createAdmin({ username, displayName }, by = null) {
    const user = String(username ?? '').trim().toLowerCase()
    if (!USERNAME.test(user)) throw new GameError('bad-username', 'Tên đăng nhập 3–32 ký tự: chữ thường không dấu, số, dấu chấm, gạch')
    const name = cleanName(displayName, 40) || user
    if (db.prepare('SELECT 1 FROM admins WHERE username = ?').get(user)) throw new GameError('username-taken', 'Tên đăng nhập đã có', 409)
    const password = tempPassword()
    const { lastInsertRowid } = db.prepare(`INSERT INTO admins (username, display_name, password_hash, must_change, created_at)
                                            VALUES (?, ?, ?, 1, ?)`).run(user, name, hashSecret(password), now())
    log(by, 'admin-create', `Tạo tài khoản ${user}`)
    return { id: Number(lastInsertRowid), username: user, displayName: name, tempPassword: password }
  }

  // Sai 5 lần liên tiếp → khóa 15 phút. Tên không tồn tại / mật khẩu sai: cùng một thông báo
  function login(username, password) {
    const user = String(username ?? '').trim().toLowerCase().slice(0, 64)
    const a = db.prepare('SELECT * FROM admins WHERE username = ?').get(user)
    const ok = verifySecret(String(password ?? '').slice(0, 200), a?.password_hash ?? DUMMY_HASH)
    if (a && a.locked_until && a.locked_until > now()) {
      throw new GameError('locked', 'Tài khoản tạm khóa do đăng nhập sai nhiều lần, thử lại sau ít phút', 429)
    }
    if (!a || a.disabled || !ok) {
      if (a && !a.disabled) {
        const fails = a.failed_count + 1
        const lock = fails >= ADMIN_RULES.maxFails
        db.prepare('UPDATE admins SET failed_count = ?, locked_until = ? WHERE id = ?')
          .run(lock ? 0 : fails, lock ? now() + ADMIN_RULES.lockMs : null, a.id)
        if (lock) log(null, 'admin-locked', `Khóa ${a.username} 15 phút sau ${ADMIN_RULES.maxFails} lần sai`)
      }
      throw new GameError('bad-login', 'Sai tên đăng nhập hoặc mật khẩu', 401)
    }
    db.prepare('UPDATE admins SET failed_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(now(), a.id)
    log(a, 'login', 'Đăng nhập')
    return a
  }

  function changePassword(adminId, current, next) {
    const a = getAdmin(adminId)
    if (!a || !verifySecret(String(current ?? ''), a.password_hash)) throw new GameError('bad-password', 'Mật khẩu hiện tại không đúng', 400)
    checkPassword(next)
    if (next === current) throw new GameError('same-password', 'Mật khẩu mới phải khác mật khẩu cũ')
    db.prepare('UPDATE admins SET password_hash = ?, must_change = 0 WHERE id = ?').run(hashSecret(next), a.id)
    log(a, 'password', 'Đổi mật khẩu')
    return { ok: true }
  }

  // Đặt lại mật khẩu người khác: cấp mật khẩu tạm, đăng xuất mọi phiên của người đó
  function resetPassword(adminId, by) {
    const a = getAdmin(adminId)
    if (!a) throw new GameError('no-admin', 'Không tìm thấy tài khoản', 404)
    if (a.id === by.id) throw new GameError('self', 'Tự đổi mật khẩu của mình ở mục Đổi mật khẩu')
    const password = tempPassword()
    transaction(db, () => {
      db.prepare('UPDATE admins SET password_hash = ?, must_change = 1, failed_count = 0, locked_until = NULL WHERE id = ?').run(hashSecret(password), a.id)
      db.prepare("DELETE FROM sessions WHERE role = 'sysadmin' AND admin_id = ?").run(a.id)
    })
    log(by, 'admin-reset', `Đặt lại mật khẩu ${a.username}`)
    return { tempPassword: password }
  }

  function setDisabled(adminId, disabled, by) {
    const a = getAdmin(adminId)
    if (!a) throw new GameError('no-admin', 'Không tìm thấy tài khoản', 404)
    if (a.id === by.id) throw new GameError('self', 'Không tự khóa tài khoản của mình')
    transaction(db, () => {
      db.prepare('UPDATE admins SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, a.id)
      if (disabled) db.prepare("DELETE FROM sessions WHERE role = 'sysadmin' AND admin_id = ?").run(a.id)
    })
    log(by, disabled ? 'admin-disable' : 'admin-enable', `${disabled ? 'Khóa' : 'Mở khóa'} ${a.username}`)
    return { ok: true }
  }

  const listAdmins = () => db.prepare(`SELECT id, username, display_name AS displayName, must_change AS mustChange, disabled,
                                              locked_until AS lockedUntil, created_at AS createdAt, last_login_at AS lastLoginAt
                                       FROM admins ORDER BY id`).all()
    .map(a => ({ ...a, mustChange: !!a.mustChange, disabled: !!a.disabled, locked: !!a.lockedUntil && a.lockedUntil > now() }))

  // ---------- Phòng ----------
  function requireRoom(roomId) {
    const r = db.prepare('SELECT * FROM rooms WHERE id = ?').get(Number(roomId))
    if (!r) throw new GameError('no-room', 'Phòng không còn (đã xóa hoặc hết 24 giờ)', 404)
    return r
  }

  function rooms() {
    return db.prepare(`SELECT r.id, r.code, r.name, r.mode, r.status, r.listed, r.preset, r.duration_min AS durationMin, r.quiz_count AS quizCount,
                              r.bet_choice AS betChoice, r.topic_choice AS topicChoice, r.pioneer, r.created_at AS createdAt,
                              r.started_at AS startedAt, r.ends_at AS endsAt, r.paused_at AS pausedAt,
                              (SELECT COUNT(*) FROM players p WHERE p.room_id = r.id) AS players,
                              (SELECT COUNT(*) FROM teams t WHERE t.room_id = r.id) AS teams
                       FROM rooms r ORDER BY (r.status = 'ended'), r.created_at DESC`).all()
      .map(r => ({ ...r, listed: !!r.listed, betChoice: !!r.betChoice, topicChoice: !!r.topicChoice, pioneer: !!r.pioneer,
        online: hub.roomOnline(r.id) }))
  }

  // Mã của phòng: mã phòng, mã màn chiếu, mã chủ phòng (mở bản mã hóa). Ghi nhật ký vì là thông tin bí mật
  function roomCodes(roomId, by) {
    const r = requireRoom(roomId)
    log(by, 'room-codes', `Xem mã phòng "${r.name}" (${r.code})`)
    return { code: r.code, screenCode: r.screen_code, ownerKey: sealer.open(r.owner_key_sealed) }
  }

  // Tạo mã chủ phòng mới: mã cũ hết hiệu lực, các phiên chủ phòng đang mở bị đăng xuất
  function rotateOwnerKey(roomId, by) {
    const r = requireRoom(roomId)
    const key = newCode(8)
    transaction(db, () => {
      db.prepare('UPDATE rooms SET owner_key_hash = ?, owner_key_sealed = ? WHERE id = ?').run(hashSecret(key), sealer.seal(key), r.id)
      db.prepare("DELETE FROM sessions WHERE role = 'owner' AND room_id = ?").run(r.id)
    })
    log(by, 'room-owner-key', `Tạo mã chủ phòng mới cho "${r.name}" (${r.code})`)
    return { ownerKey: key }
  }

  function createRoom(opts, by) {
    const r = game.createRoom(opts)
    log(by, 'room-create', `Tạo phòng "${cleanName(opts.name, RULES.roomNameMaxLength)}" (${r.code})`)
    return r
  }

  // Sửa cấu hình: tên, hiển thị, đặt cược, chọn chủ đề sửa lúc nào cũng được; thời lượng + số câu mỗi tỉnh chỉ trước khi bắt đầu.
  // Kiểu phòng và số team không đổi được (đã có người chọn team)
  function updateRoom(roomId, body, by) {
    const r = requireRoom(roomId)
    const sets = {}
    if ('name' in body) {
      const name = cleanName(body.name, RULES.roomNameMaxLength)
      if (!name) throw new GameError('bad-room', 'Cần đặt tên phòng')
      sets.name = name
    }
    if ('listed' in body) {
      if (r.preset) throw new GameError('bad-room', 'Phòng có sẵn luôn hiện trong danh sách')
      sets.listed = body.listed === true ? 1 : 0
    }
    if ('betChoice' in body) sets.bet_choice = body.betChoice === true ? 1 : 0
    if ('topicChoice' in body) sets.topic_choice = body.topicChoice === true ? 1 : 0
    for (const [key, col, range, label] of [['durationMin', 'duration_min', RULES.durationMin, 'Thời lượng'], ['quizCount', 'quiz_count', RULES.quizCount, 'Số câu mỗi tỉnh']]) {
      if (!(key in body)) continue
      const v = Number(body[key])
      if (v === r[col]) continue
      if (r.status !== 'waiting') throw new GameError('started', `${label} chỉ sửa được trước khi bắt đầu`, 409)
      if (!Number.isInteger(v) || v < range.min || v > range.max) throw new GameError('bad-room', `${label} phải từ ${range.min} đến ${range.max}`)
      sets[col] = v
    }
    const cols = Object.keys(sets)
    if (!cols.length) return { ok: true }
    db.prepare(`UPDATE rooms SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map(c => sets[c]), r.id)
    log(by, 'room-update', `Sửa phòng "${sets.name ?? r.name}" (${r.code}): ${cols.join(', ')}`)
    return { ok: true }
  }

  // Xóa hẳn phòng (người chơi, phiên, điểm xóa theo). Bảng xếp hạng cá nhân đã ghi thì giữ
  function deleteRoom(roomId, by) {
    const r = requireRoom(roomId)
    db.prepare('DELETE FROM rooms WHERE id = ?').run(r.id)
    log(by, 'room-delete', `Xóa phòng "${r.name}" (${r.code})`)
    return { ok: true }
  }

  // ---------- Người chơi ----------
  function players() {
    const list = db.prepare(`SELECT p.id, p.name, p.room_id AS roomId, r.name AS roomName, r.code AS roomCode, r.mode, r.status,
                                    t.id AS teamId, t.name AS teamName, t.color, t.mascot, p.created_at AS joinedAt
                             FROM players p JOIN rooms r ON r.id = p.room_id JOIN teams t ON t.id = p.team_id
                             ORDER BY r.created_at DESC, p.id`).all()
    const scoreCache = new Map()
    const scoreOf = (roomId, teamId) => {
      if (!scoreCache.has(roomId)) scoreCache.set(roomId, new Map(game.room(roomId).scores().map(s => [s.teamId, s.total])))
      return scoreCache.get(roomId).get(teamId) ?? 0
    }
    return list.map(p => ({ ...p, score: p.status === 'waiting' ? 0 : scoreOf(p.roomId, p.teamId), online: hub.isOnline(p.id) }))
  }

  function renamePlayer(playerId, name, by) {
    const p = db.prepare('SELECT p.room_id, p.name, r.code FROM players p JOIN rooms r ON r.id = p.room_id WHERE p.id = ?').get(Number(playerId))
    if (!p) throw new GameError('no-player', 'Không tìm thấy người chơi', 404)
    const res = game.room(p.room_id).renamePlayer(playerId, name)
    log(by, 'player-rename', `Đổi tên "${p.name}" → "${res.name}" (phòng ${p.code})`)
    return { ...res, roomId: p.room_id }
  }

  function kickPlayer(playerId, by) {
    const p = db.prepare('SELECT p.room_id, p.name, r.code FROM players p JOIN rooms r ON r.id = p.room_id WHERE p.id = ?').get(Number(playerId))
    if (!p) throw new GameError('no-player', 'Không tìm thấy người chơi', 404)
    game.room(p.room_id).kickPlayer(playerId)
    log(by, 'player-kick', `Mời "${p.name}" ra khỏi phòng ${p.code}`)
    return { ok: true, roomId: p.room_id }
  }

  // ---------- Bảng xếp hạng cá nhân ----------
  // Gồm cả người đang ẩn; thao tác theo name_key (mọi trận của người đó)
  function leaderboard() {
    const since = now() - RULES.leaderboardKeepMs
    return db.prepare(`SELECT name_key AS nameKey,
                              (SELECT name FROM leaderboard l2 WHERE l2.name_key = l.name_key ORDER BY played_at DESC, id DESC LIMIT 1) AS name,
                              SUM(score) AS score, SUM(stamps) AS stamps, COUNT(*) AS games, MAX(played_at) AS lastPlayed, MAX(hidden) AS hidden
                       FROM leaderboard l WHERE played_at >= ? GROUP BY name_key ORDER BY score DESC, stamps DESC, lastPlayed`).all(since)
      .map(e => ({ ...e, hidden: !!e.hidden }))
  }

  function requireBoardName(nameKey) {
    const row = db.prepare('SELECT name FROM leaderboard WHERE name_key = ? ORDER BY played_at DESC LIMIT 1').get(String(nameKey ?? ''))
    if (!row) throw new GameError('no-entry', 'Không tìm thấy tên này trên bảng xếp hạng', 404)
    return row
  }

  // Đổi tên mọi trận của một người. Tên mới trùng người khác thì gộp làm một (cộng dồn)
  function renameBoard(nameKey, newName, by) {
    const old = requireBoardName(nameKey)
    const name = cleanName(newName, RULES.playerNameMaxLength)
    if (!name) throw new GameError('bad-name', 'Nhập tên mới')
    const key = normalizeText(name) || name.toLowerCase()
    db.prepare('UPDATE leaderboard SET name = ?, name_key = ? WHERE name_key = ?').run(name, key, String(nameKey))
    log(by, 'board-rename', `Bảng xếp hạng: "${old.name}" → "${name}"`)
    return { ok: true, nameKey: key }
  }

  function hideBoard(nameKey, hidden, by) {
    const old = requireBoardName(nameKey)
    db.prepare('UPDATE leaderboard SET hidden = ? WHERE name_key = ?').run(hidden ? 1 : 0, String(nameKey))
    log(by, hidden ? 'board-hide' : 'board-show', `Bảng xếp hạng: ${hidden ? 'ẩn' : 'hiện lại'} "${old.name}"`)
    return { ok: true }
  }

  function deleteBoard(nameKey, by) {
    const old = requireBoardName(nameKey)
    db.prepare('DELETE FROM leaderboard WHERE name_key = ?').run(String(nameKey))
    log(by, 'board-delete', `Bảng xếp hạng: xóa "${old.name}"`)
    return { ok: true }
  }

  // ---------- Tổng quan + nhật ký ----------
  function overview() {
    const count = sql => db.prepare(sql).get().n
    const dayStart = new Date(now()).setHours(0, 0, 0, 0)
    return {
      serverNow: now(),
      rooms: {
        running: count("SELECT COUNT(*) AS n FROM rooms WHERE status IN ('running', 'paused')"),
        waiting: count("SELECT COUNT(*) AS n FROM rooms WHERE status = 'waiting'"),
        ended: count("SELECT COUNT(*) AS n FROM rooms WHERE status = 'ended'"),
        max: RULES.maxOpenRooms,
      },
      players: count('SELECT COUNT(*) AS n FROM players'),
      online: hub.size(),
      playsToday: db.prepare('SELECT COUNT(*) AS n FROM leaderboard WHERE played_at >= ?').get(dayStart).n,
      log: listLog(8),
    }
  }

  const listLog = (limit = 200) => db.prepare(`SELECT admin_name AS by, action, detail, created_at AS at FROM admin_log
                                               ORDER BY id DESC LIMIT ?`).all(limit)

  function cleanup() {
    db.prepare('DELETE FROM admin_log WHERE created_at < ?').run(now() - ADMIN_RULES.logKeepMs)
  }

  return {
    log, adminCount, createAdmin, login, changePassword, resetPassword, setDisabled, listAdmins,
    rooms, roomCodes, rotateOwnerKey, createRoom, updateRoom, deleteRoom, requireRoom,
    players, renamePlayer, kickPlayer, leaderboard, renameBoard, hideBoard, deleteBoard,
    overview, listLog, cleanup,
  }
}
