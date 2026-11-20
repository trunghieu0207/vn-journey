// Chế độ "Chạy trạm": trạng thái hành trình của từng team (teams.tram, JSON chỉ server đọc),
// bắt đầu trận (thời kỳ, rải key, mảnh ghép). Các luật gợi ý / cứu / câu hỏi / ghép thêm ở các task sau.

import { transaction } from '../db.js'
import { RULES, GameError, timePenaltyOf } from './rules.js'

const TRIES = 200

// Rải n key cho tỉnh xuất phát `start` theo "chuỗi": key sau cách key trước (key đầu: cách start) đúng 2 bước giáp ranh,
// không key nào là start / kề start, không hai key kề nhau → đường đi ngắn nhất qua mọi key ≤ 2n bước, như nhau cho mọi team
// (luật cũ "mỗi miền ≥ 1 key" bắt chạy dọc đất nước ~20 bước, quá lâu). Bí đường thì nới bước nhảy 2 → 2–3 → 2–4;
// vẫn không được → n ứng viên bất kỳ không kề start; còn thiếu nữa → cho cả tỉnh kề start (không bao giờ là start).
// Thử ngẫu nhiên tối đa 200 lần mỗi mức. `random` truyền vào (ctx.random) để test cố định được.
export function placeKeys(start, n, eligible, { adjacency, random }) {
  const steps = from => { // BFS: số bước giáp ranh từ `from`
    const d = new Map([[from, 0]]), queue = [from]
    for (let i = 0; i < queue.length; i++) for (const nb of adjacency.get(queue[i])) if (!d.has(nb)) { d.set(nb, d.get(queue[i]) + 1); queue.push(nb) }
    return d
  }
  const far = eligible.filter(id => id !== start && !adjacency.get(start).has(id))
  const pickOne = list => list[Math.floor(random() * list.length)]
  for (const hops of [[2], [2, 3], [2, 3, 4]]) {
    for (let i = 0; i < TRIES; i++) {
      const keys = []
      let d = steps(start)
      while (keys.length < n) {
        const c = far.filter(id => !keys.includes(id) && hops.includes(d.get(id)) && keys.every(k => !adjacency.get(k).has(id)))
        if (!c.length) break
        keys.push(pickOne(c))
        d = steps(keys.at(-1))
      }
      if (keys.length === n) return keys
    }
  }
  const shuffled = pool => {
    const a = [...pool]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a.slice(0, n)
  }
  // Không xếp được chuỗi (ít tỉnh có gợi ý): n tỉnh bất kỳ không kề start, thiếu thì cho cả tỉnh kề start
  return far.length >= n ? shuffled(far) : shuffled(eligible.filter(id => id !== start))
}

// Thứ tự mảnh ghép hiện cho team: lưu server-side lúc vào câu ghép (st.puzzle.display), client không tự suy ra được.
// View (Task 8) gửi các mảnh theo thứ tự này
export const puzzleDisplay = st => st.puzzle.display

export function createTram(ctx) {
  const { db, q, now, random, json, provinces, adjacency, roomId, log, tram: content, requireRunning, requireTeam, isTram, closeRoom, scoreOf } = ctx

  const state = t => json(t.tram)
  const save = (teamId, st) => db.prepare('UPDATE teams SET tram = ? WHERE id = ?').run(JSON.stringify(st), teamId)

  // Bắt đầu trận (gọi trong transaction): mỗi team một thời kỳ ngẫu nhiên, n key và hoán vị mảnh ghép
  function setupTeams(pairs) {
    const n = q.room.get(roomId).key_count
    const periodIds = [...content.periods.keys()]
    const eligible = [...content.hints.keys()]
    for (const [teamId, start] of pairs) {
      const keys = placeKeys(start, n, eligible, { provinces, adjacency, random })
      if (keys.length < n) throw new GameError('tram-content', `Không đủ tỉnh có gợi ý đã duyệt để rải ${n} key — cần duyệt thêm gợi ý`, 409)
      const perm = [...Array(n).keys()]
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[perm[i], perm[j]] = [perm[j], perm[i]]
      }
      save(teamId, {
        period: periodIds[Math.floor(random() * periodIds.length)],
        need: n,
        keys: keys.map((province, i) => ({ province, piece: perm[i], hint: 0, hintAt: null, found: false, foundAt: null })),
        hints: [], correct: 0, rescued: false, star: 'ready', stage: 'map',
        openedAt: null, free: 0,
        special: { done: 0, seen: [], pending: null, lockedUntil: null },
        puzzle: { lockedUntil: null, tries: 0 },
        finishedAt: null, finishBonus: 0,
      })
    }
  }

  // Tạm dừng xong (gọi trong transaction): dời các mốc giờ trong teams.tram thêm gapMs.
  // Câu map đang chờ luôn dời (giờ trả lời không tính lúc dừng, như pending_at của câu tỉnh); các mốc khóa chỉ dời khi còn sau pausedAt
  function shift(gapMs, pausedAt) {
    for (const row of db.prepare('SELECT id, tram FROM teams WHERE room_id = ? AND tram IS NOT NULL').all(roomId)) {
      const st = json(row.tram)
      if (st.special.pending) st.special.pending.at += gapMs
      for (const o of [st.special, st.puzzle]) if (o.lockedUntil && o.lockedUntil > pausedAt) o.lockedUntil += gapMs
      save(row.id, st)
    }
  }

  // Khoảng cách BFS (số bước) từ `from` tới mọi tỉnh
  function distances(from) {
    const dist = new Map([[from, 0]])
    const queue = [from]
    for (let i = 0; i < queue.length; i++) {
      for (const n of adjacency.get(queue[i]) ?? []) {
        if (!dist.has(n)) { dist.set(n, dist.get(queue[i]) + 1); queue.push(n) }
      }
    }
    return dist
  }

  // Ghi một gợi ý cho key `index` ở mức `level` (tỉnh không có mức 2 → dùng mức 1). Trả về { level, text } hoặc null
  function giveHint(st, index, level) {
    const key = st.keys[index]
    const list = content.hints.get(key.province) ?? []
    const h = list.find(x => x.level === level) ?? list.find(x => x.level === 1)
    if (!h) return null
    key.hint = level
    key.hintAt = now()
    st.hints.push({ key: index, level, text: h.text, at: key.hintAt })
    return { level, text: h.text }
  }

  // Gợi ý theo mốc 3 tỉnh đúng: key chưa nhặt chưa gợi ý gần nhất (BFS, bằng nhau → random);
  // hết thì key đã gợi ý mức 1 sớm nhất → mức 2
  function nextHint(st, from) {
    const open = st.keys.map((k, i) => ({ k, i })).filter(x => !x.k.found)
    const fresh = open.filter(x => x.k.hint === 0)
    if (fresh.length) {
      const dist = distances(from)
      const d = x => dist.get(x.k.province) ?? Infinity
      const best = Math.min(...fresh.map(d))
      const ties = fresh.filter(x => d(x) === best)
      return giveHint(st, ties[Math.floor(random() * ties.length)].i, 1)
    }
    const second = open.filter(x => x.k.hint === 1).sort((a, b) => a.k.hintAt - b.k.hintAt)[0]
    return second ? giveHint(st, second.i, 2) : null
  }

  // Team vừa được cắm tem ở `provinceId` (gọi trong transaction): nhặt key, gợi ý mỗi 3 tỉnh đúng, mở map khi đủ key
  function onCorrect(t, provinceId, by = null) {
    const st = json(db.prepare('SELECT tram FROM teams WHERE id = ?').get(t.id).tram)
    if (!st || st.stage !== 'map') return {}
    const out = {}
    const idx = st.keys.findIndex(k => k.province === provinceId && !k.found)
    if (idx >= 0) {
      const k = st.keys[idx]
      k.found = true
      k.foundAt = now()
      const piece = content.periods.get(st.period).puzzle.splits[st.need][k.piece]
      out.key = { piece }
      log(t.id, 'tram-key', provinceId, { n: st.keys.filter(x => x.found).length, of: st.need }, by)
    }
    st.correct += 1
    if (st.correct % RULES.tram.hintEvery === 0) {
      const h = nextHint(st, provinceId)
      if (h) {
        out.hint = h
        log(t.id, 'tram-hint', null, { level: h.level }, by)
      }
    }
    if (st.keys.every(k => k.found)) {
      const seen = new Set(q.visits.all(t.id).map(r => r.province_id))
      let free = 0
      for (const p of provinces.values()) if (!seen.has(p.id)) free += p.points
      st.stage = 'special'
      if (st.star === 'armed') st.star = 'ready' // sao chỉ dùng ở trạm tỉnh: bật mà chưa dùng thì giữ lại (hết chỗ dùng)
      st.openedAt = now()
      st.free = free
      if (free) db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(free, t.id)
      out.opened = { free }
      log(t.id, 'tram-open', null, { free }, by)
    }
    save(t.id, st)
    return out
  }

  // Luật cứu: tới nửa thời lượng, mỗi team chưa cứu nhận gợi ý mức 1 cho mọi key chưa nhặt chưa có gợi ý.
  // Gọi từ state() — ends_at đã dời khi tiếp tục nên mốc tự đúng sau tạm dừng. Rẻ khi chưa tới mốc / mọi team đã cứu
  function tick() {
    const room = q.room.get(roomId)
    if (room.status !== 'running' || !room.ends_at || now() < room.ends_at - room.duration_min * 30_000) return
    for (const row of db.prepare('SELECT id, tram FROM teams WHERE room_id = ? AND tram IS NOT NULL').all(roomId)) {
      const st = json(row.tram)
      if (st.rescued) continue
      st.keys.forEach((k, i) => { if (!k.found && k.hint === 0) giveHint(st, i, 1) })
      st.rescued = true
      save(row.id, st)
      log(row.id, 'tram-rescue')
    }
  }

  // Ngôi sao hy vọng: bật / tắt trước khi nhận câu (mỗi trận một lần), chỉ ở trạm tỉnh (stage 'map').
  // Sao chỉ 'used' khi câu tỉnh được phát (consumeStar)
  function armStar(teamId, on, by = null) {
    requireRunning()
    const t = requireTeam(teamId)
    const st = isTram() ? state(t) : null
    if (!st) throw new GameError('not-tram', 'Chỉ có trong phòng Chạy trạm', 409)
    if (st.star === 'used') throw new GameError('star-used', 'Ngôi sao đã dùng rồi', 409)
    if (st.stage !== 'map') throw new GameError('star-map', 'Ngôi sao hy vọng chỉ dùng ở trạm tỉnh', 409)
    st.star = on ? 'armed' : 'ready'
    save(teamId, st)
    log(teamId, 'tram-star', null, { on: !!on }, by)
    return { star: st.star }
  }

  // Câu vừa phát: sao đang bật thì chuyển 'used' và trả true (câu này mang sao)
  function consumeStar(teamId) {
    const st = json(db.prepare('SELECT tram FROM teams WHERE id = ?').get(teamId).tram)
    if (st?.star !== 'armed') return false
    st.star = 'used'
    save(teamId, st)
    return true
  }

  // Hoán vị ngẫu nhiên của 0..n-1, luôn khác thứ tự đúng khi n > 1 (trùng thì xoay một nấc)
  function randomDisplay(n) {
    const a = Array.from({ length: n }, (_, i) => i)
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    if (n > 1 && a.every((v, i) => v === i)) a.push(a.shift())
    return a
  }

  // ---------- Map đặc biệt: 3 câu thời kỳ, rồi câu ghép mảnh ----------
  const lockLeft = until => { if (until && until > now()) throw new GameError('locked', 'Team đang nghỉ chân, chờ hết thời gian', 423) }

  // Đọc trạng thái tram của team đang chơi (phòng chạy, đúng stage)
  function need(teamId, stage) {
    requireRunning()
    const t = requireTeam(teamId)
    const st = isTram() ? state(t) : null
    if (!st) throw new GameError('not-tram', 'Chỉ có trong phòng Chạy trạm', 409)
    if (st.stage === 'done' && stage === 'puzzle') throw new GameError('already-done', 'Team đã về đích rồi', 409)
    if (st.stage !== stage) throw new GameError('wrong-stage', 'Chưa tới bước này', 409)
    return { t, st }
  }

  // Câu map đang chờ gửi cho client (action trả về và teamView dùng chung): không có đáp án, lựa chọn đã xáo theo order
  function publicSpecial(st) {
    const p = st.special.pending
    const qn = content.periods.get(st.period).questions.find(x => x.id === p.id)
    return {
      id: p.id, content: qn.content, options: p.order.map(i => qn.options[i]),
      issuedAt: p.at, freeUntil: p.at + RULES.answerFreeMs.tram, deadline: p.at + RULES.answerLimitMs.tram,
      done: st.special.done, of: RULES.tram.specialCount, // test cũ / client đọc tiến độ từ câu
    }
  }

  function specialNext(teamId, by = null) {
    return transaction(db, () => {
      const { t, st } = need(teamId, 'special')
      const p = st.special.pending
      if (p) {
        // Câu chờ đã quá hạn (client không tự bỏ qua kịp): xử như hết giờ rồi báo khóa, không trả câu cũ
        if (now() > p.at + RULES.answerLimitMs.tram + RULES.answerNetworkGraceMs) {
          return failSpecial(t, st, by, { timedOut: true }) // trả trạng thái khóa (không ném lỗi: ném sẽ hoàn tác việc xử lý)
        }
        return publicSpecial(st) // đã có câu chờ: trả lại câu đó
      }
      lockLeft(st.special.lockedUntil)
      const all = content.periods.get(st.period).questions
      let pool = all.filter(x => !st.special.seen.includes(x.id))
      if (!pool.length) { st.special.seen = []; pool = all } // hết câu chưa gặp: cho lặp
      const qn = pool[Math.floor(random() * pool.length)]
      const order = Array.from({ length: qn.options.length }, (_, i) => i)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
      st.special.seen.push(qn.id)
      st.special.pending = { id: qn.id, order, at: now() + ctx.questionLeadMs }
      save(teamId, st)
      log(teamId, 'tram-special', null, { issued: qn.id }, by)
      return publicSpecial(st)
    })
  }

  // Sai / hết giờ / bỏ qua: nghỉ chân RULES.tram.lockMs. Gọi trong transaction
  function failSpecial(t, st, by, extra = {}) {
    const p = st.special.pending
    st.special.pending = null
    st.special.lockedUntil = now() + RULES.tram.lockMs
    const ms = Math.max(0, Math.min(now() - p.at, RULES.answerLimitMs.tram))
    db.prepare('UPDATE teams SET answer_ms = answer_ms + ? WHERE id = ?').run(ms, t.id)
    save(t.id, st)
    log(t.id, 'tram-special', null, { id: p.id, correct: false, ...extra }, by)
    return { correct: false, ...extra, lockedUntil: st.special.lockedUntil, stage: st.stage }
  }

  function specialAnswer(teamId, questionId, given, by = null) {
    return transaction(db, () => {
      const { t, st } = need(teamId, 'special')
      const p = st.special.pending
      if (!p || p.id !== questionId) throw new GameError('no-pending', 'Không có câu hỏi đang chờ', 409)
      const qn = content.periods.get(st.period).questions.find(x => x.id === p.id)
      if (now() > p.at + RULES.answerLimitMs.tram + RULES.answerNetworkGraceMs) return failSpecial(t, st, by, { timedOut: true })
      if (!Number.isInteger(given) || given < 0 || given >= p.order.length) throw new GameError('bad-answer', 'Đáp án không hợp lệ')
      if (p.order[given] !== qn.answer) return failSpecial(t, st, by)
      const elapsed = Math.max(0, now() - p.at)
      const points = RULES.tram.specialPoints - timePenaltyOf(RULES.tram.specialPoints, 'tram', elapsed)
      db.prepare('UPDATE teams SET bonus_points = bonus_points + ?, answer_ms = answer_ms + ? WHERE id = ?')
        .run(points, Math.min(elapsed, RULES.answerLimitMs.tram), teamId)
      st.special.pending = null
      st.special.done += 1
      if (st.special.done >= RULES.tram.specialCount) {
        st.stage = 'puzzle'
        st.puzzle.display = randomDisplay(st.need)
      }
      save(teamId, st)
      log(teamId, 'tram-special', null, { id: p.id, correct: true, points }, by)
      // done: tiến độ thật — client gán lại (không tự +1, vì SSE có thể đã mang done mới về trước phản hồi này)
      return { correct: true, points, correctAnswer: qn.options[qn.answer], explanation: qn.explanation, stage: st.stage, done: st.special.done }
    })
  }

  function specialSkip(teamId, questionId, by = null) {
    return transaction(db, () => {
      const { t, st } = need(teamId, 'special')
      if (!st.special.pending || st.special.pending.id !== questionId) throw new GameError('no-pending', 'Không có câu hỏi đang chờ', 409)
      return failSpecial(t, st, by, { skipped: true })
    })
  }

  // order = vị trí trong danh sách mảnh hiện cho client (st.puzzle.display), theo thứ tự team xếp. Đúng khi ánh xạ ra 0..n-1
  function submitPuzzle(teamId, order, by = null) {
    return transaction(db, () => {
      const { st } = need(teamId, 'puzzle')
      lockLeft(st.puzzle.lockedUntil)
      const n = st.need
      if (!Array.isArray(order) || order.length !== n || new Set(order).size !== n || !order.every(v => Number.isInteger(v) && v >= 0 && v < n)) {
        throw new GameError('bad-order', 'Thứ tự mảnh ghép không hợp lệ')
      }
      const shown = st.puzzle.display
      if (!shown) throw new GameError('no-display', 'Thiếu thứ tự mảnh ghép', 500)
      if (!order.every((pos, i) => shown[pos] === i)) {
        st.puzzle.lockedUntil = now() + RULES.tram.lockMs
        st.puzzle.tries += 1
        save(teamId, st)
        log(teamId, 'tram-special', null, { puzzle: false, tries: st.puzzle.tries }, by)
        return { correct: false, lockedUntil: st.puzzle.lockedUntil }
      }
      const room = q.room.get(roomId)
      const finishBonus = RULES.tram.puzzlePoints + Math.floor(Math.max(0, room.ends_at - now()) / 60_000) * RULES.tram.finishPerMin
      db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(finishBonus, teamId)
      st.stage = 'done'
      st.finishedAt = now()
      st.finishBonus = finishBonus
      save(teamId, st)
      log(teamId, 'tram-finish', null, { finishBonus, tries: st.puzzle.tries }, by)
      // chỉ đếm team có ít nhất một người chơi (team trống không bao giờ về đích)
      const open = db.prepare('SELECT tram FROM teams WHERE room_id = ? AND EXISTS (SELECT 1 FROM players p WHERE p.team_id = teams.id)').all(roomId).some(r => json(r.tram)?.stage !== 'done')
      if (!open) { // cả phòng về đích: kết thúc như end()
        closeRoom()
      }
      return { correct: true, finishBonus, total: scoreOf(teamId)?.total }
    })
  }

  // Dữ liệu tram của một team gửi cho chính team đó: không có tỉnh của key, đáp án, thứ tự đúng của mảnh ghép;
  // thời kỳ chỉ lộ sau khi mở map
  function teamPublic(t, now_ = now()) {
    const st = state(t)
    if (!st) return null // chưa bắt đầu / đã chơi lại: team chưa có hành trình
    const room = q.room.get(roomId)
    const period = content.periods.get(st.period)
    const splits = period.puzzle.splits[String(st.need)]
    let puzzle = null
    if (st.stage === 'puzzle') {
      if (!st.puzzle.display) throw new GameError('no-display', 'Thiếu thứ tự mảnh ghép', 500) // luôn có từ lúc vào câu ghép
      puzzle = {
        pieces: st.puzzle.display.map((pieceIndex, i) => ({ i, text: splits[pieceIndex] })),
        lockedUntil: st.puzzle.lockedUntil && st.puzzle.lockedUntil > now_ ? st.puzzle.lockedUntil : null,
      }
    }
    const found = st.keys.filter(k => k.found).sort((a, b) => a.foundAt - b.foundAt)
    return {
      need: st.need,
      found: found.length,
      pieces: found.map(k => splits[k.piece]),
      hints: st.hints.map(h => ({ level: h.level, text: h.text, at: h.at })),
      nextHintIn: RULES.tram.hintEvery - st.correct % RULES.tram.hintEvery,
      star: st.star,
      stage: st.stage,
      rescueAt: room.ends_at ? room.ends_at - room.duration_min * 30_000 : null,
      period: st.stage === 'map' ? null : { id: period.id, name: period.name, years: period.years, scene: period.scene },
      special: {
        done: st.special.done, of: RULES.tram.specialCount,
        pending: st.special.pending ? publicSpecial(st) : null,
        lockedUntil: st.special.lockedUntil && st.special.lockedUntil > now_ ? st.special.lockedUntil : null,
      },
      puzzle,
      finishedAt: st.finishedAt, finishBonus: st.finishBonus, free: st.free,
    }
  }

  return { teamPublic, setupTeams, state, save, shift, specialNext, specialAnswer, specialSkip, submitPuzzle, onCorrect, tick, armStar, consumeStar, placeKeys: (start, n, eligible) => placeKeys(start, n, eligible, { provinces, adjacency, random }) }
}
