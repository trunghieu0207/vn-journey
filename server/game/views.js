// Điểm và dữ liệu cho từng màn hình của một phòng (team, màn chiếu, chủ phòng, xem lại) — lọc theo quyền.

import { RULES, REGIONS, TEAM_LOG_ACTIONS, byRank, GameError } from './rules.js'

export function createViews(ctx) {
  const {
    db, q, now, json, provinces, adjacency, collections, topicNames, roomId,
    state, activeEvent, requireTeam, shieldActive, pendingPublic, publicQuestion, choiceFor, siegeBlock, timedOut, lobby, sharedPublic, lobbyFacts,
    correctAnswerText, isSolo, isCompact, usesStamps, worthAt,
  } = ctx

  // ---------- Điểm ----------
  // Phòng đơn / Team gọn tắt Đấu: "tỉnh của mình" = tỉnh đã có tem (tính điểm tỉnh, bộ sưu tập, xuyên 3 miền như phòng team)
  function scores() {
    const owners = usesStamps() ? q.roomStamps.all(roomId) : q.owners.all(roomId)
    return q.teams.all(roomId).map(t => {
      const owned = owners.filter(o => o.team_id === t.id).map(o => o.province_id)
      const base = owned.reduce((s, id) => s + provinces.get(id).points, 0)
      const ownedSet = new Set(owned)
      const doneCollections = collections.filter(c => [...c.members].filter(m => ownedSet.has(m)).length >= c.need)
      const collectionBonus = doneCollections.reduce((s, c) => s + c.bonus, 0)
      const regions = new Set(owned.map(id => provinces.get(id).region))
      const crossRegion = regions.size === REGIONS.length ? RULES.crossRegionBonus : 0
      return {
        teamId: t.id, name: t.name, color: t.color, mascot: t.mascot,
        provinces: owned.length, base, bonus: t.bonus_points, collectionBonus, crossRegion,
        collections: doneCollections.map(c => c.id),
        total: base + t.bonus_points + collectionBonus + crossRegion,
        answerMs: t.answer_ms,
      }
    })
  }

  // ---------- Dữ liệu cho từng màn hình (lọc theo quyền) ----------
  function timing(s) {
    return {
      room: { code: s.code, name: s.name, durationMin: s.duration_min, topicChoice: !!s.topic_choice, betChoice: !!s.bet_choice, mode: s.mode, pioneer: !!s.pioneer, quizCount: s.quiz_count,
        compact: !!s.compact, duel: !!s.duel, stamps: s.mode === 'solo' || (!!s.compact && !s.duel) },
      status: s.status,
      startedAt: s.started_at, endsAt: s.ends_at, freezeAt: s.freeze_at, pausedAt: s.paused_at,
      serverNow: now(),
    }
  }

  // Đấu nhiều hiệp: hiệp đang đấu + tỉ số (đội công thành – đội giữ tỉnh); đấu 1 hiệp thì không có
  const roundInfo = d => (d.rounds > 1 ? { round: { no: d.round_no, of: d.rounds, att: d.att_wins, def: d.def_wins } } : {})

  function progressAt(t, s) {
    const p = json(t.progress)
    return p && p.province === t.current_province ? { done: p.done, of: s.quiz_count } : null
  }

  function teamView(teamId) {
    const s = state()
    const t = requireTeam(teamId)
    const owners = new Map(q.owners.all(roomId).map(o => [o.province_id, o]))
    const visited = q.visits.all(t.id).map(r => r.province_id)
    // Tỉnh đã ghé: chỉ biết "của mình" / "có chủ khác" / "trống" — không biết team nào
    const known = {}
    for (const id of visited) {
      const o = owners.get(id)
      known[id] = !o ? 'free' : o.team_id === t.id ? 'mine' : 'taken'
    }
    const solo = usesStamps() // mỗi team một bản đồ (phòng đơn / Team gọn tắt Đấu)
    const stamps = solo ? q.stamps.all(t.id) : []
    const mine = solo
      ? stamps.map(st => ({ province: st.province_id, shieldUntil: null }))
      : [...owners.values()].filter(o => o.team_id === t.id)
        .map(o => ({ province: o.province_id, shieldUntil: shieldActive(o) ? o.shield_until : null }))
    if (solo) for (const id of visited) known[id] = 'free' // tỉnh không thuộc riêng ai — chỉ "có tem của mình" / "chưa"
    for (const m of mine) known[m.province] = 'mine'

    const pending = t.pending_question ? pendingPublic(t) : null
    // Đội giữ tỉnh cũng đang trả lời câu này (đấu tay đôi). foeMissed: họ đã trả lời sai — chỉ báo vậy, không nêu đội nào
    const duel = q.duelOf.get(t.id)
    if (pending?.difficulty === 'siege') {
      pending.duel = duel ? { foeMissed: duel.defender_answer === 0, ...roundInfo(duel) } : false
    }
    // Đang cược số hiệp (vừa bấm Thử tài): chưa có câu hỏi
    const siegeBet = duel?.phase === 'bet'
      ? { duelId: duel.id, province: duel.province_id, until: duel.bet_until, mine: duel.bet_att, max: RULES.siegeBetMax }
      : null
    // Đội khác đang công thành tỉnh của mình: lúc cược thì khung cược; lúc đấu thì câu phòng thủ (thứ tự lựa chọn riêng) — không nêu đội nào
    const defense = q.defenses.all(t.id).filter(d => !timedOut('siege', d.started_at))
      .map(d => d.phase === 'bet'
        ? { duelId: d.id, phase: 'bet', province: d.province_id, until: d.bet_until, mine: d.bet_def, max: RULES.siegeBetMax }
        : { duelId: d.id, phase: 'play', ...publicQuestion(q.question.get(d.question_id), json(d.defender_order), d.started_at), province: d.province_id,
          ...roundInfo(d), attackerDone: d.result === 'attacker-fail' }) // đội công thành đã thua: trả lời đúng vẫn được +50

    const alerts = db.prepare(`SELECT province_id, created_at FROM events_log
                               WHERE room_id = ? AND action = 'steal' AND json_extract(detail, '$.fromTeam') = ?
                               ORDER BY id DESC LIMIT 5`).all(roomId, t.id)
      .map(r => ({ kind: 'lost', province: r.province_id, at: r.created_at }))

    // Đường hành trình của chính team: tỉnh xuất phát + các lần di chuyển, theo thứ tự
    const trail = db.prepare(`SELECT province_id FROM events_log
                              WHERE team_id = ? AND action IN ('spawn', 'move', 'retreat', 'pushed-back')
                              ORDER BY id`).all(t.id).map(r => r.province_id)

    // Nhật ký team: chỉ hành động của chính team + lần bị mất tỉnh (không nêu đội nào cướp)
    const marks = TEAM_LOG_ACTIONS.map(() => '?').join(', ')
    const teamLog = db.prepare(`SELECT action, province_id, player_name, detail, created_at FROM events_log
                                WHERE team_id = ? AND action IN (${marks})
                                ORDER BY id DESC LIMIT 30`).all(t.id, ...TEAM_LOG_ACTIONS)
      .map(e => {
        const d = json(e.detail)
        return {
          action: e.action, province: e.province_id, by: e.player_name, at: e.created_at,
          kind: d?.kind ?? null, penalty: d?.penalty ?? null, timeout: !!d?.timeout, misses: d?.misses ?? null,
          ...(e.action === 'streak' ? { n: d.n, card: d.card, bonus: d.bonus } : {}),
          ...(['speed', 'defend', 'finish'].includes(e.action) ? { bonus: d.bonus } : {}),
          ...(e.action === 'home' ? { bonus: d.bonus, names: d.names } : {}),
          ...(e.action === 'shared-bonus' ? { bonus: d.bonus, pct: d.pct } : {}),
          ...(e.action === 'pioneer' ? { bonus: d.bonus } : {}),
          ...(e.action === 'gift' ? { kinds: d.kinds } : {}),
          ...(e.action === 'progress' ? { done: d.done, of: d.of } : {}),
          ...(e.action === 'siege-bet' ? { rounds: d.rounds } : {}),
          ...(e.action === 'duel-round' ? { no: d.no, of: d.of, winner: d.winner, att: d.att, def: d.def } : {}),
          ...(e.action === 'topic' ? { bet: !!d?.bet } : {}),
          topic: e.action === 'topic' ? (d?.topic ? topicNames.get(d.topic) ?? d.topic : 'Ngẫu nhiên') : null,
        }
      })
    const log = [...teamLog, ...alerts.map(a => ({ action: 'lost', province: a.province, by: null, at: a.at }))]
      .sort((a, b) => b.at - a.at).slice(0, 30)

    const reachable = t.current_province ? [...adjacency.get(t.current_province)] : []
    return {
      ...timing(s),
      team: { id: t.id, name: t.name, color: t.color, mascot: t.mascot },
      // Người chơi đang giữ quyền chủ phòng (id người chơi — máy của chính người đó tự so với `me`); không phải thì null
      hostId: s.host_player_id != null && q.players.all(roomId).some(p => p.id === s.host_player_id && p.team_id === t.id) ? s.host_player_id : null,
      // Quê của thành viên: chỉ gửi cho chính team (không lên màn chiếu, không lộ cho team khác)
      members: q.players.all(roomId).filter(p => p.team_id === t.id).map(p => ({ id: p.id, name: p.name, home: p.home ?? null })),
      homes: {
        max: RULES.homeMax, bonus: RULES.homeBonus,
        done: db.prepare("SELECT province_id FROM events_log WHERE team_id = ? AND action = 'home' ORDER BY id").all(t.id).map(r => r.province_id),
      },
      score: scores().find(x => x.teamId === t.id),
      current: t.current_province,
      canRetreat: !!t.previous_province,
      // Trả lời lại ngay tại tỉnh đang đứng: tỉnh còn trống (client tự chờ hết khóa)
      canRetry: !!t.current_province && (solo ? !stamps.some(st => st.province_id === t.current_province) : !owners.has(t.current_province)),
      // Đang đứng ở tỉnh của đội khác mà tạm chưa công thành được (vừa đứng vững / đội khác đang công thành)
      siegeBlock: owners.get(t.current_province) && owners.get(t.current_province).team_id !== t.id ? siegeBlock(owners.get(t.current_province)) : {},
      neighbors: reachable,
      marchReady: !!t.march_ready,
      streak: t.streak,
      // Phòng nhiều câu/tỉnh: đã đúng bao nhiêu câu ở tỉnh đang đứng (null = chưa bắt đầu / đã rời tỉnh)
      progress: progressAt(t, s),
      lockedUntil: t.locked_until && t.locked_until > now() ? t.locked_until : null,
      mine,
      known,
      // Phòng đơn: tem (Tiên phong), số người có tem ở các tỉnh mình đã ghé (không lộ là ai), hạng của mình
      ...(isSolo() ? soloExtras(t, visited, stamps) : {}),
      // Team gọn tắt Đấu: đã về đích (đủ tem cả nước) — { at, bonus } hoặc null
      finished: solo && isCompact() ? finishedOf(t.id) : null,
      trail,
      log,
      lastResult: json(t.last_result),
      pendingQuestion: pending,
      defense,
      // Đang chọn trước câu hỏi: chủ đề (topics rỗng = không chọn chủ đề) và / hoặc đặt cược (bet)
      siegeBet,
      choosing: t.choosing_at && !t.pending_question && !siegeBet
        ? { province: t.current_province, since: t.choosing_at, topics: [], bet: false, ...choiceFor(t.id, t.current_province), worth: worthAt(t.id, t.current_province) }
        : null,
      cards: q.cards.all(t.id).map(c => ({ id: c.id, kind: c.kind })),
      event: activeEvent(s),
      shared: sharedPublic(),
      facts: s.status === 'waiting' ? lobbyFacts() : null,
      factMs: RULES.factMs,
      alerts,
    }
  }

  function finishedOf(teamId) {
    const e = db.prepare("SELECT detail, created_at FROM events_log WHERE team_id = ? AND action = 'finish' ORDER BY id DESC LIMIT 1").get(teamId)
    return e ? { at: e.created_at, bonus: json(e.detail).bonus } : null
  }

  function soloExtras(t, visited, stamps) {
    const counts = new Map(q.stampCounts.all(roomId).map(r => [r.province_id, r.n]))
    const ranked = scores().sort(byRank)
    return {
      stamps: stamps.map(st => ({ province: st.province_id, first: !!st.first, at: st.at })),
      stampCounts: Object.fromEntries(visited.map(id => [id, counts.get(id) ?? 0])),
      rank: { rank: ranked.findIndex(x => x.teamId === t.id) + 1, of: ranked.length },
    }
  }

  // Bản tin ẩn danh cho màn chiếu. Phòng đơn: không đưa tin nhận tem (đông người → tràn), thay bằng tin Tiên phong (không nêu tên)
  function news(limit = 8) {
    const actions = isSolo()
      ? ['pioneer', 'event', 'start', 'end', 'streak', 'shared', 'shared-result']
      : ['capture', 'steal', 'event', 'start', 'end', 'streak', 'defend', 'shared', 'shared-result', 'finish']
    return db.prepare(`SELECT action, province_id, detail, created_at FROM events_log
                       WHERE room_id = ? AND action IN (${actions.map(() => '?').join(', ')})
                       ORDER BY id DESC LIMIT ?`).all(roomId, ...actions, limit)
      .map(e => {
        const name = e.province_id ? provinces.get(e.province_id).name : ''
        const d = json(e.detail)
        const region = { north: 'miền Bắc', central: 'miền Trung', south: 'miền Nam' }[d?.region]
        const text = e.action === 'capture' ? `Một đội vừa cắm cờ ở ${name}!`
          : e.action === 'steal' ? `${name} vừa đổi chủ!`
          : e.action === 'defend' ? `Chủ nhà ${name} vừa tiếp khách thành công!`
          : e.action === 'shared' ? `Câu hỏi chung cả phòng về ${name}!`
          : e.action === 'shared-result' ? `Câu hỏi chung: cả phòng đúng ${d.pct}%${d.passed ? ` — mọi team +${RULES.sharedBonus}!` : ''}`
          : e.action === 'finish' ? `Một đội vừa đi đủ ${provinces.size} tỉnh — về đích!`
          : e.action === 'start' ? 'Trận đấu bắt đầu!'
          : e.action === 'end' ? (d?.finished ? 'Mọi đội đã về đích!' : 'Hết giờ!')
          : d?.kind === 'festival' ? `Lễ hội ${region}! Cắm cờ ở ${region} được +${RULES.festivalBonus}`
          : d?.kind === 'storm' ? `Bão ${region}! Không thể đi vào ${region}`
          : d?.kind === 'golden' ? `Câu hỏi vàng! ${RULES.goldenMs / 60_000} phút: đúng được ×2 điểm tỉnh, sai nghỉ chân ×2`
          : e.action === 'streak' ? `${isSolo() ? 'Một lữ khách' : 'Một đội'} vừa đúng ${d.n} câu liền!`
          : e.action === 'pioneer' ? `Một lữ khách vừa là người đầu tiên tới ${name}!`
          : d?.kind === 'rumor' ? `Tin đồn: ${d.text}` : 'Có sự kiện mới!'
        // Tin chuỗi đúng không kèm tỉnh (màn chiếu không được lộ vị trí của đội)
        // sub: loại sự kiện (lễ hội / bão / câu vàng / tin đồn) — màn chiếu chọn icon cho khung "Diễn biến mới nhất"
        return { kind: e.action, sub: e.action === 'event' ? d?.kind ?? null : null, text, province: e.action === 'streak' ? null : e.province_id, at: e.created_at }
      })
  }

  function screenView() {
    const s = state()
    const frozen = s.status !== 'ended' && s.freeze_at && now() >= s.freeze_at
    const solo = isSolo()
    const all = q.teams.all(roomId)
    return {
      ...timing(s),
      frozen: !!frozen,
      // Phòng đơn: chỉ top 10 (tên tự gõ — chủ phòng sửa được); mỗi người xem hạng của mình trên máy
      scoreboard: frozen ? null : scores()
        .sort(byRank)
        .slice(0, solo ? RULES.screenTop : undefined)
        .map(({ name, color, mascot, total, answerMs, provinces: n }) => ({ name, color, mascot, total, answerMs, provinces: n })),
      players: all.length,
      // Phòng đơn: bản đồ nhiệt "cả phòng đang đi đâu" — số người có tem mỗi tỉnh (không lộ là ai)
      heat: usesStamps() && s.status !== 'waiting' ? Object.fromEntries(q.stampCounts.all(roomId).map(r => [r.province_id, r.n])) : null,
      news: news(),
      event: activeEvent(s),
      shared: sharedPublic(),
      facts: s.status === 'waiting' ? lobbyFacts() : null,
      factMs: RULES.factMs,
      // Sảnh chờ: team + số người (công khai như khi vào phòng), không có vị trí
      lobby: s.status !== 'waiting' ? null
        : solo ? all.slice(-RULES.screenTop * 2).reverse().map(({ name, color, mascot }) => ({ name, color, mascot, members: 1 })) // người mới vào trước
        : lobby(s.code).teams.map(({ name, color, mascot, members }) => ({ name, color, mascot, members })),
    }
  }

  // Toàn cảnh cho chủ phòng (MC)
  function ownerView() {
    const s = state()
    const owners = q.owners.all(roomId)
    const players = q.players.all(roomId)
    // Phòng đơn: số tem Tiên phong của từng người (danh sách lữ khách trên trang chủ phòng)
    const pioneers = new Map()
    if (isSolo()) for (const st of q.roomStamps.all(roomId)) if (st.first) pioneers.set(st.team_id, (pioneers.get(st.team_id) ?? 0) + 1)
    return {
      ...timing(s),
      screenCode: s.screen_code,
      hostId: s.host_player_id ?? null, // người chơi đang giữ quyền chủ phòng (phòng có sẵn / người tạo phòng vào chơi luôn)
      heat: usesStamps() ? Object.fromEntries(q.stampCounts.all(roomId).map(r => [r.province_id, r.n])) : null,
      topicNames: Object.fromEntries(topicNames),
      event: activeEvent(s),
      shared: sharedPublic(),
      teams: q.teams.all(roomId).map(t => ({
        id: t.id, name: t.name, color: t.color, mascot: t.mascot,
        current: t.current_province,
        lockedUntil: t.locked_until && t.locked_until > now() ? t.locked_until : null,
        pendingQuestion: t.pending_question,
        cards: q.cards.all(t.id).map(c => c.kind),
        members: players.filter(p => p.team_id === t.id).map(p => ({ id: p.id, name: p.name })),
        ...(isSolo() ? { pioneers: pioneers.get(t.id) ?? 0 } : {}),
      })),
      ownership: Object.fromEntries(owners.map(o => [o.province_id, { team: o.team_id, shieldUntil: o.shield_until }])),
      scores: scores(),
      // Về quê: chủ phòng chỉ thấy điểm, không thấy tên thành viên (quê chỉ đồng đội biết)
      log: db.prepare('SELECT * FROM events_log WHERE room_id = ? ORDER BY id DESC LIMIT 30').all(roomId)
        .map(e => e.action === 'home' ? { ...e, detail: JSON.stringify({ bonus: json(e.detail).bonus }) } : e),
    }
  }

  // Tổng kết "Hành trình văn hóa" (sau khi kết thúc): chỉ số gộp cả phòng — không tên người, không so sánh / xếp hạng miền.
  // Lúc này mới công bố đáp án các câu khó (trận đã xong)
  function culture() {
    const teamIds = 'SELECT id FROM teams WHERE room_id = ?'
    const tally = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(correct), 0) AS ok FROM answered
                              WHERE skipped = 0 AND team_id IN (${teamIds})`).get(roomId)
    const visited = db.prepare(`SELECT COUNT(DISTINCT province_id) AS n FROM visits WHERE team_id IN (${teamIds})`).get(roomId).n
    const reveal = id => {
      const question = q.question.get(id)
      return { province: question.province_id, content: question.content, answer: correctAnswerText(question), explanation: question.explanation }
    }
    // Câu khó nhất: có ít nhất một lượt sai, tỉ lệ đúng thấp nhất
    const hardest = db.prepare(`SELECT question_id, COUNT(*) AS n, SUM(correct) AS ok FROM answered
                                WHERE skipped = 0 AND team_id IN (${teamIds}) GROUP BY question_id
                                HAVING SUM(correct) < COUNT(*) ORDER BY 1.0 * SUM(correct) / COUNT(*), COUNT(*) DESC, question_id LIMIT 2`).all(roomId)
      .map(r => ({ ...reveal(r.question_id), n: r.n, ok: r.ok }))
    const shared = db.prepare("SELECT detail FROM events_log WHERE room_id = ? AND action = 'shared-result' ORDER BY id").all(roomId)
      .map(r => json(r.detail)).filter(d => d.question).map(d => ({ ...reveal(d.question), pct: d.pct, passed: d.passed }))
    const top = (kind, value) => db.prepare(`SELECT province_id AS province, COUNT(*) AS n FROM reactions
                                             WHERE room_id = ? AND kind = ? AND value = ? GROUP BY province_id ORDER BY n DESC, province_id LIMIT 3`)
      .all(roomId, kind, value).map(r => ({ ...r }))
    // Hai đội so tài với nhau nhiều nhất (lúc này mới lộ tên đội — xem lại trận cũng đã lộ)
    const names = new Map(q.teams.all(roomId).map(t => [t.id, t.name]))
    const pair = db.prepare(`SELECT MIN(attacker_id, defender_id) AS a, MAX(attacker_id, defender_id) AS b, COUNT(*) AS n FROM duels
                             WHERE room_id = ? GROUP BY 1, 2 ORDER BY n DESC LIMIT 1`).get(roomId)
    return {
      answers: tally.n, correctPct: tally.n ? Math.round(tally.ok * 100 / tally.n) : 0,
      visited, provinces: provinces.size,
      hardest, shared,
      reactions: db.prepare('SELECT COUNT(*) AS n FROM reactions WHERE room_id = ?').get(roomId).n,
      food: { been: top('food', 'been'), want: top('food', 'want') },
      place: { been: top('place', 'been'), want: top('place', 'want') },
      rivals: pair && pair.n >= 2 ? { a: names.get(pair.a), b: names.get(pair.b), n: pair.n } : null,
    }
  }

  // Sổ tay hành trình (phòng đơn): tem của mình + điều đã học (câu đã trả lời đúng + lời giải) + danh sách Muốn thử / Muốn đến.
  // Người chơi chỉ xem được sổ của chính mình; mở được cả sau khi kết thúc (tới khi phòng tự xóa)
  function journal(teamId, playerId) {
    const t = requireTeam(teamId)
    return {
      name: t.name, color: t.color, mascot: t.mascot,
      total: provinces.size,
      score: scores().find(x => x.teamId === t.id)?.total ?? 0,
      stamps: q.stamps.all(t.id).map(st => {
        const question = st.question_id ? q.question.get(st.question_id) : null
        return { province: st.province_id, first: !!st.first, at: st.at, start: !question,
          content: question?.content ?? null, explanation: question?.explanation ?? null }
      }),
      wishes: db.prepare("SELECT province_id AS province, kind FROM reactions WHERE player_id = ? AND value = 'want' ORDER BY province_id").all(Number(playerId))
        .map(r => ({ ...r })),
    }
  }

  // Tua lại cả trận — chỉ mở sau khi kết thúc
  function replay() {
    if (state().status !== 'ended') throw new GameError('not-ended', 'Chỉ xem lại được sau khi kết thúc', 409)
    return {
      mode: isSolo() ? 'solo' : 'team',
      stamps: usesStamps(), // tỉnh không thuộc riêng ai → màn chiếu không tua bản đồ
      teams: q.teams.all(roomId).map(t => ({ id: t.id, name: t.name, color: t.color, mascot: t.mascot })),
      events: db.prepare(`SELECT team_id, action, province_id, detail, created_at FROM events_log
                          WHERE room_id = ? AND action NOT IN ('home', 'rename') ORDER BY id`).all(roomId) // quê thành viên: chỉ đồng đội biết; sửa tên: chỉ chủ phòng
        .map(e => ({ ...e, detail: json(e.detail) })),
      scores: scores().sort(byRank),
      culture: culture(),
    }
  }

  return { journal, scores, timing, teamView, news, screenView, ownerView, replay }
}
