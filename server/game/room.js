// Một phòng: các hàm kiểm tra dùng chung, rồi ghép câu hỏi, hành động team, màn hình và chủ phòng.

import { transaction } from '../db.js'
import { RULES, GameError } from './rules.js'
import { createQuestions } from './questions.js'
import { createActions } from './actions.js'
import { createViews } from './views.js'
import { createOwner } from './owner.js'
import { createShared } from './shared.js'

export function createRoomScope(ctx, roomId) {
  const { db, q, now, json, provinces, adjacency, collections, questionStats } = ctx

  const log = (teamId, action, provinceId = null, detail = null, by = null) =>
    q.log.run(roomId, teamId, by, action, provinceId, detail ? JSON.stringify(detail) : null, now())

  function state() {
    const s = q.room.get(roomId)
    if (!s) throw new GameError('no-room', 'Phòng không còn tồn tại', 404)
    // Hết giờ: tự kết thúc ở lần đọc trạng thái kế tiếp
    if (s.status === 'running' && s.ends_at && now() >= s.ends_at) {
      transaction(db, () => {
        db.prepare("UPDATE rooms SET status = 'ended' WHERE id = ?").run(roomId)
        log(null, 'end')
        recordBoard()
      })
      return q.room.get(roomId)
    }
    return s
  }

  // Đọc thẳng rooms (không qua state()) vì có thể được gọi bên trong transaction
  // Sự kiện đang diễn ra; Lễ hội kèm số điểm thưởng để client hiện đúng (không viết cứng ở client)
  function activeEvent(s = q.room.get(roomId)) {
    const e = json(s.active_event)
    if (!e || e.until <= now()) return null
    return e.kind === 'festival' ? { ...e, bonus: RULES.festivalBonus } : e
  }

  function requireRunning() {
    const s = state()
    if (s.status !== 'running') throw new GameError('not-running', 'Trận đấu chưa bắt đầu hoặc đang tạm dừng', 409)
    if (now() < s.started_at) throw new GameError('counting', 'Đang đếm ngược — chờ hiệu lệnh "Bắt đầu!"', 409)
    return s
  }

  function requireTeam(teamId) {
    const t = q.team.get(teamId, roomId)
    if (!t) throw new GameError('no-team', 'Không tìm thấy team', 404)
    return t
  }

  function requireIdle(t) {
    if (t.locked_until && t.locked_until > now()) {
      throw new GameError('locked', 'Team đang nghỉ chân, chờ hết thời gian', 423)
    }
    if (t.pending_question) throw new GameError('pending', 'Team đang có câu hỏi chờ trả lời', 409)
    if (t.choosing_at) throw new GameError('choosing', 'Team đang chọn chủ đề câu hỏi', 409)
  }

  const shieldActive = o => o && o.shield_until && o.shield_until > now()
  // Phòng chơi đơn (mỗi người là một team ẩn 1 người: tên, bảng xếp hạng, xuất phát ngẫu nhiên…)
  const isSolo = () => q.room.get(roomId)?.mode === 'solo'
  // Phòng "Team gọn": không tự nhận thẻ (chủ phòng tung), thưởng nhanh thay trừ giờ
  const isCompact = () => !!q.room.get(roomId)?.compact
  // Tem thay cho chủ tỉnh — mỗi team một bản đồ riêng, không thử tài: phòng đơn + Team gọn tắt Đấu
  const usesStamps = () => {
    const r = q.room.get(roomId)
    return r?.mode === 'solo' || (!!r?.compact && !r.duel)
  }

  // Phòng đơn vừa kết thúc: ghi điểm từng người vào bảng xếp hạng cả sự kiện (gọi trong transaction kết thúc).
  // Bỏ người chưa có tem nào và 0 điểm. "Chơi lại" rồi kết thúc lần nữa = thêm một trận
  function recordBoard() {
    if (!isSolo()) return
    const people = new Map(db.prepare('SELECT team_id, name, name_key FROM players WHERE room_id = ?').all(roomId).map(p => [p.team_id, p]))
    const add = db.prepare('INSERT INTO leaderboard (room_id, name, name_key, color, score, stamps, played_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const s of scores()) {
      const p = people.get(s.teamId)
      if (p && (s.provinces > 0 || s.total > 0)) add.run(roomId, p.name, p.name_key, s.color, s.total, s.provinces, now())
    }
  }

  // Số lần trượt của team ở tỉnh, tính từ lần cắm cờ gần nhất của team ở tỉnh đó (bỏ qua lúc chọn chủ đề / lúc cược thử tài
  // chưa thấy câu nên không tính — xem detail.seen của 'skip')
  function missesAt(teamId, provinceId) {
    return db.prepare(`SELECT COUNT(*) AS n FROM events_log WHERE team_id = ? AND province_id = ?
                         AND (action IN ('wrong', 'siege-fail') OR (action = 'skip' AND json_extract(detail, '$.seen') = 1))
                         AND id > COALESCE((SELECT MAX(id) FROM events_log WHERE team_id = ? AND province_id = ? AND action IN ('capture', 'steal')), 0)`)
      .get(teamId, provinceId, teamId, provinceId).n
  }
  // Điểm tỉnh với team sau các lần trượt (RULES.missCut mỗi lần, thấp nhất RULES.missMinRatio)
  const worthAt = (teamId, provinceId) =>
    Math.round(provinces.get(provinceId).points * Math.max(RULES.missMinRatio, 1 - RULES.missCut * missesAt(teamId, provinceId)))

  const rctx = { ...ctx, roomId, log, state, activeEvent, requireRunning, requireTeam, requireIdle, shieldActive, isSolo, isCompact, usesStamps, recordBoard, missesAt, worthAt }
  const questions = createQuestions(rctx)
  const { react, move, retry, chooseTopic, siege, betSiege, settleSiegeBets, retreat, answer, vote, defend, skip, expireTeam, useCard, choiceFor, siegeBlock } = createActions({ ...rctx, ...questions })
  const { startShared, voteShared, settleShared, closeShared, sharedPublic } = createShared({ ...rctx, ...questions })
  const { journal, scores, teamView, screenView, ownerView, replay, news } = createViews({ ...rctx, ...questions, choiceFor, siegeBlock, sharedPublic })
  const owner = createOwner({ ...rctx, scores, recordBoard })
  const { spawnSolo } = owner
  const { kickPlayer, renamePlayer, leave, releaseHost, start, pause, end, reset, triggerEvent, adjustScore, giveCards, setTopicChoice, setBetChoice } = owner
  // Tiếp tục sau câu hỏi chung: công bố (nếu MC bấm sớm) rồi đóng câu, trận chạy tiếp
  const resume = () => {
    if (state().status !== 'paused') return owner.resume() // lỗi not-paused
    closeShared()
    owner.resume()
  }

  return {
    id: roomId, provinces, adjacency, collections,
    state, react, move, retry, chooseTopic, siege, betSiege, settleSiegeBets, retreat, answer, vote, defend, skip, expireTeam, useCard, scores,
    teamView, screenView, ownerView, replay, news, journal,
    kickPlayer, renamePlayer, leave, releaseHost, start, pause, resume, end, reset, triggerEvent, adjustScore, giveCards, setTopicChoice, setBetChoice,
    startShared, voteShared, settleShared, spawnSolo, isSolo, isCompact, usesStamps,
    questionStats: () => questionStats(roomId),
  }
}
