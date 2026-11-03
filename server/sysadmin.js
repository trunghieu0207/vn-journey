// Trang quản trị (/quan-tri): tài khoản admin (một vai trò), đăng nhập, xem / sửa mọi phòng, người chơi,
// bảng xếp hạng cá nhân, nhật ký thao tác. Điều khiển trận của một phòng dùng lại trang chủ phòng (phiên chủ phòng cấp cho admin).

import { randomCode } from './config.js'
import { hashSecret, verifySecret } from './auth.js'
import { GameError, RULES, normalizeText } from './game.js'
import { cleanName } from './game/rules.js'
import { transaction } from './db.js'
import { checkQuestion, QUESTION_STATUS } from './question-rules.js'

export const ADMIN_RULES = {
  maxFails: 5,
  lockMs: 15 * 60_000,
  minPassword: 12,
  logKeepMs: 30 * 24 * 3_600_000,
}

// Cài đặt chỉnh trong trang (bảng settings); thiếu khóa nào thì dùng mặc định
export const DEFAULT_SETTINGS = {
  allowCreate: true,   // mọi người tạo phòng ở trang chủ (tắt: chỉ quản trị tạo)
  presetRooms: true,   // 4 phòng chơi đơn có sẵn
  allowCompact: true,  // kiểu phòng "Team gọn" ở form tạo phòng (tắt: chỉ quản trị tạo)
  notice: '',          // thông báo chung hiện đầu mọi trang
  noticeOn: false,
  bannedWords: [],     // tên người chơi chứa từ này bị gắn cờ (không tự chặn)
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
                              r.bet_choice AS betChoice, r.topic_choice AS topicChoice, r.pioneer, r.compact, r.duel, r.created_at AS createdAt,
                              r.started_at AS startedAt, r.ends_at AS endsAt, r.paused_at AS pausedAt,
                              (SELECT COUNT(*) FROM players p WHERE p.room_id = r.id) AS players,
                              (SELECT COUNT(*) FROM teams t WHERE t.room_id = r.id) AS teams
                       FROM rooms r ORDER BY (r.status = 'ended'), r.created_at DESC`).all()
      .map(r => ({ ...r, listed: !!r.listed, betChoice: !!r.betChoice, topicChoice: !!r.topicChoice, pioneer: !!r.pioneer, compact: !!r.compact, duel: !!r.duel,
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

  // Phòng quản trị tạo hộ (chuẩn bị trước sự kiện): không bị dọn khi chưa ai mở trang (housekeeping.js)
  const keptRooms = () => new Set(JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'keepRooms'").get()?.value ?? '[]'))
  const isKept = roomId => keptRooms().has(roomId)

  function createRoom(opts, by) {
    const r = game.createRoom(opts)
    const alive = new Set(db.prepare('SELECT id FROM rooms').all().map(x => x.id))
    const kept = [...keptRooms()].filter(id => alive.has(id)).concat(r.roomId)
    db.prepare("INSERT INTO settings (key, value) VALUES ('keepRooms', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(kept))
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
    return list.map(p => ({ ...p, score: p.status === 'waiting' ? 0 : scoreOf(p.roomId, p.teamId), online: hub.isOnline(p.id), flagged: flagged(p.name) }))
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
      .map(e => ({ ...e, hidden: !!e.hidden, flagged: flagged(e.name) }))
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

  // ---------- Câu hỏi (sửa trực tiếp trong DB — chốt 31/10; "Xuất questions.json" để đưa vào git) ----------
  const topics = () => Object.fromEntries(db.prepare('SELECT id, name FROM topics').all().map(t => [t.id, t.name]))
  const provinceMap = () => new Map(db.prepare('SELECT id, name, merged_from FROM provinces').all().map(p => [p.id, p]))
  const parse = v => (v == null ? null : JSON.parse(v))

  // Danh sách gọn (không có lựa chọn / đáp án) + số lượt trả lời, % đúng gộp mọi phòng
  function questions() {
    return db.prepare(`SELECT q.id, q.province_id AS province, q.difficulty, q.topic, q.kind, q.level, q.content, q.status, q.hidden,
                              q.asked_count AS asked, json_array_length(q.sources) AS sourceCount, q.updated_at AS updatedAt, q.updated_by AS updatedBy,
                              COUNT(a.team_id) AS answers, COALESCE(SUM(a.correct), 0) AS correct
                       FROM questions q LEFT JOIN answered a ON a.question_id = q.id AND a.skipped = 0
                       GROUP BY q.id ORDER BY q.province_id, q.difficulty, q.id`).all()
      .map(q => ({ ...q, hidden: !!q.hidden, sourceCount: q.sourceCount ?? 0 }))
  }

  function question(id) {
    const r = db.prepare('SELECT * FROM questions WHERE id = ?').get(String(id ?? ''))
    if (!r) throw new GameError('no-question', 'Không tìm thấy câu hỏi', 404)
    return {
      id: r.id, province: r.province_id, difficulty: r.difficulty, topic: r.topic, kind: r.kind, level: r.level, content: r.content,
      options: parse(r.options), answer: parse(r.answer), explanation: r.explanation, sources: parse(r.sources) ?? [],
      status: r.status, hidden: !!r.hidden, updatedAt: r.updated_at, updatedBy: r.updated_by,
    }
  }

  // Mã câu mới theo tỉnh: <tỉnh>-NN (thường) / <tỉnh>-sN (thử tài), số kế tiếp chưa dùng
  function nextQuestionId(province, difficulty) {
    const used = new Set(db.prepare('SELECT id FROM questions WHERE province_id = ?').all(province).map(r => r.id))
    for (let n = 1; ; n++) {
      const id = difficulty === 'siege' ? `${province}-s${n}` : `${province}-${String(n).padStart(2, '0')}`
      if (!used.has(id)) return id
    }
  }

  // Lưu câu (id có → sửa, không có → thêm). Lỗi kiểm tra thì từ chối; trả về cảnh báo để trang hiện
  function saveQuestion(body, by) {
    const q = {
      province: String(body.province ?? ''), difficulty: body.difficulty, topic: String(body.topic ?? ''), kind: body.kind,
      level: Number(body.level), content: String(body.content ?? '').trim(), explanation: String(body.explanation ?? '').trim() || null,
      options: body.kind === 'choice' && Array.isArray(body.options) ? body.options.map(o => String(o).trim()) : null,
      answer: body.kind === 'text' && Array.isArray(body.answer) ? body.answer.map(a => String(a).trim()).filter(Boolean) : body.answer,
      sources: Array.isArray(body.sources) ? body.sources.map(u => String(u).trim()).filter(Boolean) : [],
    }
    const status = QUESTION_STATUS.includes(body.status) ? body.status : 'new'
    const { errors, warnings } = checkQuestion(q, { provinces: provinceMap(), topics: topics() })
    if (errors.length) throw new GameError('bad-question', errors.join(' · '))
    const old = body.id ? question(body.id) : null
    if (old && (old.province !== q.province || old.difficulty !== q.difficulty)) {
      throw new GameError('bad-question', 'Không đổi tỉnh / loại câu của câu đã có — thêm câu mới rồi ẩn câu cũ')
    }
    const id = old?.id ?? nextQuestionId(q.province, q.difficulty)
    const cols = [q.topic, q.kind, q.level, q.content, q.options ? JSON.stringify(q.options) : null, JSON.stringify(q.answer), q.explanation,
      q.sources.length ? JSON.stringify(q.sources) : null, status, now(), by?.username ?? null]
    if (old) {
      db.prepare(`UPDATE questions SET topic = ?, kind = ?, level = ?, content = ?, options = ?, answer = ?, explanation = ?, sources = ?,
                  status = ?, updated_at = ?, updated_by = ? WHERE id = ?`).run(...cols, id)
    } else {
      db.prepare(`INSERT INTO questions (topic, kind, level, content, options, answer, explanation, sources, status, updated_at, updated_by, id, province_id, difficulty)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...cols, id, q.province, q.difficulty)
    }
    log(by, old ? 'question-edit' : 'question-add', `${old ? 'Sửa' : 'Thêm'} câu ${id}${status !== old?.status ? ` (${{ new: 'chờ duyệt', ok: 'đã duyệt', fix: 'cần sửa' }[status]})` : ''}`)
    return { id, warnings }
  }

  // Ẩn: không phát cho phòng nào nữa (câu đang chờ trả lời vẫn trả lời xong). Không cho ẩn câu cuối cùng còn hiện của tỉnh / loại đó
  function hideQuestion(id, hidden, by) {
    const q = question(id)
    if (hidden) {
      const left = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE province_id = ? AND difficulty = ? AND hidden = 0 AND id <> ?')
        .get(q.province, q.difficulty, q.id).n
      if (!left) throw new GameError('last-question', 'Đây là câu cuối cùng còn hiện của tỉnh này — thêm câu khác trước khi ẩn')
    }
    db.prepare('UPDATE questions SET hidden = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(hidden ? 1 : 0, now(), by?.username ?? null, q.id)
    log(by, hidden ? 'question-hide' : 'question-show', `${hidden ? 'Ẩn' : 'Hiện lại'} câu ${q.id}`)
    return { ok: true }
  }

  // Xuất đúng định dạng data/questions.json (giữ phần đầu file gốc, mỗi câu một dòng như scripts/merge-questions.mjs)
  // để thay file trong git — db:reset nạp lại file này nên phải xuất trước khi reset
  function exportQuestions(meta, by) {
    // Giữ thứ tự file gốc: theo thứ tự tỉnh, câu thường trước câu thử tài, câu thêm sau xếp cuối nhóm
    const rows = db.prepare(`SELECT q.id FROM questions q JOIN provinces p ON p.id = q.province_id
                             ORDER BY p.rowid, q.difficulty, q.rowid`).all()
    const list = rows.map(({ id }) => {
      const q = question(id)
      const out = { id: q.id, province: q.province, difficulty: q.difficulty, topic: q.topic, kind: q.kind, content: q.content }
      if (q.options) out.options = q.options
      out.answer = q.answer
      if (q.explanation) out.explanation = q.explanation
      out.level = q.level
      if (q.sources.length) out.sources = q.sources
      if (q.status !== 'new') out.status = q.status
      if (q.hidden) out.hidden = true
      return out
    })
    log(by, 'question-export', `Xuất ${list.length} câu hỏi`)
    const { legacyUnsourced, ...head } = meta
    const val = v => (Array.isArray(v) ? `[${v.map(x => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v))
    const line = q => `{${Object.entries(q).map(([k, v]) => `${JSON.stringify(k)}: ${val(v)}`).join(', ')}}`
    const text = `${JSON.stringify(head, null, 2).slice(0, -2)},\n  "legacyUnsourced": ${val(legacyUnsourced ?? [])},\n  "questions": [\n${list.map(q => `    ${line(q)}`).join(',\n')}\n  ]\n}\n`
    JSON.parse(text) // chắc chắn là JSON hợp lệ
    return text
  }

  // ---------- Cài đặt ----------
  function settings() {
    const saved = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all()
      .filter(r => Object.hasOwn(DEFAULT_SETTINGS, r.key)).map(r => [r.key, JSON.parse(r.value)])) // bỏ khóa nội bộ (keepRooms)
    return { ...DEFAULT_SETTINGS, ...saved }
  }

  function saveSettings(body, by) {
    const patch = {}
    for (const k of ['allowCreate', 'presetRooms', 'allowCompact', 'noticeOn']) if (k in body) patch[k] = body[k] === true
    if ('notice' in body) patch.notice = cleanName(body.notice, 200)
    if ('bannedWords' in body) {
      if (!Array.isArray(body.bannedWords)) throw new GameError('bad-settings', 'Danh sách từ cấm không hợp lệ')
      patch.bannedWords = [...new Set(body.bannedWords.map(w => cleanName(w, 30).toLowerCase()).filter(Boolean))].slice(0, 200)
    }
    const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    transaction(db, () => { for (const [k, v] of Object.entries(patch)) put.run(k, JSON.stringify(v)) })
    if (Object.keys(patch).length) log(by, 'settings', `Cài đặt: ${Object.keys(patch).join(', ')}`)
    return settings()
  }

  // Tên chứa từ cấm (so bỏ dấu, theo cả từ)
  function flagged(name) {
    const words = settings().bannedWords
    if (!words.length) return false
    const n = ` ${normalizeText(name)} `
    return words.some(w => { const k = normalizeText(w); return k && n.includes(` ${k} `) })
  }

  // Thông báo chung đang bật (trang công khai đọc)
  function notice() {
    const s = settings()
    return { text: s.noticeOn && s.notice ? s.notice : null }
  }

  // Xóa mọi phòng đã kết thúc (không đụng phòng có sẵn — chúng tự làm mới)
  function deleteEndedRooms(by) {
    const n = Number(db.prepare("DELETE FROM rooms WHERE status = 'ended' AND preset IS NULL").run().changes)
    log(by, 'room-delete', `Xóa ${n} phòng đã kết thúc`)
    return { deleted: n }
  }

  // Bảng xếp hạng dạng CSV (Excel mở được: có BOM UTF-8)
  function leaderboardCsv(by) {
    const cell = v => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s // chống công thức Excel
    }
    const rows = leaderboard().filter(e => !e.hidden)
    log(by, 'board-export', `Xuất CSV bảng xếp hạng (${rows.length} người)`)
    return '\uFEFF' + [['Hạng', 'Tên', 'Điểm', 'Tem', 'Số trận'], ...rows.map((e, i) => [i + 1, e.name, e.score, e.stamps, e.games])]
      .map(r => r.map(cell).join(',')).join('\r\n')
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
      questions: db.prepare(`SELECT COUNT(*) AS total, SUM(status = 'ok') AS approved, SUM(status = 'fix') AS fix, SUM(hidden) AS hidden,
                                    SUM(sources IS NULL OR json_array_length(sources) < 2) AS weakSources FROM questions`).get(),
      flaggedNames: db.prepare('SELECT name FROM players').all().filter(p => flagged(p.name)).length
        + db.prepare('SELECT DISTINCT name FROM leaderboard WHERE hidden = 0').all().filter(p => flagged(p.name)).length,
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
    rooms, roomCodes, rotateOwnerKey, createRoom, updateRoom, deleteRoom, requireRoom, isKept,
    players, renamePlayer, kickPlayer, leaderboard, renameBoard, hideBoard, deleteBoard,
    overview, listLog, cleanup,
    questions, question, saveQuestion, hideQuestion, exportQuestions,
    settings, saveSettings, notice, deleteEndedRooms, leaderboardCsv,
  }
}
