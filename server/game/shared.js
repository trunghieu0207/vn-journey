// Câu hỏi chung cả phòng (MC tung): trận tạm dừng, mỗi người chọn trên máy mình, hết giờ công bố tỉ lệ chọn từng đáp án
// + lời giải; cả phòng đúng đủ tỉ lệ → mọi team cùng được thưởng. Chỉ có số đếm gộp — không ai bị nêu tên, không chia theo team.

import { transaction } from '../db.js'
import { RULES, GameError } from './rules.js'

export function createShared(ctx) {
  const { db, q, now, random, json, roomId, log, requireRunning, shuffled, correctAnswerText, factSet } = ctx

  const current = () => json(q.room.get(roomId).shared_question)
  const save = s => db.prepare('UPDATE rooms SET shared_question = ? WHERE id = ?').run(s ? JSON.stringify(s) : null, roomId)

  // Câu trắc nghiệm dễ / vừa về ẩm thực, đời sống, văn hóa; chưa ra trong phòng này (kể cả câu chung trước);
  // ưu tiên câu ít được hỏi nhất từ trước tới giờ, bằng nhau thì bốc ngẫu nhiên
  function pickShared() {
    const topics = RULES.sharedTopics.map(() => '?').join(', ')
    const rows = db.prepare(`
      SELECT id, asked_count FROM questions
      WHERE kind = 'choice' AND difficulty = 'normal' AND level <= 2 AND explanation IS NOT NULL AND topic IN (${topics})
        AND id NOT IN (SELECT a.question_id FROM answered a JOIN teams t ON t.id = a.team_id WHERE t.room_id = ?)
        AND id NOT IN (SELECT pending_question FROM teams WHERE room_id = ? AND pending_question IS NOT NULL)
        AND id NOT IN (SELECT json_extract(detail, '$.question') FROM events_log WHERE room_id = ? AND action = 'shared')
    `).all(...RULES.sharedTopics, roomId, roomId, roomId).filter(r => !factSet().has(r.id)) // câu sảnh chờ đã lộ đáp án
    if (!rows.length) throw new GameError('no-question', 'Hết câu hỏi chung cho phòng này', 409)
    const min = Math.min(...rows.map(r => r.asked_count))
    const best = rows.filter(r => r.asked_count === min)
    return q.question.get(best[Math.floor(random() * best.length)].id)
  }

  // MC tung câu: tạm dừng trận (khóa, giờ câu đang chờ… dời lại khi tiếp tục như tạm dừng thường)
  function startShared() {
    requireRunning()
    if (current()) throw new GameError('shared-open', 'Đang có câu hỏi chung', 409)
    const question = pickShared()
    const shared = {
      question: question.id, order: shuffled(json(question.options).length),
      at: now(), until: now() + RULES.sharedMs, votes: {}, result: null,
    }
    transaction(db, () => {
      db.prepare('UPDATE questions SET asked_count = asked_count + 1 WHERE id = ?').run(question.id)
      db.prepare("UPDATE rooms SET status = 'paused', paused_at = ? WHERE id = ?").run(now(), roomId)
      save(shared)
      log(null, 'shared', question.province_id, { question: question.id })
    })
    return { ok: true }
  }

  // Mỗi người một phiếu, đổi được tới hết giờ
  function voteShared(playerId, given) {
    const s = current()
    if (!s || s.result || now() > s.until + RULES.answerNetworkGraceMs) throw new GameError('shared-closed', 'Câu hỏi chung đã đóng', 409)
    const idx = Number(given)
    if (!Number.isInteger(idx) || idx < 0 || idx >= s.order.length) throw new GameError('bad-answer', 'Đáp án không hợp lệ')
    s.votes[playerId] = idx
    save(s)
    return { ok: true }
  }

  // Công bố: hết giờ (vòng tick của server) hoặc MC bấm "Công bố ngay". Trả về true nếu vừa công bố.
  function settleShared(force = false) {
    const s = current()
    if (!s || s.result || (!force && now() < s.until)) return false
    const question = q.question.get(s.question)
    const counts = s.order.map(() => 0)
    for (const v of Object.values(s.votes)) counts[v]++
    const correct = s.order.indexOf(json(question.answer))
    const voters = counts.reduce((a, b) => a + b, 0)
    const pct = voters ? Math.round(counts[correct] * 100 / voters) : 0
    const passed = voters > 0 && pct >= RULES.sharedPassPct
    s.result = { counts, correct, voters, pct, passed, bonus: passed ? RULES.sharedBonus : 0 }
    transaction(db, () => {
      if (passed) {
        for (const t of q.teams.all(roomId)) {
          db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(RULES.sharedBonus, t.id)
          log(t.id, 'shared-bonus', question.province_id, { bonus: RULES.sharedBonus, pct })
        }
      }
      save(s)
      log(null, 'shared-result', question.province_id, { pct, voters, passed, bonus: s.result.bonus, question: question.id })
    })
    return true
  }

  // MC tiếp tục trận: chưa công bố thì công bố luôn rồi đóng câu
  function closeShared() {
    if (!current()) return
    settleShared(true)
    save(null)
  }

  // Dạng gửi client (team, màn chiếu, chủ phòng như nhau): đáp án + lời giải chỉ có sau khi công bố
  function sharedPublic() {
    const s = current()
    if (!s) return null
    const question = q.question.get(s.question)
    const opts = json(question.options)
    return {
      at: s.at, until: s.until,
      province: question.province_id,
      content: question.content,
      options: s.order.map(i => opts[i]),
      passPct: RULES.sharedPassPct, reward: RULES.sharedBonus,
      voted: Object.keys(s.votes).length,
      players: q.players.all(roomId).length,
      result: s.result && {
        ...s.result,
        answer: correctAnswerText(question),
        explanation: question.explanation,
      },
    }
  }

  return { startShared, voteShared, settleShared, closeShared, sharedPublic }
}
