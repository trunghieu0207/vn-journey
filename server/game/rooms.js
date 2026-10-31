// Việc cấp phòng: tạo phòng, tìm phòng, sảnh chờ, vào phòng, dọn dẹp, thống kê, danh sách tỉnh.

import { transaction } from '../db.js'
import { RULES, TEAM_STYLES, GameError, normalizeText, cleanName } from './rules.js'

export function createRooms(ctx) {
  const { db, q, now, json, provinces, timedOut, defaultDurationMin, newCode, hashSecret, room: roomScope } = ctx

  // ---------- Phòng ----------
  function uniqueRoomCode() {
    for (let i = 0; i < 20; i++) {
      const code = newCode(6)
      if (!q.roomByCode.get(code)) return code
    }
    throw new GameError('no-code', 'Không tạo được mã phòng, thử lại', 500)
  }

  // Tạo phòng + các team. Trả về mã chủ phòng (chỉ hiện 1 lần) và mã màn chiếu.
  // mode 'solo': phòng chơi đơn — chưa tạo team nào; mỗi người vào phòng thành một team ẩn 1 người (joinRoom)
  function createRoom({ name, teamCount, durationMin, topicChoice = false, betChoice = false, mode = 'team', pioneer = true, preset = null, quizCount = RULES.quizCount.default, listed = false } = {}) {
    const roomName = cleanName(name, RULES.roomNameMaxLength)
    if (!roomName) throw new GameError('bad-room', 'Cần đặt tên phòng')
    if (!['team', 'solo'].includes(mode)) throw new GameError('bad-room', 'Kiểu phòng không hợp lệ')
    const n = mode === 'solo' ? 0 : Number(teamCount)
    if (mode === 'team' && (!Number.isInteger(n) || n < RULES.minTeams || n > RULES.maxTeams)) {
      throw new GameError('bad-room', `Số team phải từ ${RULES.minTeams} đến ${RULES.maxTeams}`)
    }
    const minutes = durationMin == null || durationMin === '' ? defaultDurationMin : Number(durationMin)
    if (!Number.isInteger(minutes) || minutes < RULES.durationMin.min || minutes > RULES.durationMin.max) {
      throw new GameError('bad-room', `Thời lượng phải từ ${RULES.durationMin.min} đến ${RULES.durationMin.max} phút`)
    }
    const quiz = quizCount == null || quizCount === '' ? RULES.quizCount.default : Number(quizCount)
    if (!Number.isInteger(quiz) || quiz < RULES.quizCount.min || quiz > RULES.quizCount.max) {
      throw new GameError('bad-room', `Số câu mỗi tỉnh phải từ ${RULES.quizCount.min} đến ${RULES.quizCount.max}`)
    }
    const open = db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE status != 'ended' AND preset IS NULL").get().n
    if (!preset && open >= RULES.maxOpenRooms) throw new GameError('too-many-rooms', 'Máy chủ đang có quá nhiều phòng, thử lại sau', 503)

    const ownerKey = newCode(8)
    const screenCode = newCode(6)
    const code = uniqueRoomCode()
    return transaction(db, () => {
      const { lastInsertRowid } = db.prepare(`INSERT INTO rooms (code, name, owner_key_hash, screen_code, duration_min, topic_choice, bet_choice, mode, pioneer, preset, quiz_count, listed, created_at)
                                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(code, roomName, hashSecret(ownerKey), screenCode, minutes, topicChoice ? 1 : 0, betChoice ? 1 : 0, mode, pioneer ? 1 : 0, preset, quiz, listed && !preset ? 1 : 0, now())
      const roomId = Number(lastInsertRowid)
      for (const style of TEAM_STYLES.slice(0, n)) {
        db.prepare('INSERT INTO teams (room_id, name, color, mascot) VALUES (?, ?, ?, ?)')
          .run(roomId, `Team ${style.mascot}`, style.color, style.mascot)
      }
      return { roomId, code, ownerKey, screenCode }
    })
  }

  function findRoom(code) {
    const room = q.roomByCode.get(String(code ?? '').trim().toUpperCase())
    if (!room) throw new GameError('no-room', 'Không tìm thấy phòng với mã này', 404)
    return room
  }

  // Thông tin công khai để chọn team khi vào phòng: tên team + số người, KHÔNG có vị trí hay điểm
  function lobby(code) {
    const room = findRoom(code)
    const counts = new Map(db.prepare('SELECT team_id, COUNT(*) AS n FROM players WHERE room_id = ? GROUP BY team_id')
      .all(room.id).map(r => [r.team_id, r.n]))
    return {
      code: room.code,
      name: room.name,
      status: room.status,
      mode: room.mode,
      maxPlayersPerTeam: RULES.maxPlayersPerTeam,
      // Danh sách chọn quê (tên tỉnh là thông tin công khai)
      provinces: [...provinces.values()].map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      // Phòng đơn: không lộ danh sách người chơi cho người chưa vào phòng — chỉ số người
      teams: room.mode === 'solo' ? [] : q.teams.all(room.id).map(t => ({ id: t.id, name: t.name, color: t.color, mascot: t.mascot, members: counts.get(t.id) ?? 0 })),
      players: [...counts.values()].reduce((a, b) => a + b, 0),
      // Phòng có sẵn: chưa có chủ phòng thì người vào trước nhận quyền
      preset: !!room.preset, hasHost: room.host_player_id != null,
      maxPlayers: room.mode === 'solo' ? RULES.maxSoloPlayers : null,
    }
  }

  // home: id tỉnh quê (không bắt buộc). Trước khi bắt đầu đổi được (vào lại); sau khi bắt đầu thì khóa — chỉ người chưa chọn mới chọn được một lần
  // ownerRoomId: phiên đang gọi là chủ phòng của phòng nào (người tạo phòng bấm "Vào chơi luôn") — vào phòng đó thì giữ quyền chủ phòng
  // isOnline(playerId): người chơi đó đang mở trang (kết nối realtime) không
  function joinRoom(code, playerName, teamId, home = null, { ownerRoomId = null, isOnline = () => false } = {}) {
    const room = findRoom(code)
    if (room.status === 'ended') throw new GameError('ended', 'Trận đấu ở phòng này đã kết thúc', 409)
    const solo = room.mode === 'solo'
    let team = solo ? null : q.team.get(Number(teamId), room.id)
    if (!solo && !team) throw new GameError('no-team', 'Chọn một team trong phòng')
    const name = cleanName(playerName, RULES.playerNameMaxLength)
    if (!name) throw new GameError('bad-name', 'Nhập tên của bạn')
    const nameKey = normalizeText(name) || name.toLowerCase()
    if (home && !provinces.has(home)) throw new GameError('bad-home', 'Chọn quê trong danh sách')
    home ||= null
    return transaction(db, () => {
      // Vào lại đúng tên + đúng team (mất phiên, đổi máy): nhận lại chỗ cũ. Tên đã có ở team khác: từ chối.
      const existing = db.prepare('SELECT * FROM players WHERE room_id = ? AND name_key = ?').get(room.id, nameKey)
      if (solo && existing) team = q.team.get(existing.team_id, room.id) // phòng đơn: vào lại đúng tên = nhận lại hành trình cũ
      if (solo && !existing) team = soloTeam(room, name)
      if (existing?.team_id === team.id) {
        // Tên ai trong phòng cũng thấy nên không đủ để giành chỗ: chỉ nhận lại khi máy cũ đã đóng,
        // và không nhận lại quyền chủ phòng (người tạo phòng đăng nhập lại bằng mã chủ phòng rồi "Vào chơi")
        const owner = ownerRoomId === room.id
        if (!owner && isOnline(existing.id)) {
          throw new GameError('name-online', 'Tên này đang chơi trên một máy khác. Đóng trang ở máy cũ rồi vào lại, hoặc chọn tên khác', 409)
        }
        const wasHost = q.room.get(room.id).host_player_id === existing.id
        if (home && (room.status === 'waiting' || !existing.home)) db.prepare('UPDATE players SET home = ? WHERE id = ?').run(home, existing.id)
        else if (!home && room.status === 'waiting') db.prepare('UPDATE players SET home = NULL WHERE id = ?').run(existing.id)
        const noHost = wasHost && !owner
        return { roomId: room.id, teamId: team.id, playerId: existing.id, name: existing.name, host: claimHost(room, existing.id, owner) && !noHost, noHost }
      }
      if (existing) throw new GameError('name-taken', 'Tên này đã có người dùng ở team khác, chọn tên khác', 409)
      const members = db.prepare('SELECT COUNT(*) AS n FROM players WHERE team_id = ?').get(team.id).n
      if (members >= RULES.maxPlayersPerTeam) throw new GameError('team-full', 'Team này đã đủ người', 409)
      const { lastInsertRowid } = db.prepare('INSERT INTO players (room_id, team_id, name, name_key, home, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(room.id, team.id, name, nameKey, home, now())
      if (solo && room.status !== 'waiting') roomScope(room.id).spawnSolo(team.id) // vào muộn: xuất phát ngay
      return { roomId: room.id, teamId: team.id, playerId: Number(lastInsertRowid), name, host: claimHost(room, Number(lastInsertRowid), ownerRoomId === room.id) }
    })
  }

  // Người chơi giữ quyền chủ phòng: người tạo phòng vào chơi luôn (owner = true), hoặc người vào trước ở phòng có sẵn chưa có chủ.
  // Trả về true nếu người này là chủ phòng. Gọi trong transaction
  function claimHost(room, playerId, owner = false) {
    let host = q.room.get(room.id).host_player_id
    if (owner || (room.preset && host == null)) {
      db.prepare('UPDATE rooms SET host_player_id = ? WHERE id = ?').run(playerId, room.id)
      host = playerId
    }
    return host === playerId
  }

  // Phòng chơi đơn có sẵn: tạo những phòng còn thiếu (lúc khởi động server và sau mỗi lần dọn phòng)
  function ensurePresetRooms() {
    for (const name of RULES.presetRooms) {
      if (db.prepare('SELECT 1 FROM rooms WHERE preset = ?').get(name)) continue
      createRoom({ name, mode: 'solo', durationMin: RULES.presetDurationMin, betChoice: true, preset: name })
    }
  }

  // Danh sách phòng có sẵn (công khai): tên, mã, trạng thái, số người, đã có chủ phòng chưa — không có tên người chơi
  function presetRooms() {
    return db.prepare(`SELECT r.code, r.name, r.status, r.duration_min, r.host_player_id, (SELECT COUNT(*) FROM players p WHERE p.room_id = r.id) AS players
                       FROM rooms r WHERE r.preset IS NOT NULL ORDER BY r.id`).all()
      .map(r => ({ code: r.code, name: r.name, status: r.status, durationMin: r.duration_min, players: r.players, max: RULES.maxSoloPlayers, hasHost: r.host_player_id != null }))
  }

  // Phòng công khai (tự tạo, chưa kết thúc; mới nhất trước): tên, mã, kiểu, trạng thái, số người; phòng team kèm linh vật + số người
  // từng team (như sảnh chọn team) — không có tên người chơi
  function publicRooms() {
    const rooms = db.prepare(`SELECT r.id, r.code, r.name, r.status, r.mode, r.duration_min,
                                     (SELECT COUNT(*) FROM players p WHERE p.room_id = r.id) AS players
                              FROM rooms r WHERE r.listed = 1 AND r.preset IS NULL AND r.status != 'ended' ORDER BY r.created_at DESC, r.id DESC`).all()
    const teamsOf = db.prepare(`SELECT t.mascot, t.color, (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS members
                                FROM teams t WHERE t.room_id = ? ORDER BY t.id`)
    return rooms.map(r => {
      const teams = r.mode === 'solo' ? null : teamsOf.all(r.id)
      return { code: r.code, name: r.name, status: r.status, mode: r.mode, durationMin: r.duration_min, players: r.players,
        teams, maxPerTeam: RULES.maxPlayersPerTeam, max: teams ? teams.length * RULES.maxPlayersPerTeam : RULES.maxSoloPlayers }
    })
  }

  // Phòng đơn: avatar chữ cái đầu (cột mascot của team ẩn)
  const avatarLetter = name => [...name][0]?.toLocaleUpperCase('vi') ?? '?'

  // Phòng đơn: mỗi người một team ẩn (giữ nguyên vị trí, nghỉ chân, câu hỏi, chuỗi, thẻ…); màu xoay vòng theo thứ tự vào phòng.
  // Gọi trong transaction
  function soloTeam(room, name) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM teams WHERE room_id = ?').get(room.id).n
    if (n >= RULES.maxSoloPlayers) throw new GameError('room-full', `Phòng đã đủ ${RULES.maxSoloPlayers} người`, 409)
    const { lastInsertRowid } = db.prepare('INSERT INTO teams (room_id, name, color, mascot) VALUES (?, ?, ?, ?)')
      .run(room.id, name, RULES.soloColors[n % RULES.soloColors.length], avatarLetter(name))
    return q.team.get(Number(lastInsertRowid), room.id)
  }

  // Câu hỏi quá giờ mà team không trả lời: tính là sai. Server gọi định kỳ; trả về id các phòng bị ảnh hưởng.
  function expireQuestions() {
    const rows = db.prepare(`SELECT t.id, t.room_id, q.difficulty, t.pending_at, t.pending_extra_ms FROM teams t
                             JOIN rooms r ON r.id = t.room_id AND r.status = 'running'
                             JOIN questions q ON q.id = t.pending_question`).all()
    const rooms = new Set()
    for (const r of rows) {
      if (!timedOut(r.difficulty, r.pending_at, r.pending_extra_ms)) continue
      roomScope(r.room_id).expireTeam(r.id)
      rooms.add(r.room_id)
    }
    return [...rooms]
  }

  // Bảng xếp hạng cá nhân cả sự kiện (công khai): mỗi tên một dòng = trận điểm cao nhất; bằng điểm thì nhiều tem hơn, rồi ai đạt trước.
  // Hạng bằng nhau khi cùng điểm + cùng số tem
  function leaderboard() {
    const since = now() - RULES.leaderboardKeepMs
    const rows = db.prepare(`WITH ranked AS (
                               SELECT name, color, score, stamps, played_at,
                                      ROW_NUMBER() OVER (PARTITION BY name_key ORDER BY score DESC, stamps DESC, played_at) AS rn,
                                      COUNT(*) OVER (PARTITION BY name_key) AS games
                               FROM leaderboard WHERE played_at >= ?)
                             SELECT name, color, score, stamps, games FROM ranked WHERE rn = 1
                             ORDER BY score DESC, stamps DESC, played_at LIMIT ?`).all(since, RULES.leaderboardSize)
    let rank = 0
    const entries = rows.map((r, i) => {
      const prev = rows[i - 1]
      if (!prev || prev.score !== r.score || prev.stamps !== r.stamps) rank = i + 1
      return { rank, name: r.name, color: r.color, score: r.score, stamps: r.stamps, games: r.games }
    })
    const totals = db.prepare('SELECT COUNT(DISTINCT name_key) AS players, COUNT(*) AS plays FROM leaderboard WHERE played_at >= ?').get(since)
    return { entries, players: totals.players, plays: totals.plays, keepDays: Math.round(RULES.leaderboardKeepMs / 86_400_000) }
  }

  function cleanupRooms() {
    db.prepare('DELETE FROM leaderboard WHERE played_at < ?').run(now() - RULES.leaderboardKeepMs)
    return Number(db.prepare('DELETE FROM rooms WHERE created_at < ?').run(now() - RULES.roomLifetimeMs).changes)
      + Number(db.prepare("DELETE FROM rooms WHERE preset IS NOT NULL AND status = 'ended' AND ends_at < ?").run(now() - RULES.presetIdleMs).changes)
  }

  // Phòng đang chạy: dùng để server kiểm tra hết giờ / hết sự kiện
  const activeRoomIds = () => db.prepare("SELECT id FROM rooms WHERE status IN ('running', 'paused')").all().map(r => r.id)

  // Thống kê % đúng theo câu hỏi (bước 4.11, 7.9) — gộp mọi phòng
  function questionStats(roomId = null) {
    return db.prepare(`SELECT q.id, q.province_id, q.difficulty, q.level, COUNT(a.team_id) AS answers,
                              COALESCE(SUM(a.correct), 0) AS correct
                       FROM questions q
                       LEFT JOIN answered a ON a.question_id = q.id AND a.skipped = 0
                         AND (? IS NULL OR a.team_id IN (SELECT id FROM teams WHERE room_id = ?))
                       GROUP BY q.id ORDER BY answers DESC, q.id`).all(roomId, roomId)
      .map(r => {
        const rate = r.answers ? r.correct / r.answers : null
        const suggested = r.answers < 3 ? r.level : rate > 0.7 ? 1 : rate >= 0.4 ? 2 : 3
        return { ...r, rate, suggestedLevel: suggested }
      })
  }

  // Thông tin tĩnh của các tỉnh (tên, miền, điểm, sáp nhập) — công khai cho mọi màn hình đã đăng nhập
  function provinceList() {
    return [...provinces.values()].map(p => ({
      id: p.id, name: p.name, shortName: p.short_name, region: p.region, points: p.points,
      mergedFrom: json(p.merged_from), isCity: !!p.is_city, isCapital: !!p.is_capital,
    }))
  }

  return { ensurePresetRooms, presetRooms, publicRooms, leaderboard, createRoom, findRoom, lobby, joinRoom, expireQuestions, cleanupRooms, activeRoomIds, questionStats, provinceList }
}
