// Quyền chủ phòng (và người chơi rời phòng): mời ra, bắt đầu, tạm dừng, tiếp tục, kết thúc, chơi lại, sự kiện, chỉnh điểm.

import { transaction } from '../db.js'
import { RULES, REGIONS, byRank, GameError, cleanName, normalizeText } from './rules.js'

export function createOwner(ctx) {
  const {
    db, q, now, random, provinces, adjacency, freezeBeforeEndMin, roomId,
    log, state, requireRunning, requireTeam, scores, isSolo, usesStamps, recordBoard,
  } = ctx

  // ---------- Chủ phòng ----------
  // Mời người chơi ra khỏi phòng (phiên của họ bị xóa theo)
  function kickPlayer(playerId) {
    const p = db.prepare('SELECT * FROM players WHERE id = ? AND room_id = ?').get(Number(playerId), roomId)
    if (!p) throw new GameError('no-player', 'Không tìm thấy người chơi', 404)
    // Phòng đơn: xóa luôn team ẩn của người đó (tem, thẻ… xóa theo)
    if (isSolo()) db.prepare('DELETE FROM teams WHERE id = ?').run(p.team_id)
    else db.prepare('DELETE FROM players WHERE id = ?').run(p.id)
    passHost()
  }

  // Phòng có sẵn: chủ phòng rời / bị mời ra → người vào sớm nhất còn lại nhận quyền chủ phòng
  function passHost() {
    const r = q.room.get(roomId)
    if (!r?.preset || r.host_player_id != null) return
    const next = db.prepare('SELECT id FROM players WHERE room_id = ? ORDER BY id LIMIT 1').get(roomId)
    if (next) db.prepare('UPDATE rooms SET host_player_id = ? WHERE id = ?').run(next.id, roomId)
  }

  // Chủ phòng tự thoát (giữ chỗ chơi): nhả quyền chủ phòng — vào lại bằng tên không nhận lại quyền (tên ai cũng biết).
  // Phòng có sẵn: người vào tiếp theo (kể cả chính người đó vào lại) nhận quyền; phòng tự tạo: đăng nhập lại bằng mã chủ phòng
  function releaseHost(playerId) {
    db.prepare('UPDATE rooms SET host_player_id = NULL WHERE id = ? AND host_player_id = ?').run(roomId, Number(playerId))
  }

  // Chủ phòng sửa tên người chơi (tên tự gõ — chủ phòng kiểm soát): cùng chuẩn hóa + không trùng như lúc vào phòng.
  // Đổi luôn tên trong nhật ký để tên cũ không còn hiện ở đâu (nhật ký chủ phòng ghi lại lần sửa)
  function renamePlayer(playerId, newName) {
    const p = db.prepare('SELECT * FROM players WHERE id = ? AND room_id = ?').get(Number(playerId), roomId)
    if (!p) throw new GameError('no-player', 'Không tìm thấy người chơi', 404)
    const name = cleanName(newName, RULES.playerNameMaxLength)
    if (!name) throw new GameError('bad-name', 'Nhập tên mới')
    const nameKey = normalizeText(name) || name.toLowerCase()
    const other = db.prepare('SELECT id FROM players WHERE room_id = ? AND name_key = ? AND id <> ?').get(roomId, nameKey, p.id)
    if (other) throw new GameError('name-taken', 'Tên này đã có người dùng trong phòng', 409)
    if (name === p.name) return { name }
    transaction(db, () => {
      db.prepare('UPDATE players SET name = ?, name_key = ? WHERE id = ?').run(name, nameKey, p.id)
      if (isSolo()) db.prepare('UPDATE teams SET name = ?, mascot = ? WHERE id = ?').run(name, [...name][0].toLocaleUpperCase('vi'), p.team_id) // phòng đơn: tên team ẩn = tên người, avatar = chữ cái đầu
      db.prepare('UPDATE events_log SET player_name = ? WHERE room_id = ? AND team_id = ? AND player_name = ?').run(name, roomId, p.team_id, p.name)
      db.prepare('UPDATE duels SET defender_by = ? WHERE room_id = ? AND defender_id = ? AND defender_by = ?').run(name, roomId, p.team_id, p.name)
      log(p.team_id, 'rename', null, { to: name })
    })
    return { name }
  }

  // Người chơi tự rời phòng — chỉ trước khi bắt đầu (để đổi team)
  function leave(playerId) {
    if (state().status !== 'waiting') throw new GameError('started', 'Trận đã bắt đầu, không đổi team được nữa', 409)
    const p = db.prepare('SELECT team_id FROM players WHERE id = ? AND room_id = ?').get(Number(playerId), roomId)
    if (p && isSolo()) db.prepare('DELETE FROM teams WHERE id = ?').run(p.team_id)
    else db.prepare('DELETE FROM players WHERE id = ? AND room_id = ?').run(Number(playerId), roomId)
    passHost()
  }

  // Chia tỉnh xuất phát: rải đều 3 miền, tránh thành phố trực thuộc TW, không trùng nhau.
  // Thứ tự miền và thứ tự team xáo mỗi trận (trước đây team đầu luôn ở miền Bắc, phòng 2 team không ai ở miền Nam);
  // trong cùng miền ưu tiên tỉnh không giáp tỉnh xuất phát của team khác.
  function assignStarts(teams) {
    // Phòng đơn: mỗi người một tỉnh ngẫu nhiên (không phải thành phố trực thuộc TW), trùng nhau được
    if (isSolo()) return teams.map(t => [t.id, randomStart()])
    const shuffle = arr => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    }
    const regions = shuffle([...REGIONS])
    const pool = Object.fromEntries(REGIONS.map(r => [r,
      [...provinces.values()].filter(p => p.region === r && !p.is_city).map(p => p.id)]))
    const taken = []
    return shuffle([...teams]).map((t, i) => {
      const list = pool[regions[i % regions.length]]
      const apart = list.filter(id => !taken.some(o => adjacency.get(o).has(id)))
      const from = apart.length ? apart : list
      const id = from[Math.floor(random() * from.length)]
      list.splice(list.indexOf(id), 1)
      taken.push(id)
      return [t.id, id]
    })
  }

  const randomStart = () => {
    const ids = [...provinces.values()].filter(p => !p.is_city).map(p => p.id)
    return ids[Math.floor(random() * ids.length)]
  }

  // Tỉnh xuất phát: phòng team → của team (ownership); phòng đơn / Team gọn tắt Đấu → tem đầu tiên (không tính Tiên phong). Gọi trong transaction
  function placeStart(teamId, provinceId, at) {
    db.prepare('UPDATE teams SET current_province = ?, previous_province = NULL WHERE id = ?').run(provinceId, teamId)
    if (usesStamps()) q.addStamp.run(roomId, teamId, provinceId, 0, null, at)
    else db.prepare('INSERT INTO ownership (room_id, province_id, team_id, captured_at) VALUES (?, ?, ?, ?)').run(roomId, provinceId, teamId, at)
    q.addVisit.run(teamId, provinceId)
    log(teamId, 'spawn', provinceId)
  }

  // Phòng đơn: người vào muộn (trận đã bắt đầu) xuất phát ngay. Gọi trong transaction (joinRoom)
  function spawnSolo(teamId) {
    placeStart(teamId, randomStart(), now())
  }

  function start() {
    const s = state()
    if (s.status !== 'waiting') throw new GameError('not-waiting', 'Trận đã bắt đầu hoặc đã kết thúc', 409)
    const teams = q.teams.all(roomId)
    const t0 = now() + RULES.startCountdownMs // mốc "Bắt đầu!" — trước mốc này người chơi chưa thao tác được (requireRunning)
    const ends = t0 + s.duration_min * 60_000
    transaction(db, () => {
      for (const [teamId, provinceId] of assignStarts(teams)) placeStart(teamId, provinceId, t0)
      db.prepare(`UPDATE rooms SET status = 'running', started_at = ?, ends_at = ?, freeze_at = ?, paused_at = NULL WHERE id = ?`)
        .run(t0, ends, ends - Math.min(freezeBeforeEndMin * 60_000, Math.floor((ends - t0) / 3)), roomId) // đóng băng tối đa 1/3 trận
      log(null, 'start')
    })
  }

  function pause() {
    requireRunning()
    db.prepare("UPDATE rooms SET status = 'paused', paused_at = ? WHERE id = ?").run(now(), roomId)
  }

  // Tiếp tục: dời giờ kết thúc, đóng băng, khóa và giờ câu hỏi thêm đúng khoảng thời gian đã tạm dừng
  function resume() {
    const s = state()
    if (s.status !== 'paused') throw new GameError('not-paused', 'Trận không ở trạng thái tạm dừng', 409)
    const gap = now() - s.paused_at
    transaction(db, () => {
      db.prepare(`UPDATE rooms SET status = 'running', paused_at = NULL,
                  ends_at = ends_at + ?, freeze_at = freeze_at + ? WHERE id = ?`).run(gap, gap, roomId)
      db.prepare('UPDATE teams SET locked_until = locked_until + ? WHERE room_id = ? AND locked_until > ?').run(gap, roomId, s.paused_at)
      db.prepare('UPDATE teams SET pending_at = pending_at + ? WHERE room_id = ? AND pending_at IS NOT NULL').run(gap, roomId)
      db.prepare('UPDATE duels SET started_at = started_at + ?, bet_until = bet_until + ? WHERE room_id = ? AND resolved_at IS NULL').run(gap, gap, roomId)
      db.prepare('UPDATE ownership SET calm_until = calm_until + ? WHERE room_id = ? AND calm_until > ?').run(gap, roomId, s.paused_at)
    })
  }

  function end() {
    const s = state()
    if (!['running', 'paused'].includes(s.status)) throw new GameError('not-running', 'Trận không đang diễn ra', 409)
    transaction(db, () => {
      db.prepare("UPDATE rooms SET status = 'ended', ends_at = ?, shared_question = NULL WHERE id = ?").run(now(), roomId)
      log(null, 'end')
      recordBoard()
    })
  }

  // Chơi lại: xóa toàn bộ diễn biến trận, giữ team và người chơi
  function reset() {
    transaction(db, () => {
      const teamIds = 'SELECT id FROM teams WHERE room_id = ?'
      db.prepare('DELETE FROM ownership WHERE room_id = ?').run(roomId)
      for (const table of ['cards', 'answered', 'visits']) {
        db.prepare(`DELETE FROM ${table} WHERE team_id IN (${teamIds})`).run(roomId)
      }
      db.prepare('DELETE FROM events_log WHERE room_id = ?').run(roomId)
      db.prepare('DELETE FROM duels WHERE room_id = ?').run(roomId)
      db.prepare('DELETE FROM reactions WHERE room_id = ?').run(roomId)
      db.prepare('DELETE FROM stamps WHERE room_id = ?').run(roomId)
      db.prepare(`UPDATE teams SET current_province = NULL, previous_province = NULL, pending_question = NULL,
                  pending_order = NULL, pending_at = NULL, locked_until = NULL, bonus_points = 0, march_ready = 0,
                  last_result = NULL, choosing_at = NULL, answer_ms = 0, streak = 0, progress = NULL WHERE room_id = ?`).run(roomId)
      db.prepare(`UPDATE rooms SET status = 'waiting', started_at = NULL, ends_at = NULL, freeze_at = NULL,
                  paused_at = NULL, active_event = NULL, shared_question = NULL WHERE id = ?`).run(roomId)
    })
  }

  // Chủ phòng bật/tắt cho chọn chủ đề — áp dụng từ lần tới tỉnh kế tiếp
  function setTopicChoice(on) {
    state() // phòng không còn → lỗi no-room
    db.prepare('UPDATE rooms SET topic_choice = ? WHERE id = ?').run(on ? 1 : 0, roomId)
    return { topicChoice: !!on }
  }

  // Chủ phòng bật/tắt đặt cược ("Chắc ăn" / "Liều") — áp dụng từ lần tới tỉnh kế tiếp
  function setBetChoice(on) {
    state()
    db.prepare('UPDATE rooms SET bet_choice = ? WHERE id = ?').run(on ? 1 : 0, roomId)
    return { betChoice: !!on }
  }

  function triggerEvent(kind, region) {
    requireRunning()
    if (kind === 'rumor') {
      const s = q.room.get(roomId)
      if (s.freeze_at && now() >= s.freeze_at) throw new GameError('frozen', 'Bảng điểm đang đóng băng — không tung Tin đồn được', 409)
      const top = scores().sort(byRank)[0]
      log(null, 'event', null, { kind, text: isSolo() ? `Người dẫn đầu đang có ${top?.provinces ?? 0} tem!` : `Đội dẫn đầu đang giữ ${top?.provinces ?? 0} tỉnh!` })
      return { kind }
    }
    // Câu hỏi vàng: cả bản đồ, không theo miền
    if (kind === 'golden') region = null
    else if (!['festival', 'storm'].includes(kind) || !REGIONS.includes(region)) {
      throw new GameError('bad-event', 'Sự kiện hoặc miền không hợp lệ')
    }
    const ms = { festival: RULES.festivalMs, storm: RULES.stormMs, golden: RULES.goldenMs }[kind]
    const event = { kind, region, until: now() + ms }
    transaction(db, () => {
      db.prepare('UPDATE rooms SET active_event = ? WHERE id = ?').run(JSON.stringify(event), roomId)
      log(null, 'event', null, event)
    })
    return event
  }

  function adjustScore(teamId, delta, reason) {
    // Chưa bắt đầu thì chưa có điểm để sửa (chơi lại cũng xóa điểm cộng thêm); đang chơi / tạm dừng / đã kết thúc đều sửa được
    if (state().status === 'waiting') throw new GameError('not-started', 'Trận đấu chưa bắt đầu, chưa sửa điểm được', 409)
    requireTeam(teamId)
    if (!Number.isInteger(delta) || Math.abs(delta) > 2000) throw new GameError('bad-delta', 'Điểm điều chỉnh không hợp lệ')
    const why = String(reason ?? '').trim().slice(0, 200)
    if (!why) throw new GameError('no-reason', 'Cần ghi lý do')
    transaction(db, () => {
      db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(delta, teamId)
      log(teamId, 'score-adjust', null, { delta, reason: why })
    })
  }

  return { spawnSolo, kickPlayer, renamePlayer, leave, releaseHost, assignStarts, start, pause, resume, end, reset, setTopicChoice, setBetChoice, triggerEvent, adjustScore }
}
