import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadTramContent } from '../server/game/tram-content.js'
import { tramFixture, tramFixtureWith } from './fixtures/tram-content.js'
import { setupGame, createCore, memoryDb, placeTeam, setTram, getTram, correctAnswer, wrongAnswer, seededRandom, startNow } from './helpers.js'
import { placeKeys } from '../server/game/tram.js'
import { GameError, byRank, RULES } from '../server/game/rules.js'

test('loadTramContent chỉ lấy mục reviewed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tram-'))
  writeFileSync(join(dir, 'periods.json'), JSON.stringify({ periods: [{ id: 'x', reviewed: true }, { id: 'y', reviewed: false }] }))
  writeFileSync(join(dir, 'key-hints.json'), JSON.stringify({ hints: {
    A: [{ level: 1, text: 't', reviewed: true }, { level: 2, text: 'u', reviewed: false }],
    B: [{ level: 1, text: 't', reviewed: false }],
  } }))
  const c = loadTramContent(dir)
  assert.equal(c.periods.size, 1)
  assert.ok(c.periods.has('x'))
  assert.ok(c.hints.has('A') && !c.hints.has('B'))
  assert.equal(c.hints.get('A').length, 1)
})

test('loadTramContent đọc data/ thật (file rỗng hợp lệ)', () => {
  const c = loadTramContent()
  assert.ok(c.periods instanceof Map && c.hints instanceof Map)
})

test('fixture: 2 thời kỳ, hint cho đủ 34 tỉnh, splits 3-7 nối lại đúng text', () => {
  assert.equal(tramFixture.periods.size, 2)
  assert.equal(tramFixture.hints.size, 34)
  for (const p of tramFixture.periods.values()) {
    assert.equal(p.questions.length, 6)
    for (let n = 3; n <= 7; n++) {
      assert.equal(p.puzzle.splits[n].length, n)
      assert.equal(p.puzzle.splits[n].join(' '), p.puzzle.text)
    }
  }
  assert.equal(tramFixtureWith({ hintProvinces: ['ha-noi'] }).hints.size, 1)
})

test('createGame truyền tram xuống ctx (mặc định fixture trong test helper)', () => {
  const { core } = setupGame({ start: false })
  assert.equal(core.tram, tramFixture)
})

test('tạo phòng tram: mặc định 5 key, tắt cược/chủ đề, có team như phòng team', () => {
  const db = memoryDb()
  const core = createCore(db)
  const { roomId } = core.createRoom({ name: 'T', mode: 'tram', teamCount: 3 })
  const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId)
  assert.equal(row.mode, 'tram')
  assert.equal(row.key_count, 5)
  assert.equal(row.bet_choice, 0)
  assert.equal(row.topic_choice, 0)
  assert.equal(row.quiz_count, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teams WHERE room_id = ?').get(roomId).n, 3)
})

test('tạo phòng tram: từ chối tham số và nội dung không đủ', () => {
  const core = createCore()
  const bad = (opts, code) => assert.throws(() => core.createRoom({ name: 'T', mode: 'tram', teamCount: 3, ...opts }),
    e => e instanceof GameError && e.code === code)
  bad({ keyCount: 2 }, 'bad-room')
  bad({ keyCount: 8 }, 'bad-room')
  bad({ durationMin: 20 }, 'bad-room')
  const ids = [...tramFixture.hints.keys()]
  const few = createCore(undefined, undefined, { tramContent: tramFixtureWith({ hintProvinces: ids.slice(0, 7) }) })
  assert.throws(() => few.createRoom({ name: 'T', mode: 'tram', teamCount: 3, keyCount: 5 }),
    e => e instanceof GameError && e.code === 'tram-content')
  const none = createCore(undefined, undefined, { tramContent: { periods: new Map(), hints: tramFixture.hints } })
  assert.throws(() => none.createRoom({ name: 'T', mode: 'tram', teamCount: 3 }),
    e => e instanceof GameError && e.code === 'tram-content')
})

// Dựng phòng tram: team đứng ở `from` đã có tem (không qua ownership)
function tramAt(from, teamCount = 2, opts = {}) {
  const g = setupGame({ mode: 'tram', teamCount, ...opts })
  g.db.exec('DELETE FROM stamps')
  for (const t of g.teams) {
    placeTeam(g.db, t.id, from)
    g.db.prepare('INSERT INTO stamps (room_id, team_id, province_id, first, question_id, at) VALUES (?, ?, ?, 0, NULL, 0)').run(g.room.roomId, t.id, from)
  }
  g.pts = id => g.db.prepare('SELECT points FROM provinces WHERE id = ?').get(id).points
  g.bonus = id => g.db.prepare('SELECT bonus_points b FROM teams WHERE id = ?').get(id).b
  return g
}
const scoreOf = (g, id) => g.game.scores().find(s => s.teamId === id)

test('tram: đi tới tỉnh, trả lời đúng -> có tem + điểm tỉnh; quay lại tỉnh đã có tem thì đi qua', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  const { question } = g.game.move(t, 'quang-tri')
  g.game.answer(t, question.id, correctAnswer(g.db, t))
  assert.equal(scoreOf(g, t).base, g.pts('hue') + g.pts('quang-tri'))
  g.now.advance(60_000)
  assert.equal(g.game.move(t, 'hue').status, 'own')
  assert.equal(g.db.prepare('SELECT COUNT(*) n FROM ownership WHERE room_id = ?').get(g.room.roomId).n, 0)
})

test('tram: thành phố không rơi thẻ, không chuỗi thẻ, không siêu tốc, sai chỉ khóa 20 giây', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  const { question } = g.game.move(t, 'da-nang')
  g.now.advance(1000)
  const r = g.game.answer(t, question.id, correctAnswer(g.db, t))
  assert.equal(r.card, null)
  assert.equal(r.speedBonus, 0)
  assert.equal(g.db.prepare('SELECT COUNT(*) n FROM cards WHERE team_id = ?').get(t).n, 0)
  assert.equal(r.home ?? null, null)
  // 3 câu đúng liên tiếp: không thẻ, không +50
  const g2 = tramAt('hue')
  const u = g2.teams[0].id
  let streak
  for (const to of ['quang-tri', 'ha-tinh', 'nghe-an']) {
    const { question: qq } = g2.game.move(u, to)
    streak = g2.game.answer(u, qq.id, correctAnswer(g2.db, u)).streak
    g2.now.advance(60_000)
  }
  assert.equal(streak.n, 3)
  assert.equal(streak.card, null)
  assert.equal(streak.bonus, 0)
  assert.equal(g2.db.prepare('SELECT COUNT(*) n FROM cards WHERE team_id = ?').get(u).n, 0)
  // sai: khóa đúng RULES.tram.lockMs, không khóa thêm vì cược
  const g3 = tramAt('hue')
  const w = g3.teams[0].id
  const { question: wq } = g3.game.move(w, 'quang-tri')
  const before = g3.bonus(w)
  const res = g3.game.answer(w, wq.id, wrongAnswer(g3.db, w))
  assert.equal(res.lockedUntil - g3.now(), RULES.tram.lockMs)
  assert.equal(g3.bonus(w), before)
})

test('tram: hai team cùng có tem một tỉnh (không tranh tỉnh)', () => {
  const g = tramAt('hue')
  for (const { id } of g.teams) {
    const { question } = g.game.move(id, 'quang-tri')
    assert.equal(question !== undefined, true)
    assert.equal(g.game.answer(id, question.id, correctAnswer(g.db, id)).captured, true)
  }
  assert.equal(scoreOf(g, g.teams[0].id).base, scoreOf(g, g.teams[1].id).base)
})

// ---------- Bắt đầu trận: thời kỳ, rải key, mảnh ghép ----------
test('placeKeys: 200 seed — đủ n, không trùng, không phải start/kề start, không hai key kề; đường đi qua mọi key ≤ 2n bước', () => {
  const { core } = setupGame({ start: false })
  const { provinces, adjacency } = core
  const eligible = [...tramFixture.hints.keys()]
  const ids = [...provinces.keys()]
  for (let seed = 1; seed <= 200; seed++) {
    const start = ids[seed % ids.length]
    const keys = placeKeys(start, 5, eligible, { provinces, adjacency, random: seededRandom(seed) })
    assert.equal(keys.length, 5)
    assert.equal(new Set(keys).size, 5)
    for (const k of keys) {
      assert.notEqual(k, start)
      assert.ok(!adjacency.get(start).has(k))
      assert.ok(eligible.includes(k))
    }
    for (const a of keys) for (const b of keys) assert.ok(a === b || !adjacency.get(a).has(b))
    assert.ok(shortestRoute(adjacency, start, keys) <= 10, `seed ${seed}: đường ${shortestRoute(adjacency, start, keys)} bước`)
  }
})

// Số bước ít nhất để đi từ start qua mọi tỉnh trong keys (thử mọi thứ tự; n nhỏ)
function shortestRoute(adjacency, start, keys) {
  const steps = from => {
    const d = new Map([[from, 0]]), queue = [from]
    for (let i = 0; i < queue.length; i++) for (const nb of adjacency.get(queue[i])) if (!d.has(nb)) { d.set(nb, d.get(queue[i]) + 1); queue.push(nb) }
    return d
  }
  const dist = new Map([start, ...keys].map(id => [id, steps(id)]))
  const go = (cur, left) => left.length ? Math.min(...left.map((k, i) => dist.get(cur).get(k) + go(k, left.filter((_, j) => j !== i)))) : 0
  return go(start, keys)
}

test('placeKeys: ít ứng viên vẫn đủ n (hạ ràng buộc)', () => {
  const { core } = setupGame({ start: false })
  const { provinces, adjacency } = core
  const eligible = [...provinces.keys()].slice(0, 8)
  const keys = placeKeys('ha-noi', 5, eligible, { provinces, adjacency, random: seededRandom(1) })
  assert.equal(keys.length, 5)
  assert.equal(new Set(keys).size, 5)
})

test('start() phòng tram: mỗi team có thời kỳ, 5 key, mảnh là hoán vị, tem ở tỉnh xuất phát', () => {
  const g = setupGame({ mode: 'tram', teamCount: 3, start: false })
  assert.equal(g.db.prepare('SELECT tram FROM teams WHERE room_id = ?').get(g.room.roomId).tram, null)
  g.game.start()
  for (const { id } of g.teams) {
    const row = g.db.prepare('SELECT tram, current_province FROM teams WHERE id = ?').get(id)
    const st = JSON.parse(row.tram)
    assert.equal(st.need, 5)
    assert.equal(st.keys.length, 5)
    assert.deepEqual(st.keys.map(k => k.piece).sort(), [0, 1, 2, 3, 4])
    assert.equal(st.stage, 'map')
    assert.equal(st.star, 'ready')
    assert.ok(tramFixture.periods.has(st.period))
    assert.ok(st.keys.every(k => k.hint === 0 && !k.found && !g.core.adjacency.get(row.current_province).has(k.province) && k.province !== row.current_province))
    assert.equal(g.db.prepare('SELECT COUNT(*) n FROM stamps WHERE team_id = ? AND province_id = ?').get(id, row.current_province).n, 1)
  }
})

test('reset() phòng tram xóa teams.tram và tem; start() lại rải mới', () => {
  const g = setupGame({ mode: 'tram', teamCount: 2, start: false })
  g.game.start()
  g.game.reset()
  assert.equal(g.db.prepare('SELECT COUNT(*) n FROM teams WHERE room_id = ? AND tram IS NOT NULL').get(g.room.roomId).n, 0)
  assert.equal(g.db.prepare('SELECT COUNT(*) n FROM stamps WHERE room_id = ?').get(g.room.roomId).n, 0)
  g.game.start()
  assert.equal(g.db.prepare('SELECT COUNT(*) n FROM teams WHERE room_id = ? AND tram IS NOT NULL').get(g.room.roomId).n, 2)
})

test('phòng tram: không có sự kiện MC và câu hỏi chung', () => {
  const g = setupGame({ mode: 'tram', teamCount: 2 })
  for (const f of [() => g.game.triggerEvent('rumor'), () => g.game.triggerEvent('golden'), () => g.game.startShared()]) {
    assert.throws(f, e => e instanceof GameError && e.code === 'tram-no-events' && e.status === 409)
  }
})

test('phòng tram: pause/resume chạy được (gọi shift)', () => {
  const g = setupGame({ mode: 'tram', teamCount: 2 })
  g.game.pause()
  g.now.advance(5000)
  g.game.resume()
  assert.equal(g.game.state().status, 'running')
})

// ---------- Gợi ý, nhặt key, luật cứu, mở map ----------
const mkKeys = (list) => list.map(([province, extra = {}], i) => ({ province, piece: i, hint: 0, hintAt: null, found: false, foundAt: null, ...extra }))
const FAR = ['ca-mau', 'lang-son', 'can-tho', 'dong-nai']

test('tram: 3 tỉnh đúng -> 1 gợi ý trỏ tới key gần nhất (BFS)', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  setTram(g.db, t, { keys: mkKeys([['ca-mau'], ['nghe-an'], ['lang-son'], ['can-tho'], ['dong-nai']]) })
  const answerAt = to => {
    const { question } = g.game.move(t, to)
    g.game.answer(t, question.id, correctAnswer(g.db, t))
    g.now.advance(60_000)
  }
  answerAt('quang-tri')
  g.game.move(t, 'hue'); answerAt('da-nang')
  assert.equal(getTram(g.db, t).hints.length, 0) // mới 2 tỉnh đúng
  g.game.move(t, 'hue'); g.game.move(t, 'quang-tri'); answerAt('ha-tinh')
  const st = getTram(g.db, t)
  assert.equal(st.correct, 3)
  assert.equal(st.hints.length, 1)
  assert.equal(st.hints[0].key, 1)
  assert.equal(st.hints[0].level, 1)
  assert.equal(st.keys[1].hint, 1)
})

test('tram: hết key chưa gợi ý -> mốc sau cho mức 2 của key gợi ý sớm nhất', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  setTram(g.db, t, {
    correct: 2,
    keys: mkKeys([['ca-mau', { hint: 1, hintAt: 100 }], ['lang-son', { hint: 1, hintAt: 50 }], ['can-tho', { hint: 1, hintAt: 200 }], ['dong-nai', { found: true }], ['gia-lai', { found: true }]]),
  })
  const { question } = g.game.move(t, 'quang-tri')
  const r = g.game.answer(t, question.id, correctAnswer(g.db, t))
  const st = getTram(g.db, t)
  assert.equal(st.hints.length, 1)
  assert.equal(st.hints[0].key, 1)
  assert.equal(st.hints[0].level, 2)
  assert.equal(st.keys[1].hint, 2)
  assert.equal(r.tram.hint.level, 2)
})

test('tram: đúng ở tỉnh có key -> nhặt; sai thì không, retry + đúng -> nhặt', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  setTram(g.db, t, { keys: mkKeys([['quang-tri'], ...FAR.map(p => [p])]) })
  const first = g.game.move(t, 'quang-tri')
  g.game.answer(t, first.question.id, wrongAnswer(g.db, t))
  assert.equal(getTram(g.db, t).keys[0].found, false)
  g.now.advance(31_000)
  const again = g.game.retry(t)
  const r = g.game.answer(t, again.question.id, correctAnswer(g.db, t))
  const st = getTram(g.db, t)
  assert.equal(st.keys[0].found, true)
  assert.equal(r.tram.key.piece, tramFixture.periods.get(st.period).puzzle.splits[st.need][st.keys[0].piece])
})

test('tram: nhặt key cuối -> mở map, cộng điểm các tỉnh chưa ghé (tỉnh ghé mà sai không được cộng)', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  g.db.exec('DELETE FROM visits')
  g.db.prepare('INSERT INTO visits (team_id, province_id) VALUES (?, ?)').run(t, 'hue')
  setTram(g.db, t, { keys: mkKeys([['quang-tri'], ...FAR.map(p => [p, { found: true }])]) })
  const w = g.game.move(t, 'da-nang')
  g.game.answer(t, w.question.id, wrongAnswer(g.db, t))
  g.now.advance(31_000)
  g.game.move(t, 'hue')
  const { question } = g.game.move(t, 'quang-tri')
  const before = g.bonus(t)
  const r = g.game.answer(t, question.id, correctAnswer(g.db, t))
  const visited = new Set(['hue', 'da-nang', 'quang-tri'])
  const free = g.db.prepare('SELECT id, points FROM provinces').all().filter(p => !visited.has(p.id)).reduce((s, p) => s + p.points, 0)
  const st = getTram(g.db, t)
  assert.equal(st.stage, 'special')
  assert.ok(st.openedAt)
  assert.equal(st.free, free)
  assert.equal(r.tram.opened.free, free)
  assert.equal(g.bonus(t) - before, free)
  // đã mở map: không đi, không trả lời lại ở tỉnh
  for (const fn of [() => g.game.move(t, 'hue'), () => g.game.retry(t), () => g.game.retreat(t)]) {
    assert.throws(fn, e => e instanceof GameError && e.code === 'tram-map')
  }
})

test('tram: luật cứu ở nửa thời lượng, mốc dời theo tạm dừng', () => {
  const g = tramAt('hue', 2, { durationMin: 30 })
  const t = g.teams[0].id
  setTram(g.db, t, { keys: mkKeys([['ca-mau', { found: true }], ['lang-son'], ['can-tho'], ['dong-nai', { hint: 1, hintAt: 5 }], ['gia-lai']]) })
  const min = 60_000
  g.now.advance(14 * min)
  g.game.state()
  assert.equal(getTram(g.db, t).rescued, false)
  g.game.pause()
  g.now.advance(5 * min)
  g.game.resume()
  g.now.advance(30_000)
  g.game.state()
  assert.equal(getTram(g.db, t).rescued, false) // chạy được 14,5 phút
  g.now.advance(min)
  g.game.state()
  const st = getTram(g.db, t)
  assert.equal(st.rescued, true)
  assert.deepEqual(st.keys.map(k => k.hint), [0, 1, 1, 1, 1])
  assert.equal(st.hints.length, 3)
  const all = g.teams.map(x => getTram(g.db, x.id).rescued)
  assert.deepEqual(all, [true, true])
})

// ---------- Task 6: ngôi sao hy vọng, lọc câu lộ tỉnh cũ ----------
test('tram: câu trạm tỉnh có 10 giây (5 giây đầu đủ điểm); quá giờ tính sai; phòng team vẫn 30 giây', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  const { question } = g.game.move(t, 'quang-tri')
  assert.equal(question.deadline - question.issuedAt, RULES.answerLimitMs.tram)
  assert.equal(question.freeUntil - question.issuedAt, RULES.answerFreeMs.tram)
  assert.equal(RULES.answerLimitMs.tram, 10_000)
  assert.equal(RULES.tram.lockMs, 20_000)
  g.now.advance(RULES.answerLimitMs.tram + RULES.answerNetworkGraceMs + 1)
  const r = g.game.answer(t, question.id, correctAnswer(g.db, t))
  assert.equal(r.correct, false)
  assert.equal(timePenaltyOf(100, timeKey('normal', 'tram'), 5_000), 0)
  assert.equal(timeKey('normal', 'team'), 'normal')
  assert.equal(timeKey('siege', 'tram'), 'siege')
})

const starOf = (g, t) => getTram(g.db, t).star

test('tram: bật sao, câu tỉnh đúng ở giây 5 -> tổng tăng 2 lần; sao đã dùng, bật lại báo star-used', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  assert.deepEqual(g.game.armStar(t, true), { star: 'armed' })
  const { question } = g.game.move(t, 'quang-tri')
  assert.equal(starOf(g, t), 'used') // dùng ngay lúc phát câu
  const pts = g.pts('quang-tri')
  g.now.advance(5000)
  const before = g.bonus(t)
  const r = g.game.answer(t, question.id, correctAnswer(g.db, t))
  assert.equal(r.penalty, 0)
  assert.equal(g.bonus(t) - before, pts) // phần thêm = điểm tỉnh; điểm gốc đã tính qua tem
  assert.equal(r.betBonus, pts)
  assert.throws(() => g.game.armStar(t, true), e => e instanceof GameError && e.code === 'star-used')
  assert.throws(() => g.game.armStar(t, false), e => e.code === 'star-used')
})

test('tram: sao + trả lời chậm -> thêm = điểm - phạt tốc độ (tổng tỉnh = 2 x (điểm - phạt))', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  g.game.armStar(t, true)
  const { question } = g.game.move(t, 'quang-tri')
  g.now.advance(7_000) // trong 10 giây, quá 5 giây đủ điểm
  const before = g.bonus(t)
  const r = g.game.answer(t, question.id, correctAnswer(g.db, t))
  assert.ok(r.penalty > 0)
  assert.equal(g.bonus(t) - before, -r.penalty + (g.pts('quang-tri') - r.penalty))
})

test('tram: sao + sai -> trừ điểm gốc, khóa 20 giây', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  g.game.armStar(t, true)
  const { question } = g.game.move(t, 'quang-tri')
  const before = g.bonus(t)
  const r = g.game.answer(t, question.id, wrongAnswer(g.db, t))
  assert.equal(g.bonus(t) - before, -g.pts('quang-tri'))
  assert.equal(r.lockedUntil - g.now(), RULES.tram.lockMs)
  assert.equal(starOf(g, t), 'used')
})

test('tram: sao + skip -> như sai', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  g.game.armStar(t, true)
  g.game.move(t, 'quang-tri')
  const before = g.bonus(t)
  const r = g.game.skip(t)
  assert.equal(g.bonus(t) - before, -g.pts('quang-tri'))
  assert.equal(r.lockedUntil - g.now(), RULES.tram.lockMs)
  assert.equal(starOf(g, t), 'used')
})

test('tram: tắt sao trước khi nhận câu -> câu sau tính thường, sao vẫn ready', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  g.game.armStar(t, true)
  assert.deepEqual(g.game.armStar(t, false), { star: 'ready' })
  const { question } = g.game.move(t, 'quang-tri')
  assert.equal(starOf(g, t), 'ready')
  g.now.advance(5000)
  const before = g.bonus(t)
  const r = g.game.answer(t, question.id, correctAnswer(g.db, t))
  assert.equal(g.bonus(t), before)
  assert.equal(r.betBonus, 0)
})

test('tram: phòng tram không bao giờ phát can-tho-02/03; phòng team vẫn phát được', () => {
  const g = tramAt('vinh-long')
  const t = g.teams[0].id
  placeTeam(g.db, t, 'can-tho')
  const seen = new Set()
  for (let i = 0; i < 30; i++) {
    const { question } = g.game.retry(t)
    seen.add(question.id)
    g.game.skip(t)
    g.now.advance(60_000)
  }
  assert.ok(seen.size > 0)
  assert.ok(!seen.has('can-tho-02') && !seen.has('can-tho-03'))
  const h = setupGame({ teamCount: 2 })
  const u = h.teams[0].id
  placeTeam(h.db, u, 'can-tho')
  const seenTeam = new Set()
  for (let i = 0; i < 60 && !(seenTeam.has('can-tho-02') && seenTeam.has('can-tho-03')); i++) {
    const { question } = h.game.retry(u)
    seenTeam.add(question.id)
    h.game.skip(u)
    h.now.advance(60_000)
  }
  assert.ok(seenTeam.has('can-tho-02') || seenTeam.has('can-tho-03'))
})

// ---------- Task 7: map đặc biệt, câu ghép mảnh ----------
import { puzzleDisplay } from '../server/game/tram.js'
import { timePenaltyOf, timeKey } from '../server/game/rules.js'

// Team đã mở map (stage 'special') ở phòng tram
function specialAt(opts = {}) {
  const g = tramAt('hue', 2, opts)
  for (const t of g.teams) setTram(g.db, t.id, { stage: 'special', openedAt: g.now() })
  g.qOf = (t, id) => tramFixture.periods.get(getTram(g.db, t).period).questions.find(x => x.id === id)
  g.right = (t, pub) => pub.options.indexOf(g.qOf(t, pub.id).options[g.qOf(t, pub.id).answer])
  g.wrong = (t, pub) => (g.right(t, pub) + 1) % 4
  return g
}

test('timePenaltyOf: hàm thuần, khớp luật siege 20-45 giây', () => {
  assert.equal(timePenaltyOf(500, 'siege', 20_000), 0)
  assert.equal(timePenaltyOf(500, 'siege', 32_500), 250)
  assert.equal(timePenaltyOf(500, 'siege', 99_000), 500)
  assert.equal(timePenaltyOf(500, 'siege', 35_000, 15_000), 0)
})

test('puzzleDisplay: sinh một lần khi vào câu ghép, ổn định, hoán vị, không phải thứ tự đúng', () => {
  for (let k = 0; k < 8; k++) {
    const g = specialAt()
    const t = g.teams[0].id
    assert.equal(getTram(g.db, t).puzzle.display, undefined)
    for (let i = 0; i < 3; i++) {
      const pub = g.game.specialNext(t)
      g.game.specialAnswer(t, pub.id, g.right(t, pub))
    }
    const st = getTram(g.db, t)
    const d = puzzleDisplay(st)
    assert.deepEqual([...d].sort((x, y) => x - y), [...Array(st.need).keys()])
    assert.ok(d.some((v, i) => v !== i))
    g.game.submitPuzzle(t, d.map((_, i) => (i + 1) % d.length)) // sai hay đúng không quan trọng: display không đổi
    assert.deepEqual(puzzleDisplay(getTram(g.db, t)), d)
  }
})

test('special: 3 câu đúng trong 5 giây đầu -> +1500, stage puzzle; câu ở giây 7,5 -> +250', () => {
  const g = specialAt()
  const t = g.teams[0].id
  const before = g.bonus(t)
  for (let i = 0; i < 3; i++) {
    const pub = g.game.specialNext(t)
    assert.equal(pub.of, 3)
    g.now.advance(4_000)
    const r = g.game.specialAnswer(t, pub.id, g.right(t, pub))
    assert.equal(r.correct, true)
    assert.equal(r.points, 500)
    assert.equal(r.done, i + 1) // tiến độ thật để client gán lại, không tự cộng
    assert.ok(r.correctAnswer && r.explanation)
  }
  assert.equal(g.bonus(t) - before, 1500)
  assert.equal(getTram(g.db, t).stage, 'puzzle')
  const u = g.teams[1].id
  const pub = g.game.specialNext(u)
  g.now.advance(7_500)
  assert.equal(g.game.specialAnswer(u, pub.id, g.right(u, pub)).points, 250)
})

test('special: sai -> khóa 20 giây, không lộ đáp án; specialNext khi khóa báo locked; sau khóa ra câu khác', () => {
  const g = specialAt()
  const t = g.teams[0].id
  const pub = g.game.specialNext(t)
  const r = g.game.specialAnswer(t, pub.id, g.wrong(t, pub))
  assert.equal(r.correct, false)
  assert.equal(r.correctAnswer, undefined)
  assert.equal(r.lockedUntil - g.now(), RULES.tram.lockMs)
  assert.throws(() => g.game.specialNext(t), e => e.code === 'locked')
  g.now.advance(RULES.tram.lockMs + 1)
  const next = g.game.specialNext(t)
  assert.notEqual(next.id, pub.id)
  assert.equal(g.game.specialNext(t).id, next.id) // idempotent
})

test('special: skip = sai; hết giờ = sai; ngôi sao không bật được, câu thời kỳ không mang sao', () => {
  const g = specialAt()
  const [t, u] = g.teams.map(x => x.id)
  const pubT = g.game.specialNext(t)
  assert.equal(g.game.specialSkip(t, pubT.id).lockedUntil - g.now(), RULES.tram.lockMs)
  g.game.specialNext(u)
  g.now.advance(48_000)
  const pub = getTram(g.db, u).special.pending
  assert.equal(g.game.specialAnswer(u, pub.id, 0).timedOut, true)
  // sao: chỉ ở trạm tỉnh
  const h = specialAt()
  const s = h.teams[0].id
  assert.throws(() => h.game.armStar(s, true), e => e instanceof GameError && e.code === 'star-map')
  assert.equal(getTram(h.db, s).star, 'ready')
  const p1 = h.game.specialNext(s)
  assert.equal(p1.star, undefined)
  assert.equal(h.game.specialAnswer(s, p1.id, h.right(s, p1)).points, 500)
  const p2 = h.game.specialNext(s)
  const b2 = h.bonus(s)
  const r2 = h.game.specialAnswer(s, p2.id, h.wrong(s, p2))
  assert.equal(h.bonus(s), b2) // sai: không trừ điểm
  assert.equal(r2.penalty, undefined)
})

test('tram: sao bật mà chưa dùng lúc mở map đặc biệt -> về ready', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  const st = getTram(g.db, t)
  st.star = 'armed'
  st.keys.forEach((k, i) => { k.found = i > 0; if (!i) k.province = 'quang-tri' })
  setTram(g.db, t, st)
  const { question } = g.game.move(t, 'quang-tri')
  setTram(g.db, t, { ...getTram(g.db, t), star: 'armed' }) // câu đã phát (sao đã dùng) — giả lập bật lại sau khi phát
  g.game.answer(t, question.id, correctAnswer(g.db, t))
  const after = getTram(g.db, t)
  assert.equal(after.stage, 'special')
  assert.equal(after.star, 'ready')
})

test('special: hai người trả lời cùng câu -> lần 2 no-pending, điểm cộng một lần', () => {
  const g = specialAt()
  const t = g.teams[0].id
  const pub = g.game.specialNext(t)
  const before = g.bonus(t)
  g.game.specialAnswer(t, pub.id, g.right(t, pub), 'An')
  assert.throws(() => g.game.specialAnswer(t, pub.id, g.right(t, pub), 'Binh'), e => e.code === 'no-pending')
  assert.equal(g.bonus(t) - before, 500)
})

test('special: sai stage -> wrong-stage; phòng không tram -> not-tram', () => {
  const g = tramAt('hue')
  assert.throws(() => g.game.specialNext(g.teams[0].id), e => e.code === 'wrong-stage')
  const h = setupGame({ teamCount: 2 })
  assert.throws(() => h.game.specialNext(h.teams[0].id), e => e.code === 'not-tram')
})

test('special: tạm dừng giữa câu -> câu còn đủ giờ như trước khi dừng', () => {
  const g = specialAt()
  const t = g.teams[0].id
  const pub = g.game.specialNext(t)
  g.now.advance(3_000)
  g.game.pause()
  g.now.advance(120_000)
  g.game.resume()
  g.now.advance(1_500) // tổng đã tính 4,5 giây < 5
  assert.equal(g.game.specialAnswer(t, pub.id, g.right(t, pub)).points, 500)
  // khóa dời theo
  const u = g.teams[1].id
  const p2 = g.game.specialNext(u)
  g.game.specialSkip(u, p2.id)
  g.game.pause()
  g.now.advance(60_000)
  g.game.resume()
  assert.equal(getTram(g.db, u).special.lockedUntil - g.now(), RULES.tram.lockMs)
  assert.ok(p2)
})

const addPlayer = (g, teamId) => g.db.prepare("INSERT INTO players (room_id, team_id, name, name_key, home, created_at) VALUES (?, ?, 'x', ?, 'ha-noi', 0)").run(g.room.roomId, teamId, `x${teamId}`)

function puzzleAt(opts = {}) {
  const g = specialAt(opts)
  for (const t of g.teams) {
    const cur = getTram(g.db, t.id)
    setTram(g.db, t.id, { stage: 'puzzle', puzzle: { ...cur.puzzle, display: [2, 0, 4, 1, 3] } })
  }
  for (const t of g.teams) addPlayer(g, t.id) // tự kết thúc chỉ đếm team có người chơi
  g.solve = t => {
    const st = getTram(g.db, t)
    const shown = puzzleDisplay(st)
    return [...Array(st.need).keys()].map(i => shown.indexOf(i))
  }
  return g
}

test('puzzle: sai -> khóa 20 giây; đúng ở phút 20 trận 45 phút -> +1000 + 25x30; already-done; cả phòng về đích -> ended', () => {
  const g = puzzleAt({ durationMin: 45 })
  const [t, u] = g.teams.map(x => x.id)
  const bad = g.solve(t).reverse()
  const r = g.game.submitPuzzle(t, bad)
  assert.equal(r.correct, false)
  assert.equal(r.lockedUntil - g.now(), RULES.tram.lockMs)
  assert.equal(getTram(g.db, t).puzzle.tries, 1)
  assert.throws(() => g.game.submitPuzzle(t, g.solve(t)), e => e.code === 'locked')
  assert.throws(() => g.game.submitPuzzle(u, [0, 0, 0, 0, 0]), e => e.code === 'bad-order')
  g.now.advance(20 * 60_000 - 0)
  const before = g.bonus(t)
  const ok = g.game.submitPuzzle(t, g.solve(t))
  assert.equal(ok.correct, true)
  const mins = Math.floor((g.db.prepare('SELECT ends_at e FROM rooms').get().e - g.now()) / 60_000)
  assert.equal(g.bonus(t) - before, 1000 + mins * 30)
  assert.equal(getTram(g.db, t).stage, 'done')
  assert.throws(() => g.game.submitPuzzle(t, g.solve(t)), e => e.code === 'already-done')
  assert.notEqual(g.game.state().status, 'ended')
  g.game.submitPuzzle(u, g.solve(u))
  assert.equal(g.game.state().status, 'ended')
})

test('puzzle: phút 20 của trận 45 phút -> đúng +1000 + 25x30', () => {
  const g = puzzleAt({ durationMin: 45 })
  const t = g.teams[0].id
  g.now.advance(20 * 60_000)
  const before = g.bonus(t)
  g.game.submitPuzzle(t, g.solve(t))
  assert.equal(g.bonus(t) - before, 1000 + 25 * 30)
})

// ---------- Điểm, xếp hạng, dữ liệu cho màn hình ----------
test('teamView.tram: không lộ tỉnh key chưa nhặt, thời kỳ chưa mở, đáp án; mở map thì có period.name', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  const keyIds = ['ca-mau', 'lang-son', 'can-tho', 'dong-nai', 'gia-lai']
  setTram(g.db, t, { keys: mkKeys(keyIds.map(p => [p])) })
  const answerAt = to => {
    const { question } = g.game.move(t, to)
    g.game.answer(t, question.id, correctAnswer(g.db, t))
    g.now.advance(60_000)
  }
  answerAt('quang-tri')
  g.game.move(t, 'hue'); answerAt('da-nang')
  g.game.move(t, 'hue'); g.game.move(t, 'quang-tri'); answerAt('ha-tinh')
  const st = getTram(g.db, t)
  assert.equal(st.hints.length, 1)
  const view = g.game.teamView(t)
  const text = JSON.stringify(view)
  assert.equal(view.tram.hints.length, 1)
  assert.deepEqual(Object.keys(view.tram.hints[0]).sort(), ['at', 'level', 'text'])
  assert.equal(view.tram.nextHintIn, 3)
  assert.equal(view.tram.period, null)
  assert.equal(view.tram.stage, 'map')
  assert.equal(view.tram.puzzle, null)
  for (const id of keyIds) {
    const p = g.game.provinces.get(id)
    for (const s of [id, p.name, p.fullName]) assert.ok(!text.includes(s), `lộ ${s}`)
  }
  const period = tramFixture.periods.get(st.period)
  for (const s of [period.name, period.puzzle.text, '"answer"', '"keys":[', '"province":"ca-mau"']) assert.ok(!text.includes(s), `lộ ${s}`)
  assert.ok(!text.includes(period.questions[0].content))
  assert.ok(!text.includes(period.id), 'lộ id thời kỳ')
  // mở map: có period.name, vẫn không có đáp án / chữ ghép đầy đủ
  setTram(g.db, t, { stage: 'special', openedAt: g.now() })
  const open = g.game.teamView(t)
  assert.equal(open.tram.period.name, period.name)
  assert.equal(open.tram.period.id, period.id)
  assert.ok(!JSON.stringify(open).includes('"answer"'))
  assert.ok(!JSON.stringify(open).includes(period.puzzle.text))
  // câu đang chờ: PublicSpecial không có đáp án
  const pub = g.game.specialNext(t)
  const v = g.game.teamView(t).tram.special
  assert.deepEqual(v.pending, pub)
  assert.deepEqual(Object.keys(v.pending).sort(), ['content', 'deadline', 'done', 'freeUntil', 'id', 'issuedAt', 'of', 'options'])
  assert.equal(v.pending.deadline - v.pending.issuedAt, RULES.answerLimitMs.tram)
  assert.equal(v.pending.freeUntil - v.pending.issuedAt, RULES.answerFreeMs.tram)
})

test('teamView.tram: mảnh ghép theo thứ tự hiện, i là vị trí, không lộ thứ tự đúng', () => {
  const g = puzzleAt()
  const t = g.teams[0].id
  const st = getTram(g.db, t)
  const splits = tramFixture.periods.get(st.period).puzzle.splits[st.need]
  const view = g.game.teamView(t).tram
  assert.deepEqual(view.puzzle.pieces, [2, 0, 4, 1, 3].map((pi, i) => ({ i, text: splits[pi] })))
  assert.notDeepEqual(view.puzzle.pieces.map(p => p.text), splits)
  assert.equal(view.puzzle.lockedUntil, null)
  const text = JSON.stringify(g.game.teamView(t))
  assert.ok(!text.includes('display'))
  assert.ok(!text.includes(tramFixture.periods.get(st.period).puzzle.text))
  // client ghép theo vị trí i đúng -> submitPuzzle nhận
  const order = g.solve(t)
  const byText = order.map(pos => view.puzzle.pieces[pos].text)
  assert.deepEqual(byText, splits)
  g.game.submitPuzzle(t, order)
  assert.equal(g.game.teamView(t).tram.puzzle, null)
  assert.equal(g.game.teamView(t).tram.stage, 'done')
  assert.ok(g.game.teamView(t).tram.finishedAt)
})

test('xếp hạng tram: bằng điểm -> về đích trước xếp trên; chưa về đích xếp sau', () => {
  const g = tramAt('hue', 3)
  const [a, b, c] = g.teams.map(x => x.id)
  setTram(g.db, a, { finishedAt: g.now() + 5000, stage: 'done' })
  setTram(g.db, b, { finishedAt: g.now() + 1000, stage: 'done' })
  g.db.prepare('UPDATE teams SET answer_ms = 10 WHERE id = ?').run(c) // chưa về, answerMs nhỏ hơn
  g.db.prepare('UPDATE teams SET answer_ms = 99 WHERE id IN (?, ?)').run(a, b)
  const rank = g.game.scores().sort(byRank).map(s => s.teamId)
  assert.deepEqual(rank, [b, a, c])
  const sb = g.game.screenView().scoreboard
  assert.equal(sb.length, 3)
  assert.deepEqual(sb.map(x => x.finished), [true, true, false])
  assert.ok(sb.every(x => x.need === 5 && x.keys === 0))
  // điểm cao hơn vẫn thắng về đích
  g.db.prepare('UPDATE teams SET bonus_points = 100 WHERE id = ?').run(c)
  assert.equal(g.game.scores().sort(byRank)[0].teamId, c)
  // chủ phòng thấy tiến độ, không thấy tỉnh key
  const owner = g.game.ownerView()
  assert.deepEqual(owner.teams.map(x => x.stage), ['done', 'done', 'map'])
  assert.ok(!JSON.stringify(owner).includes('"keys":[{'))
})

test('hết giờ ở map đặc biệt: điểm = tem + free + câu đúng, finishBonus 0', () => {
  const g = specialAt({ durationMin: 30 })
  const t = g.teams[0].id
  g.db.prepare('UPDATE teams SET bonus_points = 777 WHERE id = ?').run(t)
  setTram(g.db, t, { free: 777 })
  const pub = g.game.specialNext(t)
  g.now.advance(5_000)
  const r = g.game.specialAnswer(t, pub.id, g.right(t, pub))
  assert.equal(r.correct, true)
  g.now.advance(31 * 60_000)
  assert.equal(g.game.state().status, 'ended')
  const stamps = g.pts('hue')
  assert.equal(scoreOf(g, t).total, stamps + 777 + 500)
  const v = g.game.teamView(t).tram
  assert.equal(v.finishBonus, 0)
  assert.equal(v.finishedAt, null)
  assert.equal(v.special.done, 1)
  assert.equal(v.free, 777)
  assert.equal(g.game.replay().mode, 'tram')
})

test('người vào muộn: teamView có đủ gợi ý và mảnh đã nhặt', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  const st = getTram(g.db, t)
  const hints = [
    { key: 0, level: 1, text: 'Gợi ý một', at: 1 },
    { key: 1, level: 1, text: 'Gợi ý hai', at: 2 },
  ]
  const keys = st.keys.map((k, i) => (i === 2 ? { ...k, found: true, foundAt: 3 } : i === 3 ? { ...k, found: true, foundAt: 1 } : k))
  keys[3].found = false // chỉ một key đã nhặt
  setTram(g.db, t, { hints, keys, correct: 4 })
  const splits = tramFixture.periods.get(st.period).puzzle.splits[st.need]
  const late = g.core.joinRoom(g.room.code, 'Người muộn', t)
  assert.ok(late)
  const v = g.game.teamView(t).tram
  assert.equal(v.hints.length, 2)
  assert.equal(v.pieces.length, 1)
  assert.deepEqual(v.pieces, [splits[keys[2].piece]])
  assert.equal(v.found, 1)
  assert.equal(v.nextHintIn, 2)
})

test('tram: teamView / ownerView không lỗi khi chưa bắt đầu và sau reset', () => {
  const g = setupGame({ mode: 'tram', start: false })
  const t = g.teams[0].id
  const check = () => {
    assert.equal(g.game.teamView(t).tram, null)
    const o = g.game.ownerView().teams[0]
    assert.equal(o.keys, undefined)
    assert.ok(g.game.screenView())
  }
  check()
  startNow(g.game, g.now)
  assert.ok(g.game.teamView(t).tram)
  g.game.reset()
  check()
})

// ---------- Sửa theo review cuối ----------
test('tram: không có bộ sưu tập / xuyên 3 miền', () => {
  const g = tramAt('hue')
  const t = g.teams[0].id
  g.db.exec('DELETE FROM stamps')
  const ins = g.db.prepare('INSERT INTO stamps (room_id, team_id, province_id, first, question_id, at) VALUES (?, ?, ?, 0, NULL, 0)')
  for (const p of g.core.provinces.values()) ins.run(g.room.roomId, t, p.id) // đủ mọi tỉnh: mọi miền + mọi bộ sưu tập
  const s = scoreOf(g, t)
  assert.equal(s.collectionBonus, 0)
  assert.equal(s.crossRegion, 0)
  assert.deepEqual(s.collections, [])
  assert.equal(s.total, s.base + s.bonus)
})

test('tram: không bật được cược / chọn chủ đề (owner + sysadmin)', () => {
  const g = setupGame({ mode: 'tram', teamCount: 2 })
  for (const f of [() => g.game.setTopicChoice(true), () => g.game.setBetChoice(true)]) {
    assert.throws(f, e => e instanceof GameError && e.code === 'tram-no-events' && e.status === 409)
  }
  assert.equal(g.db.prepare('SELECT bet_choice, topic_choice FROM rooms WHERE id = ?').get(g.room.roomId).bet_choice, 0)
})

test('placeKeys: hết ứng viên xa start vẫn đủ n, nhưng không bao giờ là start', () => {
  const { core } = setupGame({ start: false })
  const { provinces, adjacency } = core
  const start = 'ha-noi'
  const near = [...adjacency.get(start)]
  const eligible = [start, ...near.slice(0, 4), [...provinces.keys()].find(id => id !== start && !adjacency.get(start).has(id))]
  const keys = placeKeys(start, 5, eligible, { provinces, adjacency, random: seededRandom(3) })
  assert.equal(keys.length, 5)
  assert.ok(!keys.includes(start))
})

test('start() phòng tram: không đủ tỉnh gợi ý đã duyệt -> báo lỗi rõ, không bắt đầu', () => {
  const content = tramFixtureWith({ hintProvinces: [...tramFixture.hints.keys()].slice(0, 8) })
  const g = setupGame({ mode: 'tram', teamCount: 2, start: false, tramContent: content })
  for (const k of [...content.hints.keys()].slice(2)) content.hints.delete(k) // còn 2 tỉnh
  assert.throws(() => g.game.start(), e => e instanceof GameError && e.code === 'tram-content')
  assert.equal(g.db.prepare('SELECT status FROM rooms WHERE id = ?').get(g.room.roomId).status, 'waiting')
})

test('loadTramContent: tỉnh chỉ có gợi ý mức 2 đã duyệt bị bỏ; có mức 1 thì giữ cả mức 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tram-'))
  writeFileSync(join(dir, 'periods.json'), JSON.stringify({ periods: [] }))
  writeFileSync(join(dir, 'key-hints.json'), JSON.stringify({ hints: {
    A: [{ level: 1, text: 't', reviewed: false }, { level: 2, text: 'u', reviewed: true }],
    B: [{ level: 1, text: 't', reviewed: true }, { level: 2, text: 'u', reviewed: true }],
  } }))
  const c = loadTramContent(dir)
  assert.ok(!c.hints.has('A'))
  assert.equal(c.hints.get('B').length, 2)
})

test('specialNext: câu pending quá hạn -> xử lý như hết giờ (nghỉ chân, không trừ điểm), không trả câu cũ', () => {
  const g = specialAt()
  const t = g.teams[0].id
  g.game.specialNext(t)
  const before = g.bonus(t)
  g.now.advance(RULES.answerLimitMs.siege + RULES.answerNetworkGraceMs + 1000)
  const r = g.game.specialNext(t)
  assert.equal(r.id, undefined) // không trả câu cũ
  assert.equal(r.lockedUntil - g.now(), RULES.tram.lockMs)
  assert.equal(g.bonus(t), before)
  const st = getTram(g.db, t)
  assert.equal(st.special.pending, null)
  assert.ok(st.special.lockedUntil > g.now())
})

test('specialSkip: questionId không khớp câu đang chờ -> no-pending', () => {
  const g = specialAt()
  const t = g.teams[0].id
  const pub = g.game.specialNext(t)
  assert.throws(() => g.game.specialSkip(t, 'khac'), e => e instanceof GameError && e.code === 'no-pending')
  assert.ok(getTram(g.db, t).special.pending)
  assert.equal(g.game.specialSkip(t, pub.id).skipped, true)
})

test('tram: team không có người chơi không chặn tự kết thúc khi mọi team có người đã về đích', () => {
  const g = puzzleAt()
  const [a, b] = g.teams
  g.db.prepare('DELETE FROM players WHERE team_id = ?').run(b.id)
  g.game.submitPuzzle(a.id, g.solve(a.id))
  assert.equal(g.game.state().status, 'ended')
})
