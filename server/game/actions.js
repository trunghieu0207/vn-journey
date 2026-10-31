// Hành động của team trong một phòng: đi, chọn chủ đề / đặt cược, công thành (đấu tay đôi với đội giữ tỉnh), rút lui,
// bỏ phiếu + trả lời (chuỗi đúng, câu vàng, siêu tốc), phòng thủ, bỏ qua, dùng thẻ.

import { transaction } from '../db.js'
import { RULES, REGIONS, CARD_KINDS, SOLO_CARD_KINDS, HELP_CARDS, GameError } from './rules.js'

export function createActions(ctx) {
  const {
    db, q, now, random, json, provinces, adjacency, topicNames, timedOut, roomId,
    log, state, activeEvent, requireRunning, requireTeam, requireIdle, shieldActive, isSolo,
    issueQuestion, isCorrect, correctAnswerText, addAnswerTime, saveResult, shuffled,
  } = ctx

  // ---------- Hành động của team ----------
  function move(teamId, provinceId, by = null) {
    requireRunning()
    const t = requireTeam(teamId)
    requireIdle(t)
    if (!provinces.has(provinceId)) throw new GameError('bad-province', 'Tỉnh không tồn tại')
    if (provinceId === t.current_province) throw new GameError('same-province', 'Team đang ở tỉnh này')

    const reachable = new Set(adjacency.get(t.current_province))
    if (t.march_ready) for (const n of [...reachable]) for (const m of adjacency.get(n)) reachable.add(m)
    reachable.delete(t.current_province)
    if (!reachable.has(provinceId)) throw new GameError('not-adjacent', 'Chỉ được đi sang tỉnh giáp ranh')

    const event = activeEvent()
    if (event?.kind === 'storm' && provinces.get(provinceId).region === event.region) {
      throw new GameError('storm', 'Đang có bão, không thể đi vào miền này', 409)
    }

    return transaction(db, () => {
      db.prepare('UPDATE teams SET previous_province = current_province, current_province = ?, march_ready = 0, progress = NULL WHERE id = ?')
        .run(provinceId, t.id)
      q.addVisit.run(t.id, provinceId)
      log(t.id, 'move', provinceId, null, by)
      return offerQuestion(t, provinceId)
    })
  }

  // Bước chọn trước câu thường: chủ đề (phòng bật + còn ≥ 2 chủ đề chưa gặp) và / hoặc đặt cược (phòng bật).
  // Trả về { topics, bet } hoặc null nếu không cần chọn gì.
  // Phòng nhiều câu/tỉnh: mức cược chọn một lần ở câu đầu, các câu sau giữ nguyên (chỉ còn chọn chủ đề nếu phòng bật)
  function choiceFor(teamId, provinceId) {
    const room = q.room.get(roomId)
    const topics = room.topic_choice ? availableTopics(teamId, provinceId) : []
    const pick = topics.length >= 2 ? topics : []
    const bet = !!room.bet_choice && !progressOf(requireTeam(teamId))
    return pick.length || bet ? { topics: pick, bet } : null
  }

  // Tiến độ ở tỉnh đang đứng (phòng cần nhiều câu/tỉnh): { province, done, penalty, golden, speed, bet } — null nếu chưa có / đã rời tỉnh
  function progressOf(t) {
    const p = json(t.progress)
    return p && p.province === t.current_province ? p : null
  }

  // Team đang ở tỉnh (vừa tới hoặc trả lời lại): tỉnh của mình → không có câu; tỉnh có chủ → công thành;
  // tỉnh trống → chọn chủ đề / đặt cược (nếu phòng bật) rồi mới phát câu. Gọi trong transaction.
  function offerQuestion(t, provinceId) {
    // Phòng đơn: tỉnh đã có tem của mình → đi qua, không hỏi lại; chưa có → câu hỏi (không có chủ tỉnh / thử tài)
    if (isSolo() && q.stamp.get(t.id, provinceId)) return { status: 'own' }
    const owner = q.owner.get(roomId, provinceId)
    if (owner?.team_id === t.id) return { status: 'own' }
    if (owner) return { status: shieldActive(owner) ? 'shielded' : 'owned', ...siegeBlock(owner) }
    // Chưa phát câu (chưa tính giờ) cho tới khi team chọn xong
    const choice = choiceFor(t.id, provinceId)
    if (choice) {
      db.prepare('UPDATE teams SET choosing_at = ? WHERE id = ?').run(now(), t.id)
      return { status: 'choose', ...choice }
    }
    return { status: 'question', question: issueQuestion(requireTeam(t.id), provinceId, 'normal', null, !!progressOf(requireTeam(t.id))?.bet) }
  }

  // Trả lời lại ở tỉnh đang đứng (thường là vừa sai, hết khóa) — không phải đi tỉnh khác rồi quay về.
  // Cùng luật như vừa tới tỉnh; câu mới (không lặp câu team đã gặp ở tỉnh này, trừ khi đã hết câu).
  function retry(teamId, by = null) {
    requireRunning()
    const t = requireTeam(teamId)
    requireIdle(t)
    if (!t.current_province) throw new GameError('no-province', 'Team chưa có vị trí trên bản đồ', 409)
    const owner = q.owner.get(roomId, t.current_province)
    if (owner?.team_id === t.id) throw new GameError('own-province', 'Tỉnh này đã là của đội bạn', 409)
    if (isSolo() && q.stamp.get(t.id, t.current_province)) throw new GameError('own-province', 'Bạn đã có tem tỉnh này', 409)
    return transaction(db, () => {
      log(t.id, 'retry', t.current_province, null, by)
      return offerQuestion(t, t.current_province)
    })
  }

  // Chủ đề còn câu (câu thường) mà team chưa gặp ở tỉnh này
  function availableTopics(teamId, provinceId) {
    return q.candidates.all(provinceId, 'normal', teamId)
      .map(r => q.question.get(r.id).topic)
      .filter((tp, i, all) => all.indexOf(tp) === i)
      .map(id => ({ id, name: topicNames.get(id) ?? id }))
  }

  // Team chọn xong (chủ đề và / hoặc cược) → phát câu hỏi (giờ trả lời tính từ lúc này).
  // topic = 'random' để bốc ngẫu nhiên; bet = true là "Liều" (chỉ khi phòng bật đặt cược).
  function chooseTopic(teamId, topic, by = null, bet = false) {
    requireRunning()
    const t = requireTeam(teamId)
    if (!t.choosing_at) throw new GameError('no-choosing', 'Không có tỉnh nào đang chờ chọn (có thể đồng đội đã chọn)', 409)
    if (topic !== 'random' && !availableTopics(t.id, t.current_province).some(x => x.id === topic)) {
      throw new GameError('bad-topic', 'Chủ đề không hợp lệ hoặc đã hết câu')
    }
    const prog = progressOf(t)
    const risky = prog ? !!prog.bet : !!bet && !!q.room.get(roomId).bet_choice
    return transaction(db, () => {
      db.prepare('UPDATE teams SET choosing_at = NULL WHERE id = ?').run(t.id)
      const chosen = topic === 'random' ? null : topic
      log(t.id, 'topic', t.current_province, { topic: chosen, bet: risky }, by)
      return { status: 'question', question: issueQuestion(requireTeam(t.id), t.current_province, 'normal', chosen, risky) }
    })
  }

  // Tỉnh có chủ tạm chưa công thành được: vừa đứng vững (miễn 60 giây) hoặc đang có đội khác công thành.
  // Trả về { blocked: 'calm' | 'besieged', until? } hoặc {}
  function siegeBlock(owner) {
    if (owner.calm_until && owner.calm_until > now()) return { blocked: 'calm', until: owner.calm_until }
    const busy = db.prepare('SELECT started_at FROM duels WHERE room_id = ? AND province_id = ? AND resolved_at IS NULL').all(roomId, owner.province_id)
    return busy.some(d => !timedOut('siege', d.started_at)) ? { blocked: 'besieged' } : {}
  }

  function siege(teamId, by = null) {
    requireRunning()
    const t = requireTeam(teamId)
    requireIdle(t)
    const owner = q.owner.get(roomId, t.current_province)
    if (!owner || owner.team_id === t.id) throw new GameError('no-siege', 'Tỉnh này chưa có đội khác làm chủ')
    if (shieldActive(owner)) throw new GameError('shielded', 'Tỉnh đang có hàng rào', 409)
    const block = siegeBlock(owner)
    if (block.blocked === 'calm') {
      throw new GameError('calm', `Chủ nhà vừa tiếp một đoàn khách — chờ ${Math.ceil((block.until - now()) / 1000)} giây nữa`, 409)
    }
    if (block.blocked === 'besieged') throw new GameError('besieged', 'Một đoàn khách khác đang thử tài ở tỉnh này — chờ một chút', 409)
    return transaction(db, () => {
      log(t.id, 'siege', t.current_province, null, by)
      // Cược số hiệp (chốt 30/10): chưa phát câu — hai đội cược kín 1–3 hiệp trong RULES.siegeBetMs.
      // Đội công thành đứng chờ tại tỉnh (choosing_at: không đi / không nhận câu khác); started_at = hết hạn cược (tỉnh đang bận)
      const until = now() + RULES.siegeBetMs
      db.prepare('UPDATE teams SET choosing_at = ? WHERE id = ?').run(now(), t.id)
      const { lastInsertRowid } = db.prepare(`INSERT INTO duels (room_id, province_id, attacker_id, defender_id, started_at, phase, bet_until)
                                              VALUES (?, ?, ?, ?, ?, 'bet', ?)`).run(roomId, t.current_province, t.id, owner.team_id, until, until)
      return { status: 'siege-bet', duelId: Number(lastInsertRowid), province: t.current_province, until, max: RULES.siegeBetMax }
    })
  }

  // Cược số hiệp — đội công thành hoặc đội giữ tỉnh; ai trong team bấm trước thì tính, cược rồi không đổi.
  // Cả hai đã cược → vào hiệp 1 ngay; không thì chờ hết hạn (settleSiegeBets)
  function betSiege(teamId, duelId, n, by = null) {
    requireRunning()
    const t = requireTeam(teamId)
    const d = db.prepare('SELECT * FROM duels WHERE id = ? AND room_id = ? AND resolved_at IS NULL').get(Number(duelId), roomId)
    const side = d?.attacker_id === t.id ? 'att' : d?.defender_id === t.id ? 'def' : null
    if (!side || d.phase !== 'bet' || now() >= d.bet_until) throw new GameError('bet-closed', 'Đã hết thời gian cược', 409)
    const rounds = Number(n)
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > RULES.siegeBetMax) throw new GameError('bad-bet', `Cược từ 1 đến ${RULES.siegeBetMax} hiệp`)
    if ((side === 'att' ? d.bet_att : d.bet_def) != null) throw new GameError('bet-done', 'Đồng đội đã cược rồi', 409)
    return transaction(db, () => {
      db.prepare(side === 'att' ? 'UPDATE duels SET bet_att = ? WHERE id = ?' : 'UPDATE duels SET bet_def = ? WHERE id = ?').run(rounds, d.id)
      log(t.id, 'siege-bet', d.province_id, { rounds }, by)
      const fresh = q.duel.get(d.id)
      if (fresh.bet_att != null && fresh.bet_def != null) beginDuel(fresh)
      return { ok: true, rounds }
    })
  }

  // Hết hạn cược mà chưa đủ hai bên cược: vào đấu. Server gọi mỗi giây; trả về true nếu có thay đổi
  function settleSiegeBets() {
    if (q.room.get(roomId)?.status !== 'running') return false
    const due = db.prepare("SELECT * FROM duels WHERE room_id = ? AND phase = 'bet' AND resolved_at IS NULL AND bet_until <= ?").all(roomId, now())
    for (const d of due) transaction(db, () => beginDuel(d))
    return due.length > 0
  }

  // Số hiệp = cược lớn hơn; một bên không cược thì theo bên kia; không ai cược: 1 → phát câu hiệp 1. Gọi trong transaction
  function beginDuel(d) {
    const rounds = Math.max(d.bet_att ?? 0, d.bet_def ?? 0) || 1
    db.prepare("UPDATE duels SET phase = 'play', rounds = ? WHERE id = ?").run(rounds, d.id)
    log(d.attacker_id, 'siege-start', d.province_id, { rounds })
    startRound(q.duel.get(d.id), 1, 0)
  }

  // Một hiệp: đội công thành nhận câu thử tài, đội giữ tỉnh nhận cùng câu (thứ tự lựa chọn xáo riêng), cùng hạn chót — ai đúng trước thắng.
  // delayMs: giữa hai hiệp, chờ cả hai bên xem xong kết quả hiệp trước mới tính giờ. Gọi trong transaction
  function startRound(d, roundNo, delayMs) {
    db.prepare('UPDATE teams SET choosing_at = NULL WHERE id = ?').run(d.attacker_id)
    const question = issueQuestion(requireTeam(d.attacker_id), d.province_id, 'siege', null, false, delayMs)
    const n = question.options?.length
    db.prepare(`UPDATE duels SET question_id = ?, defender_order = ?, started_at = ?, defender_answer = NULL, defender_by = NULL, round_no = ?
                WHERE id = ?`).run(question.id, n ? JSON.stringify(shuffled(n)) : null, question.issuedAt, roundNo, d.id)
    // Đội giữ tỉnh đã thấy câu này (phòng thủ) → không phát lại cho họ sau này (bỏ qua = không tính vào thống kê % đúng)
    db.prepare('INSERT OR IGNORE INTO answered (team_id, question_id, correct, skipped, answered_at) VALUES (?, ?, 0, 1, ?)')
      .run(d.defender_id, question.id, now())
  }

  // Đấu nhiều hiệp (d.rounds > 1): một hiệp xong, winner 'att' | 'def'. Thắng đa số; hòa (cược 2, 1–1) → chủ nhà giữ tỉnh.
  // Chưa ngã ngũ → phát câu hiệp sau. Gọi trong transaction. Trả về { no, of, winner, att, def, done: 'attacker' | 'defender' | null, … }
  function roundOver(d, winner) {
    const att = d.att_wins + (winner === 'att' ? 1 : 0), def = d.def_wins + (winner === 'def' ? 1 : 0)
    const need = Math.floor(d.rounds / 2) + 1
    db.prepare('UPDATE duels SET att_wins = ?, def_wins = ? WHERE id = ?').run(att, def, d.id)
    log(d.attacker_id, 'duel-round', d.province_id, { no: d.round_no, of: d.rounds, winner, att, def })
    const round = { no: d.round_no, of: d.rounds, winner, att, def }
    if (att >= need) return { ...round, done: 'attacker' }
    if (def > d.rounds - need) return { ...round, done: 'defender', ...defenderWins(q.duel.get(d.id)) }
    startRound(q.duel.get(d.id), d.round_no + 1, RULES.duelRoundGapMs)
    return { ...round, done: null }
  }

  // Câu hiệp đang dở của đội công thành bị hủy (chủ nhà đúng trước / bỏ cuộc): không gặp lại, không tính vào thống kê % đúng.
  // Gọi trong transaction
  function dropAttackerQuestion(a) {
    if (!a.pending_question) return
    addAnswerTime(a, 'siege')
    db.prepare('INSERT OR IGNORE INTO answered (team_id, question_id, correct, skipped, answered_at) VALUES (?, ?, 0, 1, ?)')
      .run(a.id, a.pending_question, now())
    db.prepare('UPDATE teams SET pending_question = NULL, pending_order = NULL, pending_at = NULL WHERE id = ?').run(a.id)
  }

  // Đội giữ tỉnh thắng trận nhiều hiệp: +50 × số hiệp; đội công thành được mời về tỉnh trước, nghỉ chân 30 giây × số hiệp.
  // Gọi trong transaction. Trả về { defenderBonus, lockedUntil, pushedBack }
  function defenderWins(d) {
    const bonus = RULES.defendBonus * d.rounds
    db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(bonus, d.defender_id)
    log(d.defender_id, 'defend', d.province_id, { bonus })
    db.prepare("UPDATE duels SET resolved_at = ?, result = 'defender' WHERE id = ?").run(now(), d.id)
    calm(d)
    const a = requireTeam(d.attacker_id)
    dropAttackerQuestion(a)
    const lockedUntil = now() + RULES.repelLockMs * d.rounds
    db.prepare('UPDATE teams SET choosing_at = NULL, locked_until = ? WHERE id = ?').run(lockedUntil, a.id)
    log(a.id, 'repelled', d.province_id)
    const pushedBack = !!a.previous_province
    if (pushedBack) {
      db.prepare('UPDATE teams SET current_province = previous_province, previous_province = NULL WHERE id = ?').run(a.id)
      log(a.id, 'pushed-back', a.previous_province)
    }
    return { defenderBonus: bonus, lockedUntil, pushedBack }
  }

  // Đội công thành xong lượt (đúng / sai / bỏ qua / hết giờ) → kết thúc đấu tay đôi. Gọi trong transaction.
  // result: attacker (cướp được) | attacker-fail (đội giữ tỉnh được báo "giữ được tỉnh") | changed (tỉnh đã đổi chủ / có khiên)
  function endDuel(t, result) {
    const d = q.duelOf.get(t.id)
    if (!d) return
    db.prepare('UPDATE duels SET resolved_at = ?, result = ? WHERE id = ?').run(now(), result, d.id)
    if (result === 'attacker-fail') {
      log(d.defender_id, 'held', d.province_id)
      calm(d)
    }
  }
  // Tỉnh vừa đứng vững (không đổi chủ): miễn công thành một lúc — không bị quấy liên tục
  const calm = d => db.prepare('UPDATE ownership SET calm_until = ? WHERE room_id = ? AND province_id = ? AND team_id = ?')
    .run(now() + RULES.siegeCalmMs, roomId, d.province_id, d.defender_id)

  // Đội giữ tỉnh trả lời câu phòng thủ. Đúng trước đội công thành → giữ tỉnh (+50); đội công thành mất câu,
  // bị đẩy về tỉnh trước + khóa 30 giây (không tính là trả lời sai: giữ chuỗi đúng). Sai → không phạt, hết quyền phòng thủ lượt này.
  // Đội công thành đã thua trước (attacker-fail): vẫn trả lời tiếp được tới hết giờ — đúng thì +50 (tỉnh vốn đã giữ được),
  // để +50 không phụ thuộc đội công thành sai nhanh hay chậm. Ai trong team bấm trước thì tính (không bỏ phiếu — đua tốc độ).
  // round: hiệp mà máy đang trả lời (đấu nhiều hiệp) — sang hiệp mới rồi thì đáp án cũ không còn giá trị
  function defend(teamId, duelId, given, by = null, round = null) {
    requireRunning()
    const t = requireTeam(teamId)
    const d = db.prepare('SELECT * FROM duels WHERE id = ? AND defender_id = ?').get(Number(duelId), t.id)
    const attackerDone = d?.result === 'attacker-fail'
    if (d?.phase === 'bet') throw new GameError('betting', 'Hai đội đang cược số hiệp — chờ câu hỏi', 409)
    if (d && round != null && Number(round) !== d.round_no && !d.resolved_at) throw new GameError('round-over', 'Hiệp này đã xong — sang hiệp mới', 409)
    if (!d || (d.resolved_at && !attackerDone) || timedOut('siege', d.started_at)) {
      // Đội công thành vừa cướp được / hết giờ — tỉnh còn của mình thì nói rõ (bấm trễ ngay lúc đội công thành trả lời sai)
      const mine = d && q.owner.get(roomId, d.province_id)?.team_id === t.id
      throw new GameError('no-duel', mine ? `Lượt thử tài đã kết thúc — ${provinces.get(d.province_id).name} vẫn là của bạn` : 'Lượt thử tài này đã kết thúc', 409)
    }
    if (d.defender_answer != null) throw new GameError('answered', 'Đồng đội đã trả lời câu đón khách rồi', 409)
    const question = q.question.get(d.question_id)
    const correct = isCorrect(question, json(d.defender_order), given)
    return transaction(db, () => {
      db.prepare('UPDATE duels SET defender_answer = ?, defender_by = ? WHERE id = ?').run(correct ? 1 : 0, by, d.id)
      if (!correct) {
        log(t.id, 'defend-fail', d.province_id, null, by)
        return { correct: false, province: d.province_id }
      }
      // Đấu nhiều hiệp: chủ nhà đúng trước → thắng hiệp này (thưởng tính lúc thắng cả trận)
      if (d.rounds > 1) {
        const a = requireTeam(d.attacker_id)
        dropAttackerQuestion(a)
        const round = roundOver(d, 'def')
        saveResult(requireTeam(a.id), { questionId: d.question_id, province: d.province_id, siege: true, correct: false, roundLost: true, round,
          ...(round.done === 'defender' ? { repelled: true, lockedUntil: round.lockedUntil, pushedBack: round.pushedBack } : {}) }, null)
        return { correct: true, round, held: round.done === 'defender', bonus: round.defenderBonus ?? 0, province: d.province_id,
          correctAnswer: correctAnswerText(question), explanation: question.explanation }
      }
      db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(RULES.defendBonus, t.id)
      log(t.id, 'defend', d.province_id, { bonus: RULES.defendBonus }, by)
      if (!attackerDone) {
        db.prepare('UPDATE duels SET resolved_at = ?, result = ? WHERE id = ?').run(now(), 'defender', d.id)
        calm(d)
        repel(requireTeam(d.attacker_id), d)
      }
      return { correct: true, held: true, attackerDone, bonus: RULES.defendBonus, province: d.province_id,
        correctAnswer: correctAnswerText(question), explanation: question.explanation }
    })
  }

  // Đội công thành thua đấu tay đôi: hủy câu, đẩy về tỉnh trước, khóa ngắn. Gọi trong transaction.
  function repel(a, d) {
    if (a.pending_question !== d.question_id) return
    addAnswerTime(a, 'siege')
    db.prepare(`INSERT OR IGNORE INTO answered (team_id, question_id, correct, skipped, answered_at) VALUES (?, ?, 0, 1, ?)`)
      .run(a.id, d.question_id, now()) // không gặp lại câu này; không tính vào thống kê % đúng
    db.prepare('UPDATE teams SET pending_question = NULL, pending_order = NULL, pending_at = NULL, locked_until = ? WHERE id = ?')
      .run(now() + RULES.repelLockMs, a.id)
    log(a.id, 'repelled', d.province_id)
    const pushedBack = !!a.previous_province
    if (pushedBack) {
      db.prepare('UPDATE teams SET current_province = previous_province, previous_province = NULL WHERE id = ?').run(a.id)
      log(a.id, 'pushed-back', a.previous_province)
    }
    saveResult(a, { questionId: d.question_id, province: d.province_id, siege: true, correct: false, repelled: true,
      lockedUntil: now() + RULES.repelLockMs, pushedBack }, null)
  }

  function retreat(teamId, by = null) {
    requireRunning()
    const t = requireTeam(teamId)
    if (t.locked_until && t.locked_until > now()) throw new GameError('locked', 'Team đang nghỉ chân', 423)
    // Đang có câu hỏi thì phải "Bỏ qua" (có khóa 10 giây) — không rút lui để né câu hỏi
    if (t.pending_question || t.choosing_at) throw new GameError('pending', 'Đang có câu hỏi — dùng "Bỏ qua" nếu muốn rời tỉnh', 409)
    if (!t.previous_province) throw new GameError('no-retreat', 'Không có tỉnh để rút về')
    transaction(db, () => {
      db.prepare(`UPDATE teams SET current_province = previous_province, previous_province = NULL,
                  pending_question = NULL, pending_order = NULL, pending_at = NULL WHERE id = ?`).run(t.id)
      log(t.id, 'retreat', t.previous_province, null, by)
    })
    return { status: 'retreated', province: t.previous_province }
  }

  // Chiếm tỉnh hiện tại (gọi trong transaction). Phòng đơn: nhận tem (questionId: câu vừa đúng — sổ tay lấy lời giải)
  function capture(t, provinceId, isSiege, by, questionId = null) {
    if (isSolo()) return stampProvince(t, provinceId, by, questionId)
    const owner = q.owner.get(roomId, provinceId)
    if (!isSiege && owner) return { captured: false, reason: 'taken' }           // team khác vừa chiếm trước
    if (isSiege && (!owner || owner.team_id === t.id)) return { captured: false, reason: 'changed' }
    if (isSiege && shieldActive(owner)) return { captured: false, reason: 'shielded' }

    db.prepare(`INSERT INTO ownership (room_id, province_id, team_id, captured_at, shield_until) VALUES (?, ?, ?, ?, NULL)
                ON CONFLICT(room_id, province_id) DO UPDATE SET team_id = excluded.team_id,
                  captured_at = excluded.captured_at, shield_until = NULL, calm_until = NULL`).run(roomId, provinceId, t.id, now())

    let bonus = 0
    if (isSiege) bonus += RULES.stealBonus
    const event = activeEvent()
    const p = provinces.get(provinceId)
    if (event?.kind === 'festival' && event.region === p.region) bonus += RULES.festivalBonus
    if (bonus) db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(bonus, t.id)

    let card = null
    if (p.is_city && q.cards.all(t.id).length < RULES.maxCards) {
      card = CARD_KINDS[Math.floor(random() * CARD_KINDS.length)]
      db.prepare('INSERT INTO cards (team_id, kind) VALUES (?, ?)').run(t.id, card)
    }
    if (isSiege) log(t.id, 'steal', provinceId, { fromTeam: owner.team_id }, by)
    else log(t.id, 'capture', provinceId, null, by)
    return { captured: true, bonus, card, home: homeBonus(t, provinceId, by) }
  }

  // Phòng đơn: tem + điểm tỉnh. Người đầu tiên trong phòng có tem tỉnh này (phòng bật Tiên phong) → tem vàng +50.
  // Đua tỉnh: server xử lý tuần tự nên ai được ghi trước là người đúng trước. Gọi trong transaction
  function stampProvince(t, provinceId, by, questionId) {
    const p = provinces.get(provinceId)
    // (tem tỉnh xuất phát không có câu hỏi → không tính là đã có người tới trước)
    const first = !!q.room.get(roomId).pioneer
      && !db.prepare('SELECT 1 FROM stamps WHERE room_id = ? AND province_id = ? AND question_id IS NOT NULL').get(roomId, provinceId)
    q.addStamp.run(roomId, t.id, provinceId, first ? 1 : 0, questionId, now())
    let bonus = 0
    const event = activeEvent()
    if (event?.kind === 'festival' && event.region === p.region) bonus += RULES.festivalBonus
    if (first) bonus += RULES.pioneerBonus
    if (bonus) db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(bonus, t.id)
    let card = null
    if (p.is_city && q.cards.all(t.id).length < RULES.maxCards) {
      card = SOLO_CARD_KINDS[Math.floor(random() * SOLO_CARD_KINDS.length)]
      db.prepare('INSERT INTO cards (team_id, kind) VALUES (?, ?)').run(t.id, card)
    }
    log(t.id, 'capture', provinceId, null, by)
    if (first) log(t.id, 'pioneer', provinceId, { bonus: RULES.pioneerBonus }, by)
    return { captured: true, bonus, card, home: homeBonus(t, provinceId, by), pioneer: first ? RULES.pioneerBonus : 0, stamp: true }
  }

  // Về quê: tỉnh vừa chiếm là quê của thành viên team → +50, mỗi tỉnh 1 lần, tối đa RULES.homeMax tỉnh.
  // Ghi vào nhật ký team (action 'home'); bản tin màn chiếu không lấy action này. Trả về { names, bonus, n } hoặc null
  function homeBonus(t, provinceId, by) {
    const names = db.prepare('SELECT name FROM players WHERE team_id = ? AND home = ? ORDER BY id').all(t.id, provinceId).map(r => r.name)
    if (!names.length) return null
    const done = db.prepare("SELECT province_id FROM events_log WHERE team_id = ? AND action = 'home'").all(t.id).map(r => r.province_id)
    if (done.includes(provinceId) || done.length >= RULES.homeMax) return null
    db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(RULES.homeBonus, t.id)
    log(t.id, 'home', provinceId, { bonus: RULES.homeBonus, names }, by)
    return { names, bonus: RULES.homeBonus, n: done.length + 1 }
  }

  // Điểm bị trừ theo thời gian trả lời (trừ vào điểm thưởng, một lần, lúc chiếm được tỉnh).
  // extraMs: thẻ Thêm giờ — dời cả khoảng được đủ điểm lẫn hạn chót
  function timePenalty(points, difficulty, elapsedMs, extraMs = 0) {
    const free = RULES.answerFreeMs[difficulty] + extraMs, limit = RULES.answerLimitMs[difficulty] + extraMs
    if (elapsedMs <= free) return 0
    return Math.round(points * Math.min(1, (elapsedMs - free) / (limit - free)))
  }

  // Chuỗi đúng: cứ RULES.streakEvery câu đúng liên tiếp → 1 thẻ trợ giúp ngẫu nhiên; khay đã đầy thì điểm thưởng thay thẻ.
  // Gọi trong transaction (sau khi chiếm tỉnh — thẻ rơi từ thành phố đã nằm trong khay). Trả về { n, card, bonus }.
  function bumpStreak(t, provinceId, by) {
    const n = t.streak + 1
    db.prepare('UPDATE teams SET streak = ? WHERE id = ?').run(n, t.id)
    if (n % RULES.streakEvery) return { n, card: null, bonus: 0 }
    let card = null, bonus = 0
    if (q.cards.all(t.id).length < RULES.maxCards) {
      card = HELP_CARDS[Math.floor(random() * HELP_CARDS.length)]
      db.prepare('INSERT INTO cards (team_id, kind) VALUES (?, ?)').run(t.id, card)
    } else {
      bonus = RULES.streakFullBonus
      db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(bonus, t.id)
    }
    log(t.id, 'streak', provinceId, { n, card, bonus }, by)
    return { n, card, bonus }
  }

  // Trả lời sai hoặc hết giờ: khóa (câu vàng: khóa ×2); công thành thì bị đẩy về tỉnh trước; mất chuỗi đúng. Gọi trong transaction.
  // Không lộ đáp án đúng (team khác có thể gặp lại câu này).
  function failQuestion(t, question, timeout, by) {
    const isSiege = question.difficulty === 'siege' && !isSolo() // phòng đơn: câu thử tài chỉ là câu vàng (không đẩy về)
    addAnswerTime(t, question.difficulty)
    db.prepare(`INSERT INTO answered (team_id, question_id, correct, answered_at) VALUES (?, ?, 0, ?)
                ON CONFLICT(team_id, question_id) DO UPDATE SET correct = 0, answered_at = excluded.answered_at`)
      .run(t.id, question.id, now())
    // Đấu nhiều hiệp: đội công thành sai / hết giờ → chủ nhà thắng hiệp này (chưa nghỉ chân trừ khi thua cả trận)
    const duel = isSiege ? q.duelOf.get(t.id) : null
    if (duel?.rounds > 1) {
      db.prepare('UPDATE teams SET pending_question = NULL, pending_order = NULL, pending_at = NULL, streak = 0 WHERE id = ?').run(t.id)
      log(t.id, 'siege-fail', question.province_id, timeout ? { timeout: true } : null, by)
      const round = roundOver(duel, 'def')
      const result = { correct: false, timeout, round, lostStreak: t.streak,
        ...(round.done === 'defender' ? { lockedUntil: round.lockedUntil, pushedBack: round.pushedBack } : {}) }
      saveResult(t, { questionId: question.id, province: question.province_id, siege: true, ...result }, by)
      return result
    }
    // Câu vàng: khóa ×2; "Liều": khóa thêm 30 giây
    const lockMs = (isSiege ? RULES.lockSiegeWrongMs : RULES.lockWrongMs) * (t.pending_golden ? RULES.goldenLockFactor : 1)
      + (t.pending_bet ? RULES.betExtraLockMs : 0)
    db.prepare('UPDATE teams SET pending_question = NULL, pending_order = NULL, pending_at = NULL, locked_until = ?, streak = 0 WHERE id = ?')
      .run(now() + lockMs, t.id)
    log(t.id, isSiege ? 'siege-fail' : 'wrong', question.province_id, timeout ? { timeout: true } : null, by)
    if (isSiege) endDuel(t, 'attacker-fail')
    const pushedBack = isSiege && !!t.previous_province
    if (pushedBack) {
      db.prepare('UPDATE teams SET current_province = previous_province, previous_province = NULL WHERE id = ?').run(t.id)
      log(t.id, 'pushed-back', t.previous_province)
    }
    const result = { correct: false, timeout, lockedUntil: now() + lockMs, pushedBack, golden: !!t.pending_golden, bet: !!t.pending_bet, lostStreak: t.streak }
    saveResult(t, { questionId: question.id, province: question.province_id, siege: isSiege, ...result }, by)
    return result
  }

  function answer(teamId, questionId, given, by = null) {
    requireRunning()
    const t = requireTeam(teamId)
    if (!t.pending_question || t.pending_question !== questionId) {
      throw new GameError('no-pending', 'Câu hỏi này đã được trả lời (có thể bởi đồng đội)', 409)
    }
    const question = q.question.get(questionId)
    const order = json(t.pending_order)
    if (timedOut(question.difficulty, t.pending_at, t.pending_extra_ms)) return transaction(db, () => failQuestion(t, question, true, by))
    const correct = isCorrect(question, order, given)
    if (!correct) return transaction(db, () => failQuestion(t, question, false, by))

    return transaction(db, () => {
      addAnswerTime(t, question.difficulty)
      db.prepare(`INSERT INTO answered (team_id, question_id, correct, answered_at) VALUES (?, ?, 1, ?)
                  ON CONFLICT(team_id, question_id) DO UPDATE SET correct = 1, answered_at = excluded.answered_at`)
        .run(t.id, questionId, now())
      db.prepare('UPDATE teams SET pending_question = NULL, pending_order = NULL, pending_at = NULL WHERE id = ?').run(t.id)
      const isSiege = question.difficulty === 'siege' && !isSolo()
      // Đấu nhiều hiệp: đúng trước chủ nhà → thắng hiệp; chưa thắng đủ đa số thì sang hiệp sau (chưa cướp tỉnh)
      const duel = isSiege ? q.duelOf.get(t.id) : null
      const round = duel?.rounds > 1 ? roundOver(duel, 'att') : null
      if (round && round.done !== 'attacker') {
        const result = {
          correct: true, captured: false, round,
          streak: bumpStreak(t, question.province_id, by),
          correctAnswer: correctAnswerText(question, order),
          explanation: question.explanation,
        }
        saveResult(t, { questionId, province: question.province_id, siege: true, ...result }, by)
        return result
      }
      const points = provinces.get(question.province_id).points
      const elapsed = now() - t.pending_at
      // Thưởng / trừ của riêng câu này, mỗi khoản tính trên điểm tỉnh: trừ chậm, câu vàng +100% (= ×2), siêu tốc (≤ 5 giây) +10%.
      // Phòng nhiều câu/tỉnh: cộng dồn qua các câu, lúc cắm cờ lấy trung bình (1 câu/tỉnh = đúng như luật gốc)
      const part = {
        penalty: timePenalty(points, question.difficulty, elapsed, t.pending_extra_ms),
        golden: t.pending_golden ? points : 0,
        speed: elapsed <= RULES.speedBonusMs ? Math.round(points * RULES.speedBonusRatio) : 0,
      }
      const need = isSiege ? 1 : q.room.get(roomId).quiz_count
      const prog = isSiege ? null : progressOf(t)
      const done = (prog?.done ?? 0) + 1
      const sum = k => (prog?.[k] ?? 0) + part[k]
      // Chưa đủ số câu (và tỉnh vẫn còn trống): ghi tiến độ, chưa cắm cờ — team bấm "Câu tiếp theo" (= trả lời lại) để nhận câu sau
      if (done < need && (isSolo() || !q.owner.get(roomId, question.province_id))) {
        db.prepare('UPDATE teams SET progress = ? WHERE id = ?').run(JSON.stringify({
          province: question.province_id, done, penalty: sum('penalty'), golden: sum('golden'), speed: sum('speed'), bet: !!t.pending_bet,
        }), t.id)
        log(t.id, 'progress', question.province_id, { done, of: need }, by)
        const result = {
          correct: true, captured: false, progress: { done, of: need },
          golden: !!t.pending_golden, bet: !!t.pending_bet,
          streak: bumpStreak(t, question.province_id, by),
          correctAnswer: correctAnswerText(question, order),
          explanation: question.explanation,
          react: RULES.reactTopics[question.topic] ?? null,
        }
        saveResult(t, { questionId, province: question.province_id, siege: false, ...result }, by)
        return result
      }
      db.prepare('UPDATE teams SET progress = NULL WHERE id = ?').run(t.id)
      const captured = capture(t, question.province_id, isSiege, by, question.id)
      if (isSiege) endDuel(t, captured.captured ? 'attacker' : 'changed')
      // Thắng trận nhiều hiệp: +50 × số hiệp (capture đã cộng +50 cướp tỉnh)
      if (round && captured.captured) {
        const more = RULES.stealBonus * (duel.rounds - 1)
        db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(more, t.id)
        captured.bonus += more
      }
      let penalty = 0, goldenBonus = 0, betBonus = 0, speedBonus = 0
      if (captured.captured) {
        penalty = Math.round(sum('penalty') / need)
        if (penalty) {
          db.prepare('UPDATE teams SET bonus_points = bonus_points - ? WHERE id = ?').run(penalty, t.id)
          log(t.id, 'time-penalty', question.province_id, { penalty })
        }
        goldenBonus = Math.round(sum('golden') / need)
        if (t.pending_bet) betBonus = Math.round(points * RULES.betBonusRatio) // "Liều" +50%: chọn một lần cho cả tỉnh
        speedBonus = Math.round(sum('speed') / need)
        const extra = goldenBonus + betBonus + speedBonus
        if (extra) db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(extra, t.id)
        if (speedBonus) log(t.id, 'speed', question.province_id, { bonus: speedBonus, ms: elapsed }, by)
      }
      // Đúng là được tính chuỗi, kể cả khi tỉnh vừa bị đội khác chiếm trước
      const streak = bumpStreak(t, question.province_id, by)
      const result = {
        correct: true,
        ...captured,
        ...(round ? { round } : {}),
        penalty,
        golden: !!t.pending_golden,
        goldenBonus,
        bet: !!t.pending_bet,
        betBonus,
        speedBonus,
        streak,
        correctAnswer: correctAnswerText(question, order),
        explanation: question.explanation,
        react: RULES.reactTopics[question.topic] ?? null, // mời bấm "Đã từng / Muốn thử" (mỗi người tự chọn)
      }
      saveResult(t, { questionId, province: question.province_id, siege: isSiege, ...result }, by)
      return result
    })
  }

  // Bỏ phiếu đáp án (câu trắc nghiệm / đúng-sai): đồng đội thấy ai chọn gì. Mọi thành viên đang mở trang
  // (onlineIds — server realtime biết) cùng chọn một đáp án → tự chốt (trả lời luôn); team chỉ 1 người online thì bấm là chốt.
  // Ai bấm "Chốt" thì nộp đáp án mình đang chọn (= answer). Trả về { voted, votes } hoặc kết quả trả lời ({ correct… }).
  function vote(teamId, playerId, questionId, given, by = null, onlineIds = []) {
    requireRunning()
    const t = requireTeam(teamId)
    if (!t.pending_question || t.pending_question !== questionId) {
      throw new GameError('no-pending', 'Câu hỏi này đã được trả lời (có thể bởi đồng đội)', 409)
    }
    const question = q.question.get(questionId)
    if (question.kind === 'text') throw new GameError('bad-answer', 'Câu tự điền gửi thẳng câu trả lời, không bỏ phiếu')
    if (timedOut(question.difficulty, t.pending_at, t.pending_extra_ms)) return transaction(db, () => failQuestion(t, question, true, by))
    isCorrect(question, json(t.pending_order), given) // chỉ để kiểm tra đáp án hợp lệ (sai định dạng → lỗi)
    if (json(t.pending_hidden)?.includes(given)) throw new GameError('bad-answer', 'Đáp án này đã bị loại (50:50)')
    const votes = json(t.pending_votes) ?? {}
    votes[playerId] = { name: by, answer: given }
    const online = new Set([...onlineIds, playerId])
    if ([...online].every(id => votes[id] && votes[id].answer === given)) return answer(teamId, questionId, given, by)
    db.prepare('UPDATE teams SET pending_votes = ? WHERE id = ?').run(JSON.stringify(votes), t.id)
    return { voted: true, votes: Object.values(votes) }
  }

  // Khóa khi bỏ qua: 10 giây + thời gian đã xem câu hỏi, tối đa bằng khóa khi trả lời sai —
  // để chờ tới gần hết giờ mới bỏ qua không có lợi hơn để hết giờ
  function skipLockMs(difficulty, elapsedMs) {
    const cap = difficulty === 'siege' ? RULES.lockSiegeWrongMs : RULES.lockWrongMs
    return Math.min(cap, RULES.lockSkipMs + Math.max(0, elapsedMs))
  }

  // Bỏ qua câu đang chờ: hủy câu (không gặp lại), lùi về tỉnh trước, khóa (xem skipLockMs), mất chuỗi đúng.
  // Đã quá giờ thì tính như hết giờ. Không lộ đáp án; không tính vào thống kê % đúng.
  function skip(teamId, by = null) {
    requireRunning()
    const t = requireTeam(teamId)
    const duel = q.duelOf.get(t.id)
    if (duel?.phase === 'bet') return transaction(db, () => abandonSiege(t, duel, by))
    if (t.choosing_at && !t.pending_question) return skipChoosing(t, by)
    if (!t.pending_question) throw new GameError('no-pending', 'Không có câu hỏi nào đang chờ', 409)
    const question = q.question.get(t.pending_question)
    if (timedOut(question.difficulty, t.pending_at, t.pending_extra_ms)) return transaction(db, () => failQuestion(t, question, true, by))
    const lockMs = skipLockMs(question.difficulty, now() - t.pending_at)
    return transaction(db, () => {
      addAnswerTime(t, question.difficulty) // bỏ qua vẫn tính thời gian đã xem — không thành cách "tiết kiệm giờ"
      db.prepare(`INSERT OR IGNORE INTO answered (team_id, question_id, correct, skipped, answered_at)
                  VALUES (?, ?, 0, 1, ?)`).run(t.id, question.id, now())
      db.prepare(`UPDATE teams SET pending_question = NULL, pending_order = NULL, pending_at = NULL, locked_until = ?, streak = 0
                  WHERE id = ?`).run(now() + lockMs, t.id)
      log(t.id, 'skip', question.province_id, null, by)
      // Đấu nhiều hiệp: bỏ qua = bỏ cuộc cả trận (chủ nhà thắng, đội công thành nghỉ chân theo số hiệp)
      if (duel?.rounds > 1) {
        const lost = defenderWins(duel)
        const result = { skipped: true, correct: false, lockedUntil: lost.lockedUntil, province: requireTeam(t.id).current_province }
        saveResult(t, { questionId: question.id, siege: true, ...result, province: question.province_id, backTo: result.province }, by)
        return result
      }
      if (question.difficulty === 'siege') endDuel(t, 'attacker-fail') // không có đấu tay đôi (phòng đơn) thì không làm gì
      const back = t.previous_province
      if (back) {
        db.prepare('UPDATE teams SET current_province = previous_province, previous_province = NULL WHERE id = ?').run(t.id)
        log(t.id, 'retreat', back, null, by)
      }
      const result = { skipped: true, correct: false, lockedUntil: now() + lockMs, province: back ?? t.current_province }
      saveResult(t, { questionId: question.id, siege: question.difficulty === 'siege' && !isSolo(), ...result, province: question.province_id, backTo: result.province }, by)
      return result
    })
  }

  // Bỏ qua lúc đang cược thử tài: thôi thử tài — chủ nhà giữ tỉnh (miễn thử tài một lúc), đội công thành lùi về + nghỉ ngắn
  function abandonSiege(t, d, by) {
    const lockMs = RULES.lockSkipMs
    db.prepare("UPDATE duels SET resolved_at = ?, result = 'attacker-fail' WHERE id = ?").run(now(), d.id)
    calm(d)
    db.prepare('UPDATE teams SET choosing_at = NULL, locked_until = ? WHERE id = ?').run(now() + lockMs, t.id)
    log(t.id, 'skip', d.province_id, null, by)
    const back = t.previous_province
    if (back) {
      db.prepare('UPDATE teams SET current_province = previous_province, previous_province = NULL WHERE id = ?').run(t.id)
      log(t.id, 'retreat', back, null, by)
    }
    const result = { skipped: true, correct: false, lockedUntil: now() + lockMs, province: back ?? t.current_province }
    saveResult(t, { siege: true, ...result, province: d.province_id, backTo: result.province }, by)
    return result
  }

  // Bỏ qua khi đang chọn chủ đề: cùng luật bỏ qua câu thường (tính thời gian từ lúc tới tỉnh)
  function skipChoosing(t, by) {
    const lockMs = skipLockMs('normal', now() - t.choosing_at)
    return transaction(db, () => {
      db.prepare('UPDATE teams SET choosing_at = NULL, locked_until = ?, streak = 0 WHERE id = ?').run(now() + lockMs, t.id)
      log(t.id, 'skip', t.current_province, null, by)
      const back = t.previous_province
      if (back) {
        db.prepare('UPDATE teams SET current_province = previous_province, previous_province = NULL WHERE id = ?').run(t.id)
        log(t.id, 'retreat', back, null, by)
      }
      const result = { skipped: true, correct: false, lockedUntil: now() + lockMs, province: back ?? t.current_province }
      saveResult(t, { siege: false, ...result, province: t.current_province, backTo: result.province }, by)
      return result
    })
  }

  // Câu hỏi của team đã quá giờ: xử sai (server gọi định kỳ)
  function expireTeam(teamId) {
    transaction(db, () => {
      const t = requireTeam(teamId)
      if (!t.pending_question || !timedOut(q.question.get(t.pending_question).difficulty, t.pending_at, t.pending_extra_ms)) return
      failQuestion(t, q.question.get(t.pending_question), true, null)
    })
  }

  function useCard(teamId, cardId, target, by = null) {
    requireRunning()
    const t = requireTeam(teamId)
    const card = q.card.get(cardId, t.id)
    if (!card || card.used_at) throw new GameError('no-card', 'Thẻ không tồn tại hoặc đã dùng')

    // Thẻ trợ giúp chỉ dùng được khi đang có câu hỏi; mỗi loại một lần cho mỗi câu
    if (HELP_CARDS.includes(card.kind)) {
      if (!t.pending_question || timedOut(q.question.get(t.pending_question).difficulty, t.pending_at, t.pending_extra_ms)) {
        throw new GameError('no-pending', 'Thẻ trợ giúp chỉ dùng được khi đang trả lời câu hỏi', 409)
      }
      if (card.kind === 'fifty' && (q.question.get(t.pending_question).kind !== 'choice' || t.pending_hidden)) {
        throw new GameError('bad-target', t.pending_hidden ? 'Câu này đã dùng 50:50 rồi' : '50:50 chỉ dùng cho câu trắc nghiệm', 409)
      }
      if (card.kind === 'time' && t.pending_extra_ms) throw new GameError('bad-target', 'Câu này đã được thêm giờ rồi', 409)
    }

    return transaction(db, () => {
      let result
      if (card.kind === 'fifty') {
        // Ẩn 2 đáp án sai (vị trí theo thứ tự đã xáo gửi cho client) — vẫn không lộ đáp án đúng
        const question = q.question.get(t.pending_question)
        const expected = json(question.answer)
        const wrong = json(t.pending_order).map((orig, i) => (orig === expected ? -1 : i)).filter(i => i >= 0)
        const hidden = []
        while (hidden.length < 2 && wrong.length) hidden.push(...wrong.splice(Math.floor(random() * wrong.length), 1))
        hidden.sort((a, b) => a - b)
        db.prepare('UPDATE teams SET pending_hidden = ? WHERE id = ?').run(JSON.stringify(hidden), t.id)
        result = { kind: 'fifty', hidden }
      } else if (card.kind === 'time') {
        db.prepare('UPDATE teams SET pending_extra_ms = ? WHERE id = ?').run(RULES.extraTimeMs, t.id)
        result = { kind: 'time', extraMs: RULES.extraTimeMs }
      } else if (card.kind === 'scout') {
        if (!REGIONS.includes(target)) throw new GameError('bad-target', 'Chọn một miền để nhìn bằng ống nhòm')
        // Phòng đơn: vén mây cả miền, kèm số người có tem từng tỉnh (không lộ là ai)
        if (isSolo()) {
          const counts = Object.fromEntries(q.stampCounts.all(roomId).filter(r => provinces.get(r.province_id).region === target).map(r => [r.province_id, r.n]))
          result = { kind: 'scout', region: target, revealed: [], counts, until: now() + RULES.scoutMs }
        }
        // Chỉ lộ tỉnh nào đã có chủ, KHÔNG lộ là team nào
        const revealed = q.owners.all(roomId)
          .filter(o => provinces.get(o.province_id).region === target && o.team_id !== t.id)
          .map(o => o.province_id)
        result ??= { kind: 'scout', region: target, revealed, until: now() + RULES.scoutMs }
      } else if (card.kind === 'shield') {
        const owner = q.owner.get(roomId, target)
        if (owner?.team_id !== t.id) throw new GameError('bad-target', 'Chỉ dựng hàng rào được ở tỉnh của mình')
        db.prepare('UPDATE ownership SET shield_until = ? WHERE room_id = ? AND province_id = ?').run(now() + RULES.shieldMs, roomId, target)
        result = { kind: 'shield', province: target, until: now() + RULES.shieldMs }
      } else {
        db.prepare('UPDATE teams SET march_ready = 1 WHERE id = ?').run(t.id)
        result = { kind: 'march' }
      }
      db.prepare('UPDATE cards SET used_at = ? WHERE id = ?').run(now(), card.id)
      log(t.id, 'card', card.kind === 'shield' ? target : null, { kind: card.kind }, by)
      return result
    })
  }

  // "Đã từng / Muốn thử": chỉ cho tỉnh + loại mà team của người này đã trả lời đúng câu tương ứng; value null = bỏ chọn.
  // Trả về số đếm gộp cả phòng (không tên, không theo team)
  function react(teamId, playerId, provinceId, kind, value) {
    if (state().status === 'waiting') throw new GameError('not-started', 'Trận đấu chưa bắt đầu', 409)
    const topics = Object.entries(RULES.reactTopics).filter(([, k]) => k === kind).map(([tp]) => tp)
    if (!topics.length || ![null, 'been', 'want'].includes(value)) throw new GameError('bad-react', 'Lựa chọn không hợp lệ')
    const earned = db.prepare(`SELECT 1 FROM answered a JOIN questions q ON q.id = a.question_id
                               WHERE a.team_id = ? AND a.correct = 1 AND q.province_id = ? AND q.topic IN (${topics.map(() => '?').join(', ')})`)
      .get(teamId, provinceId, ...topics)
    if (!earned) throw new GameError('bad-react', 'Chưa trả lời đúng câu này', 409)
    if (value) {
      db.prepare(`INSERT INTO reactions (room_id, player_id, province_id, kind, value) VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(player_id, province_id, kind) DO UPDATE SET value = excluded.value`).run(roomId, playerId, provinceId, kind, value)
    } else {
      db.prepare('DELETE FROM reactions WHERE player_id = ? AND province_id = ? AND kind = ?').run(playerId, provinceId, kind)
    }
    const count = v => db.prepare('SELECT COUNT(*) AS n FROM reactions WHERE room_id = ? AND province_id = ? AND kind = ? AND value = ?').get(roomId, provinceId, kind, v).n
    return { been: count('been'), want: count('want'), mine: value }
  }

  return { react, move, retry, availableTopics, choiceFor, siegeBlock, chooseTopic, siege, betSiege, settleSiegeBets, retreat, answer, vote, defend, skip, expireTeam, useCard }
}
