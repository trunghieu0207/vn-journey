// Câu hỏi của một phòng: chọn câu, ẩn đáp án, phát câu, chấm đáp án, ghi thời gian và kết quả.

import { RULES, GameError, normalizeText } from './rules.js'

export function createQuestions(ctx) {
  const { db, q, now, random, json, activeEvent, roomId, factPool, usesStamps, questionLeadMs, worthAt } = ctx

  // ---------- Câu hỏi ----------
  function shuffled(n) {
    const order = Array.from({ length: n }, (_, i) => i)
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    return order
  }

  // Sảnh chờ "Bạn có biết?": chọn cố định theo mã phòng (băm), mỗi miền như nhau, xếp xen kẽ Bắc · Trung · Nam.
  // Không ghi gì vào DB — tính lại ra cùng kết quả; chơi lại thì sảnh chờ chạy lại đúng các câu đó
  function factIds() {
    const code = q.room.get(roomId)?.code ?? ''
    const hash = str => {
      let h = 0x811c9dc5
      for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
      return h >>> 0
    }
    const per = Math.ceil(RULES.factCount / 3)
    const picks = Object.values(factPool).map(ids => [...ids].sort((a, b) => hash(code + a) - hash(code + b)).slice(0, per))
    return Array.from({ length: per }, (_, i) => picks.map(p => p[i])).flat().filter(Boolean).slice(0, RULES.factCount)
  }
  const factSet = () => new Set(factIds())

  // Dạng gửi client: có đáp án + lời giải — được vì các câu này không bao giờ phát cho team trong phòng này
  function lobbyFacts() {
    return factIds().map(id => {
      const question = q.question.get(id)
      return { province: question.province_id, content: question.content, answer: correctAnswerText(question), explanation: question.explanation }
    })
  }

  // Chọn câu team chưa gặp (theo chủ đề nếu có); hết câu thì cho lặp lại.
  // Trong số đó ưu tiên câu ít ra nhất TRONG PHÒNG (các team ngồi gần nhau đỡ nghe lỏm đáp án của nhau), rồi câu ít được
  // hỏi nhất TỪ TRƯỚC TỚI GIỜ (xoay vòng qua các trận — người chơi nhiều lần khó thuộc); bằng nhau thì bốc ngẫu nhiên.
  function pickQuestion(teamId, provinceId, difficulty, topic = null) {
    const ofTopic = rows => (topic ? rows.filter(r => q.question.get(r.id).topic === topic) : rows)
    // Câu đã hiện ở sảnh chờ (lộ đáp án) không phát; tỉnh hết câu thì mới cho lặp lại
    const shown = factSet()
    const fresh = rows => rows.filter(r => !shown.has(r.id))
    let ids = fresh(ofTopic(q.candidates.all(provinceId, difficulty, teamId)))
    if (!ids.length) ids = fresh(q.candidates.all(provinceId, difficulty, teamId))
    if (!ids.length) ids = fresh(q.anyCandidates.all(provinceId, difficulty))
    if (!ids.length) ids = q.anyCandidates.all(provinceId, difficulty)
    if (!ids.length) throw new GameError('no-question', 'Tỉnh này chưa có câu hỏi', 500)
    const scored = ids.map(r => ({ id: r.id, room: q.roomUses.get(roomId, r.id, roomId, r.id).n, all: q.question.get(r.id).asked_count }))
    const minRoom = Math.min(...scored.map(s => s.room))
    const inRoom = scored.filter(s => s.room === minRoom)
    const minAll = Math.min(...inRoom.map(s => s.all))
    const best = inRoom.filter(s => s.all === minAll)
    return q.question.get(best[Math.floor(random() * best.length)].id)
  }

  // Câu hỏi gửi cho client: KHÔNG có đáp án; lựa chọn đã xáo trộn.
  // help: { hidden (vị trí 2 đáp án sai thẻ 50:50 đã ẩn), extraMs (thẻ Thêm giờ), golden (Câu hỏi vàng) }
  // bet: team chọn "Liều"; votes: phiếu chọn đáp án của thành viên [{ name, answer }]; worth: điểm tỉnh với team (đã trừ các lần trượt)
  function publicQuestion(question, order, issuedAt, { hidden = null, extraMs = 0, golden = false, bet = false, votes = [], worth = null } = {}) {
    const opts = json(question.options)
    return {
      issuedAt,
      freeUntil: issuedAt + RULES.answerFreeMs[question.difficulty] + extraMs,
      deadline: issuedAt + RULES.answerLimitMs[question.difficulty] + extraMs,
      hidden: hidden ?? [],
      extraMs,
      golden,
      bet,
      votes,
      worth,
      id: question.id,
      province: question.province_id,
      // Phòng đơn: câu thử tài chỉ dùng làm câu vàng — client hiện như câu thường (giờ vẫn theo câu thử tài: freeUntil / deadline)
      difficulty: usesStamps() ? 'normal' : question.difficulty,
      level: question.level,
      kind: question.kind,
      content: question.content,
      options: opts ? order.map(i => opts[i]) : null,
    }
  }

  // Câu đang chờ của team (dạng gửi client), kèm thẻ trợ giúp đã dùng cho câu này
  function pendingPublic(t) {
    return publicQuestion(q.question.get(t.pending_question), json(t.pending_order), t.pending_at,
      { hidden: json(t.pending_hidden), extraMs: t.pending_extra_ms, golden: !!t.pending_golden, bet: !!t.pending_bet,
        votes: Object.values(json(t.pending_votes) ?? {}), worth: worthAt(t.id, q.question.get(t.pending_question).province_id) })
  }

  // delayMs: phát câu nhưng chưa tính giờ ngay (giữa hai hiệp thử tài — để xem kết quả hiệp vừa xong)
  function issueQuestion(t, provinceId, difficulty, topic = null, bet = false, delayMs = 0) {
    // Phòng đơn: trong Câu hỏi vàng lấy câu từ kho thử tài của tỉnh (khó hơn, giờ 45 giây); tỉnh không có thì câu thường
    if (usesStamps() && activeEvent()?.kind === 'golden' && q.anyCandidates.all(provinceId, 'siege').length) difficulty = 'siege'
    const question = pickQuestion(t.id, provinceId, difficulty, topic)
    const opts = json(question.options)
    const order = opts ? shuffled(opts.length) : null
    // Câu phát ra trong lúc Câu hỏi vàng thì giữ luật vàng tới khi trả lời xong (kể cả khi sự kiện vừa hết)
    const golden = activeEvent()?.kind === 'golden' ? 1 : 0
    db.prepare('UPDATE questions SET asked_count = asked_count + 1 WHERE id = ?').run(question.id)
    const issuedAt = now() + questionLeadMs + delayMs // mốc bắt đầu tính giờ (sau khi camera bay tới tỉnh)
    db.prepare(`UPDATE teams SET pending_question = ?, pending_order = ?, pending_at = ?, pending_hidden = NULL,
                pending_extra_ms = 0, pending_golden = ?, pending_bet = ?, pending_votes = NULL WHERE id = ?`)
      .run(question.id, order ? JSON.stringify(order) : null, issuedAt, golden, bet ? 1 : 0, t.id)
    return publicQuestion(question, order, issuedAt, { golden: !!golden, bet, worth: worthAt(t.id, provinceId) })
  }

  function isCorrect(question, order, answer) {
    const expected = json(question.answer)
    if (question.kind === 'choice') {
      const idx = Number(answer)
      if (!Number.isInteger(idx) || idx < 0 || idx >= order.length) throw new GameError('bad-answer', 'Đáp án không hợp lệ')
      return order[idx] === expected
    }
    if (question.kind === 'truefalse') {
      if (typeof answer !== 'boolean') throw new GameError('bad-answer', 'Đáp án phải là đúng/sai')
      return answer === expected
    }
    if (typeof answer !== 'string' || !answer.trim() || answer.length > RULES.textAnswerMaxLength) {
      throw new GameError('bad-answer', 'Đáp án không hợp lệ')
    }
    const given = normalizeText(answer)
    return expected.some(a => normalizeText(a) === given)
  }

  function correctAnswerText(question, order) {
    const expected = json(question.answer)
    if (question.kind === 'choice') return json(question.options)[expected]
    if (question.kind === 'truefalse') return expected ? 'Đúng' : 'Sai'
    return expected[0]
  }

  // Cộng thời gian trả lời câu đang chờ vào tổng của team (tối đa bằng giờ của câu, kể cả giờ thẻ Thêm giờ — hết giờ tính đủ).
  // Gọi trong transaction, trước khi xóa pending_at.
  function addAnswerTime(t, difficulty) {
    const ms = Math.max(0, Math.min(now() - t.pending_at, RULES.answerLimitMs[difficulty] + t.pending_extra_ms))
    db.prepare('UPDATE teams SET answer_ms = answer_ms + ? WHERE id = ?').run(ms, t.id)
  }

  // Kết quả gần nhất của team — đồng đội trên máy khác cùng thấy
  function saveResult(t, result, by) {
    db.prepare('UPDATE teams SET last_result = ? WHERE id = ?').run(JSON.stringify({ ...result, by, at: now() }), t.id)
  }

  return { shuffled, factSet, lobbyFacts, pickQuestion, publicQuestion, pendingPublic, issueQuestion, isCorrect, correctAnswerText, addAnswerTime, saveResult }
}
