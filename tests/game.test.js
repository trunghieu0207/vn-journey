import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupGame, startNow, placeTeam, clearOwnership, correctAnswer, wrongAnswer, memoryDb, fakeClock, createCore, siegeNow } from './helpers.js'
import { normalizeText, RULES } from '../server/game.js'

test('tạo phòng: mã chủ phòng được băm; team đặt tên theo linh vật; từ chối thông số sai', () => {
  const { core, db } = setupGame({ start: false })
  const r = core.createRoom({ name: '  Phòng   Kế toán ', teamCount: 4, durationMin: 30 })
  const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(r.roomId)
  assert.equal(row.name, 'Phòng Kế toán')
  assert.equal(row.duration_min, 30)
  assert.ok(row.owner_key_hash.startsWith('scrypt$') && !row.owner_key_hash.includes(r.ownerKey))
  assert.deepEqual(db.prepare('SELECT name FROM teams WHERE room_id = ? ORDER BY id').all(r.roomId).map(t => t.name),
    ['Team Rồng', 'Team Lân', 'Team Rùa', 'Team Phượng'])
  assert.throws(() => core.createRoom({ name: 'A', teamCount: 1 }), { code: 'bad-room' })
  assert.throws(() => core.createRoom({ name: 'A', teamCount: 9 }), { code: 'bad-room' })
  assert.throws(() => core.createRoom({ name: ' ', teamCount: 2 }), { code: 'bad-room' })
  assert.throws(() => core.createRoom({ name: 'A', teamCount: 2, durationMin: 500 }), { code: 'bad-room' })
})

test('vào phòng: tên không trùng (không phân biệt dấu/hoa thường), team có giới hạn người', () => {
  const { core, room, teams } = setupGame({ start: false })
  const p = core.joinRoom(room.code.toLowerCase(), '  An  ', teams[0].id)
  assert.equal(p.name, 'An')
  assert.throws(() => core.joinRoom(room.code, 'ân', teams[1].id), { code: 'name-taken' })
  assert.equal(core.joinRoom(room.code, 'AN', teams[0].id).playerId, p.playerId) // vào lại đúng team: nhận lại chỗ cũ
  assert.throws(() => core.joinRoom('ZZZZZZ', 'Bình', teams[0].id), { code: 'no-room' })
  assert.throws(() => core.joinRoom(room.code, '', teams[0].id), { code: 'bad-name' })
  for (let i = 1; i < RULES.maxPlayersPerTeam; i++) core.joinRoom(room.code, `Người ${i}`, teams[0].id)
  assert.throws(() => core.joinRoom(room.code, 'Thừa', teams[0].id), { code: 'team-full' })
  const lobby = core.lobby(room.code)
  assert.equal(lobby.teams[0].members, RULES.maxPlayersPerTeam)
  assert.ok(!JSON.stringify(lobby).includes('current'))
})

test('vào phòng: không chọn được team của phòng khác', () => {
  const { core, room } = setupGame({ start: false })
  const other = core.createRoom({ name: 'Phòng khác', teamCount: 2 })
  const otherTeam = core.room(other.roomId).ownerView().teams[0].id
  assert.throws(() => core.joinRoom(room.code, 'An', otherTeam), { code: 'no-team' })
})

test('nhiều phòng song song: sở hữu tỉnh, trạng thái và team tách biệt', () => {
  const { core, game, db, teams, now } = setupGame()
  const other = core.createRoom({ name: 'Phòng B', teamCount: 2 })
  const b = core.room(other.roomId)
  assert.equal(b.state().status, 'waiting')
  b.start()
  now.advance(RULES.startCountdownMs)
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an')
  game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id))
  assert.equal(game.ownerView().ownership['nghe-an'].team, teams[0].id)
  assert.ok(!('nghe-an' in b.ownerView().ownership))
  // Team phòng A không thao tác được qua phòng B
  assert.throws(() => b.move(teams[0].id, 'ha-tinh'), { code: 'no-team' })
})

test('người chơi chỉ rời phòng (đổi team) được trước khi bắt đầu; chủ phòng kick được', () => {
  const { core, game, room, teams, db } = setupGame({ start: false })
  const a = core.joinRoom(room.code, 'An', teams[0].id)
  const b = core.joinRoom(room.code, 'Bình', teams[0].id)
  game.leave(a.playerId)
  core.joinRoom(room.code, 'An', teams[1].id)
  game.start()
  assert.throws(() => game.leave(b.playerId), { code: 'started' })
  game.kickPlayer(b.playerId)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players WHERE id = ?').get(b.playerId).n, 0)
})

test('đồng đội cùng thấy kết quả câu trả lời gần nhất; câu đã được trả lời thì người sau bị từ chối', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an', 'An')
  game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id), 'An')
  assert.throws(() => game.answer(teams[0].id, question.id, 0, 'Bình'), { code: 'no-pending' })
  const view = game.teamView(teams[0].id)
  assert.equal(view.lastResult.by, 'An')
  assert.equal(view.lastResult.captured, true)
  assert.ok(view.log.some(e => e.action === 'capture' && e.by === 'An'))
  assert.ok(!JSON.stringify(game.teamView(teams[1].id)).includes('"by":"An"'))
})

test('phòng quá 24 giờ bị xóa cùng toàn bộ dữ liệu', () => {
  const { core, db, now, room } = setupGame()
  now.advance(RULES.roomLifetimeMs + 1)
  assert.equal(core.cleanupRooms(), 1)
  for (const table of ['rooms', 'teams', 'ownership', 'events_log', 'visits']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table)
  }
  assert.throws(() => core.findRoom(room.code), { code: 'no-room' })
})

test('bắt đầu: mỗi team một tỉnh xuất phát khác nhau, không phải thành phố, rải đều 3 miền', () => {
  const { game, db } = setupGame()
  const rows = db.prepare('SELECT t.current_province AS id, p.region, p.is_city FROM teams t JOIN provinces p ON p.id = t.current_province').all()
  assert.equal(new Set(rows.map(r => r.id)).size, 3)
  assert.deepEqual(rows.map(r => r.region).sort(), ['central', 'north', 'south'])
  assert.ok(rows.every(r => r.is_city === 0))
  assert.equal(game.state().status, 'running')
})

test('di chuyển: chỉ được sang tỉnh giáp ranh', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  assert.throws(() => game.move(teams[0].id, 'hue'), { code: 'not-adjacent' })
  const r = game.move(teams[0].id, 'nghe-an')
  assert.equal(r.status, 'question')
})

test('câu hỏi gửi cho team không chứa đáp án, lựa chọn đã xáo trộn', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an')
  assert.ok(!('answer' in question))
  assert.ok(!('explanation' in question))
  const view = JSON.stringify(game.teamView(teams[0].id))
  const stored = db.prepare('SELECT answer, explanation FROM questions WHERE id = ?').get(question.id)
  assert.ok(!view.includes(stored.explanation))
})

test('trả lời đúng: chiếm tỉnh và cộng điểm tỉnh', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an')
  const r = game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id))
  assert.equal(r.correct, true)
  assert.equal(r.captured, true)
  assert.ok(r.explanation)
  const score = game.scores().find(s => s.teamId === teams[0].id)
  assert.equal(score.base, 100)
})

test('trả lời sai: bị khóa 30 giây, không lộ đáp án đúng', () => {
  const { game, db, teams, now } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an')
  const r = game.answer(teams[0].id, question.id, wrongAnswer(db, teams[0].id))
  assert.equal(r.correct, false)
  assert.ok(!('correctAnswer' in r) && !('explanation' in r))
  assert.throws(() => game.move(teams[0].id, 'ha-tinh'), { code: 'locked' })
  now.advance(RULES.lockWrongMs + 1)
  assert.doesNotThrow(() => game.move(teams[0].id, 'ha-tinh'))
})

test('trả lời sai ở tỉnh trống: hết khóa thì trả lời lại ngay tại tỉnh đó (câu khác)', () => {
  const { game, db, teams, now } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an')
  game.answer(teams[0].id, question.id, wrongAnswer(db, teams[0].id))
  assert.equal(game.teamView(teams[0].id).canRetry, true)
  assert.throws(() => game.retry(teams[0].id), { code: 'locked' })
  now.advance(RULES.lockWrongMs + 1)
  const r = game.retry(teams[0].id, 'An')
  assert.equal(r.status, 'question')
  assert.notEqual(r.question.id, question.id)
  assert.equal(r.question.province, 'nghe-an')
  assert.throws(() => game.retry(teams[0].id), { code: 'pending' })
  assert.equal(game.teamView(teams[0].id).log[0].action, 'retry')
  // trả lời đúng câu mới → chiếm được tỉnh, không trả lời lại được nữa
  game.answer(teams[0].id, r.question.id, correctAnswer(db, teams[0].id))
  assert.equal(game.teamView(teams[0].id).canRetry, false)
  assert.throws(() => game.retry(teams[0].id), { code: 'own-province' })
})

test('trả lời lại: tỉnh vừa bị đội khác chiếm trong lúc khóa → chuyển sang công thành', () => {
  const { game, db, teams, now } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an')
  game.answer(teams[0].id, question.id, wrongAnswer(db, teams[0].id))
  placeTeam(db, teams[1].id, 'nghe-an', { owned: true })
  now.advance(RULES.lockWrongMs + 1)
  assert.equal(game.retry(teams[0].id).status, 'owned')
})

test('không được di chuyển khi còn câu hỏi đang chờ', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  game.move(teams[0].id, 'nghe-an')
  assert.throws(() => game.move(teams[0].id, 'ha-tinh'), { code: 'pending' })
})

test('không trả lời được câu không phải của mình', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  assert.throws(() => game.answer(teams[0].id, 'ha-noi-01', 0), { code: 'no-pending' })
})

test('đáp án ngoài phạm vi bị từ chối', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an')
  if (question.kind === 'choice') assert.throws(() => game.answer(teams[0].id, question.id, 9), { code: 'bad-answer' })
})

test('công thành: đúng thì cướp tỉnh (+50), team mất tỉnh nhận cảnh báo', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  const [a, b] = teams
  placeTeam(db, a.id, 'nghe-an', { owned: true })
  placeTeam(db, b.id, 'thanh-hoa')
  const r = game.move(b.id, 'nghe-an')
  assert.equal(r.status, 'owned')
  assert.ok(!JSON.stringify(r).includes(String(a.name)))       // không lộ team nào giữ tỉnh
  const { question } = siegeNow(game, db, b.id)
  assert.equal(question.difficulty, 'siege')
  const res = game.answer(b.id, question.id, correctAnswer(db, b.id))
  assert.equal(res.captured, true)
  assert.equal(res.bonus, RULES.stealBonus)
  assert.equal(db.prepare('SELECT team_id FROM ownership WHERE province_id = ?').get('nghe-an').team_id, b.id)
  assert.equal(game.teamView(a.id).alerts[0].province, 'nghe-an')
})

test('công thành sai: khóa 45 giây và bị đẩy về tỉnh trước', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  const [a, b] = teams
  placeTeam(db, a.id, 'nghe-an', { owned: true })
  placeTeam(db, b.id, 'thanh-hoa')
  game.move(b.id, 'nghe-an')
  const { question } = siegeNow(game, db, b.id)
  const res = game.answer(b.id, question.id, wrongAnswer(db, b.id))
  assert.equal(res.correct, false)
  assert.equal(res.pushedBack, true)
  assert.equal(game.teamView(b.id).current, 'thanh-hoa')
})

test('hai team cùng trả lời đúng một tỉnh trống: team đến sau không chiếm được', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  const [a, b] = teams
  placeTeam(db, a.id, 'thanh-hoa')
  placeTeam(db, b.id, 'ha-tinh')
  const qa = game.move(a.id, 'nghe-an').question
  const qb = game.move(b.id, 'nghe-an').question
  assert.equal(game.answer(a.id, qa.id, correctAnswer(db, a.id)).captured, true)
  const rb = game.answer(b.id, qb.id, correctAnswer(db, b.id))
  assert.equal(rb.captured, false)
  assert.equal(rb.reason, 'taken')
})

test('phòng thủ: không công thành được tỉnh có khiên', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  const [a, b] = teams
  placeTeam(db, a.id, 'nghe-an', { owned: true })
  db.prepare("INSERT INTO cards (team_id, kind) VALUES (?, 'shield')").run(a.id)
  const card = game.teamView(a.id).cards[0]
  game.useCard(a.id, card.id, 'nghe-an')
  placeTeam(db, b.id, 'thanh-hoa')
  assert.equal(game.move(b.id, 'nghe-an').status, 'shielded')
  assert.throws(() => game.siege(b.id), { code: 'shielded' })
})

test('trinh sát: chỉ lộ tỉnh nào có chủ, không lộ team nào', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  const [a, b] = teams
  placeTeam(db, b.id, 'hue', { owned: true })
  db.prepare("INSERT INTO cards (team_id, kind) VALUES (?, 'scout')").run(a.id)
  const r = game.useCard(a.id, game.teamView(a.id).cards[0].id, 'central')
  assert.deepEqual(r.revealed, ['hue'])
  assert.ok(!JSON.stringify(r).includes(b.name))
})

test('hành quân gấp: lượt kế tiếp được đi xa 2 tỉnh, sau đó hết hiệu lực', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  const [a] = teams
  placeTeam(db, a.id, 'thanh-hoa')
  db.prepare("INSERT INTO cards (team_id, kind) VALUES (?, 'march')").run(a.id)
  game.useCard(a.id, game.teamView(a.id).cards[0].id, '')
  assert.equal(game.move(a.id, 'ha-tinh').status, 'question')     // Thanh Hóa → (Nghệ An) → Hà Tĩnh
  db.prepare('UPDATE teams SET pending_question = NULL WHERE id = ?').run(a.id)
  assert.throws(() => game.move(a.id, 'hue'), { code: 'not-adjacent' })
})

test('thẻ đã dùng không dùng lại được', () => {
  const { game, db, teams } = setupGame()
  const [a] = teams
  db.prepare("INSERT INTO cards (team_id, kind) VALUES (?, 'march')").run(a.id)
  const id = game.teamView(a.id).cards[0].id
  game.useCard(a.id, id, '')
  assert.throws(() => game.useCard(a.id, id, ''), { code: 'no-card' })
})

test('bão: không đi vào miền đang có bão', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'lam-dong')
  game.triggerEvent('storm', 'south')
  assert.throws(() => game.move(teams[0].id, 'dong-nai'), { code: 'storm' })
})

test('bão: team đang ở trong miền có bão vẫn đi lại trong miền', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'dong-nai')
  game.triggerEvent('storm', 'south')
  assert.ok(game.move(teams[0].id, 'ho-chi-minh'))
})

test('lễ hội: chiếm tỉnh trong miền được +100', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  game.triggerEvent('festival', 'central')
  const { question } = game.move(teams[0].id, 'nghe-an')
  assert.equal(game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id)).bonus, RULES.festivalBonus)
})

test('điểm: bộ sưu tập (+300) và xuyên 3 miền (+500)', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  const id = teams[0].id
  for (const p of ['lai-chau', 'dien-bien', 'son-la', 'hue', 'can-tho']) placeTeam(db, id, p, { owned: true })
  const s = game.scores().find(x => x.teamId === id)
  assert.ok(s.collections.includes('tay-bac'))
  assert.equal(s.crossRegion, 500)
  assert.equal(s.total, s.base + s.bonus + s.collectionBonus + 500)
})

test('đóng băng tối đa 1/3 trận (phòng ngắn); tin đồn bị khóa khi đã đóng băng', () => {
  const db = memoryDb()
  const now = fakeClock()
  const core = createCore(db, now)
  const r = core.createRoom({ name: 'Phòng ngắn', teamCount: 2, durationMin: 10 })
  const game = core.room(r.roomId)
  startNow(game, now)
  const s = game.state()
  assert.equal(s.ends_at - s.freeze_at, Math.floor(10 * 60_000 / 3))
  assert.equal(game.screenView().frozen, false)
  game.triggerEvent('rumor')
  now.advance(7 * 60_000)
  assert.equal(game.screenView().frozen, true)
  assert.throws(() => game.triggerEvent('rumor'), { code: 'frozen' })
})

test('màn chiếu: đóng băng bảng điểm 10 phút cuối, mở lại khi kết thúc', () => {
  const { game, now } = setupGame()
  assert.ok(game.screenView().scoreboard)
  now.advance(36 * 60_000)
  assert.equal(game.screenView().frozen, true)
  assert.equal(game.screenView().scoreboard, null)
  now.advance(10 * 60_000)
  assert.equal(game.state().status, 'ended')
  assert.ok(game.screenView().scoreboard)
})

test('màn chiếu: bản tin ẩn danh, không có tên team', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an')
  game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id))
  const news = JSON.stringify(game.screenView().news)
  assert.ok(news.includes('Nghệ An'))
  for (const t of teams) assert.ok(!news.includes(t.name))
})

test('màn team: không chứa vị trí hay tên team khác', () => {
  const { game, teams } = setupGame()
  const view = game.teamView(teams[0].id)
  const text = JSON.stringify(view)
  for (const t of teams.slice(1)) assert.ok(!text.includes(t.name))
  const others = teams.slice(1).map(t => game.ownerView().teams.find(x => x.id === t.id).current)
  for (const p of others) assert.ok(!(p in view.known))
})

test('tạm dừng: dời giờ kết thúc đúng bằng thời gian dừng', () => {
  const { game, now } = setupGame()
  const end0 = game.state().ends_at
  game.pause()
  now.advance(5 * 60_000)
  game.resume()
  assert.equal(game.state().ends_at, end0 + 5 * 60_000)
})

test('xem lại trận chỉ mở sau khi kết thúc', () => {
  const { game } = setupGame()
  assert.throws(() => game.replay(), { code: 'not-ended' })
  game.end()
  assert.ok(game.replay().events.length > 0)
})

test('chơi lại: xóa diễn biến, giữ team', () => {
  const { game, db } = setupGame()
  game.end()
  game.reset()
  assert.equal(game.state().status, 'waiting')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ownership').get().n, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teams').get().n, 3)
})

test('MC điều chỉnh điểm phải có lý do và được ghi log', () => {
  const { game, teams, db } = setupGame()
  assert.throws(() => game.adjustScore(teams[0].id, 100, ' '), { code: 'no-reason' })
  game.adjustScore(teams[0].id, 100, 'Trọng tài chấp nhận đáp án')
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events_log WHERE action = 'score-adjust'").get().n, 1)
})

test('MC chưa sửa điểm được khi trận chưa bắt đầu', () => {
  const { game, teams } = setupGame({ start: false })
  assert.throws(() => game.adjustScore(teams[0].id, 100, 'Thử'), { code: 'not-started' })
})

test('bật/tắt chọn chủ đề: phòng không còn thì báo lỗi', () => {
  const { game, db, room } = setupGame()
  db.prepare('DELETE FROM rooms WHERE id = ?').run(room.roomId)
  assert.throws(() => game.setTopicChoice(true), { code: 'no-room' })
})

test('Lễ hội: điểm thưởng lấy từ luật, gửi kèm sự kiện; bản tin không có emoji', () => {
  const { game, teams } = setupGame()
  game.triggerEvent('festival', 'north')
  assert.equal(game.teamView(teams[0].id).event.bonus, RULES.festivalBonus)
  const text = game.screenView().news.find(n => n.kind === 'event').text
  assert.ok(text.includes(`+${RULES.festivalBonus}`), text)
  assert.doesNotMatch(text, /\p{Extended_Pictographic}/u)
})

test('so khớp câu trả lời dạng chữ: bỏ dấu, hoa thường, ký tự đặc biệt', () => {
  assert.equal(normalizeText('  Suối Lê-nin '), normalizeText('suoi le nin'))
  assert.equal(normalizeText('Đồng Đăng'), 'dong dang')
})

test('thống kê câu hỏi: đề xuất mức độ theo % đúng', () => {
  const { game, db, teams } = setupGame()
  const ins = db.prepare('INSERT INTO answered (team_id, question_id, correct, answered_at) VALUES (?, ?, ?, 0)')
  for (const t of teams) ins.run(t.id, 'ha-noi-01', 1)
  const stat = game.questionStats().find(s => s.id === 'ha-noi-01')
  assert.equal(stat.rate, 1)
  assert.equal(stat.suggestedLevel, 1)
})

test('màn team: đường hành trình theo thứ tự, gồm cả lần bị đẩy về khi công thành sai', () => {
  const { game, db, teams } = setupGame()
  const [a, b] = teams
  const start = game.teamView(b.id).current
  assert.deepEqual(game.teamView(b.id).trail, [start])
  clearOwnership(db)
  placeTeam(db, a.id, 'nghe-an', { owned: true })
  placeTeam(db, b.id, 'thanh-hoa')
  game.move(b.id, 'nghe-an')
  const { question } = siegeNow(game, db, b.id)
  game.answer(b.id, question.id, wrongAnswer(db, b.id))
  assert.deepEqual(game.teamView(b.id).trail, [start, 'nghe-an', 'thanh-hoa'])
  assert.ok(!game.teamView(a.id).trail.includes('thanh-hoa'))
})

test('giờ trả lời: trong 15 giây đầu không trừ; sau đó trừ dần vào điểm thưởng, hết giờ trừ 100%', () => {
  const cases = [[5_000, 0], [15_000, 0], [22_500, 0.5], [30_000, 1], [31_500, 1]]
  for (const [elapsed, ratio] of cases) {
    const { game, db, teams, now } = setupGame()
    clearOwnership(db)
    placeTeam(db, teams[0].id, 'thanh-hoa')
    const { question } = game.move(teams[0].id, 'nghe-an')
    assert.equal(question.deadline - question.issuedAt, RULES.answerLimitMs.normal)
    now.advance(elapsed)
    const r = game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id))
    const points = game.provinces.get('nghe-an').points
    assert.equal(r.captured, true, `${elapsed}ms`)
    assert.equal(r.penalty, Math.round(points * ratio), `${elapsed}ms`)
    assert.equal(r.speedBonus, elapsed <= RULES.speedBonusMs ? Math.round(points * RULES.speedBonusRatio) : 0, `${elapsed}ms`)
    assert.equal(game.scores().find(s => s.teamId === teams[0].id).bonus, r.speedBonus - r.penalty)
  }
})

test('giờ trả lời: đồng hồ bắt đầu sau khi phát câu 1 giây (camera bay tới tỉnh) — cả câu thường lẫn đấu tay đôi', () => {
  const { game, db, teams, now } = setupGame({ questionLeadMs: RULES.questionLeadMs })
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const sent = now()
  const { question } = game.move(teams[0].id, 'nghe-an')
  assert.equal(question.issuedAt, sent + RULES.questionLeadMs)
  assert.equal(question.freeUntil, sent + RULES.questionLeadMs + RULES.answerFreeMs.normal)
  assert.equal(question.deadline, sent + RULES.questionLeadMs + RULES.answerLimitMs.normal)
  // Trả lời ngay sát mốc đủ điểm (tính từ lúc phát là 16 giây): không bị trừ
  now.advance(RULES.questionLeadMs + RULES.answerFreeMs.normal)
  const r = game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id))
  assert.equal(r.captured, true)
  assert.equal(r.penalty, 0)
  // Đấu tay đôi: đội giữ tỉnh cùng mốc giờ với đội công thành
  placeTeam(db, teams[1].id, 'nghe-an') // đội khác đứng ở tỉnh vừa cắm cờ
  const siege = siegeNow(game, db, teams[1].id)
  const defense = game.teamView(teams[0].id).defense[0]
  assert.equal(defense.issuedAt, siege.question.issuedAt)
  assert.equal(defense.deadline, siege.question.deadline)
})

test('nhiều câu/tỉnh: đúng chưa đủ thì chưa cắm cờ; sai giữ tiến độ; đi tỉnh khác mất tiến độ; đủ câu mới cắm cờ', () => {
  assert.throws(() => setupGame({ quizCount: 4 }), { code: 'bad-room' })
  const { game, db, teams, now } = setupGame({ quizCount: 3 })
  clearOwnership(db)
  const t = teams[0].id
  placeTeam(db, t, 'thanh-hoa')
  assert.equal(game.teamView(t).room.quizCount, 3)
  // Câu 1 đúng: chưa cắm cờ
  let { question } = game.move(t, 'nghe-an')
  let r = game.answer(t, question.id, correctAnswer(db, t))
  assert.equal(r.captured, false)
  assert.deepEqual(r.progress, { done: 1, of: 3 })
  assert.notEqual(game.teamView(t).known['nghe-an'], 'mine')
  assert.deepEqual(game.teamView(t).progress, { done: 1, of: 3 })
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ownership WHERE province_id = ?').get('nghe-an').n, 0)
  // Câu 2 sai: nghỉ chân, giữ tiến độ
  question = game.retry(t).question
  r = game.answer(t, question.id, wrongAnswer(db, t))
  assert.equal(r.correct, false)
  assert.deepEqual(game.teamView(t).progress, { done: 1, of: 3 })
  now.advance(RULES.lockWrongMs + 1)
  // Câu 2, 3 đúng (câu khác nhau): cắm cờ
  question = game.retry(t).question
  assert.deepEqual(game.answer(t, question.id, correctAnswer(db, t)).progress, { done: 2, of: 3 })
  const third = game.retry(t).question
  assert.notEqual(third.id, question.id)
  r = game.answer(t, third.id, correctAnswer(db, t))
  assert.equal(r.captured, true)
  assert.equal(game.teamView(t).progress, null)
  assert.equal(game.teamView(t).known['nghe-an'], 'mine')
  // Đi tỉnh khác giữa chừng: mất tiến độ
  const q1 = game.move(t, 'ha-tinh').question
  game.answer(t, q1.id, correctAnswer(db, t))
  assert.deepEqual(game.teamView(t).progress, { done: 1, of: 3 })
  game.move(t, 'nghe-an') // tỉnh của mình: đi qua
  assert.equal(game.teamView(t).progress, null)
  assert.ok(game.move(t, 'ha-tinh').question)
  assert.equal(game.teamView(t).progress, null)
})

test('nhiều câu/tỉnh: "Liều" chọn một lần ở câu đầu; thưởng siêu tốc / trừ chậm lấy trung bình các câu', () => {
  const points = 100 // Nghệ An
  const { game, db, teams, now } = setupGame({ quizCount: 2, betChoice: true })
  clearOwnership(db)
  const t = teams[0].id
  placeTeam(db, t, 'thanh-hoa')
  assert.equal(game.move(t, 'nghe-an').status, 'choose')
  let { question } = game.chooseTopic(t, 'random', null, true)
  assert.equal(question.bet, true)
  // Câu 1: trả lời ngay (siêu tốc); câu 2: chậm (hết khoảng đủ điểm, trừ 50%)
  let r = game.answer(t, question.id, correctAnswer(db, t))
  assert.equal(r.captured, false)
  const next = game.retry(t)
  assert.equal(next.status, 'question') // không hỏi cược lại
  assert.equal(next.question.bet, true)
  now.advance(RULES.answerFreeMs.normal + (RULES.answerLimitMs.normal - RULES.answerFreeMs.normal) / 2)
  r = game.answer(t, next.question.id, correctAnswer(db, t))
  assert.equal(r.captured, true)
  assert.equal(game.provinces.get('nghe-an').points, points)
  assert.equal(r.speedBonus, Math.round(points * RULES.speedBonusRatio / 2))
  assert.equal(r.penalty, Math.round(points * 0.5 / 2))
  assert.equal(r.betBonus, Math.round(points * RULES.betBonusRatio))
})

test('giờ trả lời: quá giờ thì tính là sai (khóa), kể cả khi trả lời đúng', () => {
  const { game, db, teams, now } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an')
  now.advance(RULES.answerLimitMs.normal + RULES.answerNetworkGraceMs + 1)
  const r = game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id))
  assert.equal(r.correct, false)
  assert.equal(r.timeout, true)
  assert.ok(!('correctAnswer' in r))
  assert.equal(game.teamView(teams[0].id).known['nghe-an'], 'free')
})

test('giờ trả lời: team không trả lời thì server tự xử sai khi hết giờ; công thành bị đẩy về', () => {
  const { core, game, db, teams, now } = setupGame()
  clearOwnership(db)
  const [a, b] = teams
  placeTeam(db, a.id, 'nghe-an', { owned: true })
  placeTeam(db, b.id, 'thanh-hoa')
  game.move(b.id, 'nghe-an')
  siegeNow(game, db, b.id)
  now.advance(RULES.answerLimitMs.siege)
  assert.equal(core.expireQuestions().length, 0)
  now.advance(RULES.answerNetworkGraceMs + 1)
  assert.equal(core.expireQuestions().length, 1)
  const view = game.teamView(b.id)
  assert.equal(view.pendingQuestion, null)
  assert.equal(view.current, 'thanh-hoa')
  assert.ok(view.lockedUntil > now())
})

test('giờ trả lời: tạm dừng không làm hết giờ câu hỏi', () => {
  const { core, game, db, teams, now } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an')
  now.advance(5_000)
  game.pause()
  now.advance(10 * 60_000)
  assert.equal(core.expireQuestions().length, 0)
  game.resume()
  assert.equal(core.expireQuestions().length, 0)
  const r = game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id))
  assert.equal(r.captured, true)
  assert.equal(r.penalty, 0)
})

test('màn chiếu: sảnh chờ có số người từng team; bản tin sự kiện ghi rõ miền', () => {
  const { core, game, room, teams, now } = setupGame({ start: false })
  core.joinRoom(room.code, 'An', teams[1].id)
  const lobby = game.screenView().lobby
  assert.deepEqual(lobby.map(t => t.members), [0, 1, 0])
  assert.ok(!JSON.stringify(lobby).includes('An'))
  startNow(game, now)
  assert.equal(game.screenView().lobby, null)
  game.triggerEvent('storm', 'central')
  assert.match(game.screenView().news[0].text, /Bão miền Trung/)
})

test('bỏ qua câu hỏi: lùi về tỉnh trước, khóa 10 giây, không gặp lại câu đó, không tính vào thống kê', () => {
  const { game, db, teams, now } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an', 'An')
  const r = game.skip(teams[0].id, 'An')
  assert.equal(r.province, 'thanh-hoa')
  assert.equal(r.lockedUntil, now() + RULES.lockSkipMs)
  const view = game.teamView(teams[0].id)
  assert.equal(view.current, 'thanh-hoa')
  assert.equal(view.pendingQuestion, null)
  assert.equal(view.lastResult.skipped, true)
  assert.ok(!('correctAnswer' in view.lastResult))
  assert.throws(() => game.move(teams[0].id, 'nghe-an'), { code: 'locked' })
  assert.throws(() => game.skip(teams[0].id), { code: 'no-pending' })
  // Không gặp lại câu đã bỏ qua (tỉnh còn câu khác)
  for (let i = 0; i < 3; i++) {
    now.advance(RULES.lockSkipMs + 1)
    const again = game.move(teams[0].id, 'nghe-an').question
    assert.notEqual(again.id, question.id)
    assert.throws(() => game.retreat(teams[0].id), { code: 'pending' }) // không né câu hỏi bằng rút lui
    game.skip(teams[0].id)
  }
  const stat = game.questionStats().find(s => s.id === question.id)
  assert.equal(stat.answers, 0)
})

test('bỏ qua: khóa = 10 giây + thời gian đã xem (tối đa = khóa khi sai); quá giờ thì tính hết giờ', () => {
  const cases = [
    ['normal', 0, 10_000], ['normal', 12_000, 22_000], ['normal', 25_000, RULES.lockWrongMs],
    ['siege', 20_000, 30_000], ['siege', 40_000, RULES.lockSiegeWrongMs],
  ]
  for (const [kind, elapsed, lock] of cases) {
    const { game, db, teams, now } = setupGame()
    clearOwnership(db)
    const [a, b] = teams
    if (kind === 'siege') {
      placeTeam(db, a.id, 'nghe-an', { owned: true })
      placeTeam(db, b.id, 'thanh-hoa')
      game.move(b.id, 'nghe-an')
      siegeNow(game, db, b.id)
    } else {
      placeTeam(db, b.id, 'thanh-hoa')
      game.move(b.id, 'nghe-an')
    }
    now.advance(elapsed)
    const r = game.skip(b.id)
    assert.equal(r.skipped, true, `${kind} ${elapsed}`)
    assert.equal(r.lockedUntil - now(), lock, `${kind} ${elapsed}`)
    assert.equal(game.teamView(b.id).current, 'thanh-hoa')
  }
  const { game, db, teams, now } = setupGame()
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  game.move(teams[0].id, 'nghe-an')
  now.advance(RULES.answerLimitMs.normal + RULES.answerNetworkGraceMs + 1)
  const late = game.skip(teams[0].id)
  assert.equal(late.timeout, true)
  assert.ok(!late.skipped)
  assert.equal(late.lockedUntil - now(), RULES.lockWrongMs)
})

test('chọn chủ đề: phòng bật thì tới tỉnh trống phải chọn chủ đề; câu hỏi đúng chủ đề, giờ tính từ lúc chọn', () => {
  const { game, db, teams, now } = setupGame()
  game.setTopicChoice(true)
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'ninh-binh')
  const r = game.move(teams[0].id, 'ha-noi', 'An')
  assert.equal(r.status, 'choose')
  assert.ok(r.topics.length >= 2 && r.topics.every(t => t.id && t.name))
  assert.ok(!JSON.stringify(r).includes('answer'))
  // Đang chọn: không đi tiếp, không rút lui, không trả lời được
  assert.throws(() => game.move(teams[0].id, 'ninh-binh'), { code: 'choosing' })
  assert.throws(() => game.retreat(teams[0].id), { code: 'pending' })
  assert.equal(game.teamView(teams[0].id).choosing.province, 'ha-noi')
  assert.throws(() => game.chooseTopic(teams[0].id, 'khong-co'), { code: 'bad-topic' })
  now.advance(20_000) // thời gian chọn không tính vào giờ trả lời
  const topic = r.topics[0].id
  const { question } = game.chooseTopic(teams[0].id, topic, 'An')
  assert.equal(db.prepare('SELECT topic FROM questions WHERE id = ?').get(question.id).topic, topic)
  assert.equal(question.issuedAt, now())
  assert.equal(game.teamView(teams[0].id).choosing, null)
  assert.throws(() => game.chooseTopic(teams[0].id, topic), { code: 'no-choosing' }) // đồng đội bấm sau
  const res = game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id))
  assert.equal(res.penalty, 0)
})

test('chọn chủ đề: bỏ qua khi đang chọn = lùi về + khóa theo thời gian; phòng tắt thì như cũ', () => {
  const { game, db, teams, now } = setupGame()
  game.setTopicChoice(true)
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'ninh-binh')
  game.move(teams[0].id, 'ha-noi')
  now.advance(5_000)
  const s = game.skip(teams[0].id)
  assert.equal(s.province, 'ninh-binh')
  assert.equal(s.lockedUntil - now(), 15_000)
  assert.equal(game.teamView(teams[0].id).choosing, null)
  game.setTopicChoice(false)
  now.advance(20_000)
  assert.equal(game.move(teams[0].id, 'ha-noi').status, 'question')
})

test('bằng điểm: tổng thời gian trả lời ít hơn xếp trên (gồm câu sai, bỏ qua; hết giờ tính đủ)', () => {
  const { game, db, teams, now } = setupGame({ teamCount: 2 })
  clearOwnership(db)
  const [a, b] = teams
  placeTeam(db, a.id, 'thanh-hoa')
  placeTeam(db, b.id, 'ha-tinh')
  // A: trả lời đúng sau 8 giây; B: bỏ qua 1 câu sau 3 giây rồi trả lời đúng sau 4 giây (cùng 1 tỉnh 100 điểm)
  let q = game.move(a.id, 'nghe-an').question
  now.advance(8_000)
  game.answer(a.id, q.id, correctAnswer(db, a.id))
  placeTeam(db, b.id, 'thanh-hoa')
  db.prepare('UPDATE teams SET previous_province = ? WHERE id = ?').run('ha-tinh', b.id)
  game.move(b.id, 'ninh-binh')
  now.advance(3_000)
  game.skip(b.id)
  now.advance(RULES.lockWrongMs)
  db.prepare("DELETE FROM ownership WHERE province_id = 'nghe-an'").run()
  placeTeam(db, b.id, 'ha-tinh')
  q = game.move(b.id, 'nghe-an').question
  now.advance(4_000)
  game.answer(b.id, q.id, correctAnswer(db, b.id))
  db.prepare('UPDATE ownership SET team_id = ? WHERE province_id = ?').run(a.id, 'nghe-an')
  db.prepare("INSERT INTO ownership (room_id, province_id, team_id, captured_at) SELECT room_id, 'hue', ?, 0 FROM teams WHERE id = ?").run(b.id, b.id)
  // Đưa điểm hai team về bằng nhau để kiểm tra phân hạng
  const s0 = game.scores()
  const diff = s0.find(s => s.teamId === a.id).total - s0.find(s => s.teamId === b.id).total
  db.prepare('UPDATE teams SET bonus_points = bonus_points + ? WHERE id = ?').run(diff, b.id)
  const sc = game.scores()
  assert.equal(sc.find(s => s.teamId === a.id).answerMs, 8_000)
  assert.equal(sc.find(s => s.teamId === b.id).answerMs, 7_000)
  assert.equal(sc[0].total, sc[1].total)
  const board = game.screenView().scoreboard
  assert.equal(board[0].name, teams[1].name) // B nhanh hơn → xếp trên
  // Hết giờ: tính đủ 30 giây
  placeTeam(db, a.id, 'ha-tinh')
  game.move(a.id, 'quang-tri')
  now.advance(RULES.answerLimitMs.normal + RULES.answerNetworkGraceMs + 5_000)
  game.answer(a.id, game.teamView(a.id).pendingQuestion.id, 0)
  assert.equal(game.scores().find(s => s.teamId === a.id).answerMs, 8_000 + RULES.answerLimitMs.normal)
})

// ---------- Chuỗi đúng, thẻ trợ giúp, Câu hỏi vàng (28/10) ----------

// Đi sang một tỉnh giáp ranh còn trống rồi trả lời (đúng / sai); trả về kết quả
function stepAnswer(game, db, teamId, right = true) {
  const t = game.teamView(teamId)
  const owned = new Set(Object.keys(game.ownerView().ownership))
  const to = t.neighbors.find(id => !owned.has(id))
  const { question } = game.move(teamId, to)
  return game.answer(teamId, question.id, right ? correctAnswer(db, teamId) : wrongAnswer(db, teamId))
}
const helpCards = (game, teamId) => game.teamView(teamId).cards.filter(c => ['fifty', 'time'].includes(c.kind))

test('chuỗi đúng: 3 câu đúng liên tiếp → 1 thẻ trợ giúp; sai thì chuỗi về 0; bản tin không lộ tỉnh', () => {
  const { game, db, teams, now } = setupGame()
  const a = teams[0].id
  clearOwnership(db)
  placeTeam(db, a, 'thanh-hoa')
  assert.equal(stepAnswer(game, db, a).streak.n, 1)
  assert.equal(stepAnswer(game, db, a).streak.card, null)
  const third = stepAnswer(game, db, a)
  assert.equal(third.streak.n, 3)
  assert.ok(['fifty', 'time'].includes(third.streak.card))
  assert.equal(helpCards(game, a).length, 1)
  assert.equal(game.teamView(a).streak, 3)
  const news = game.screenView().news.find(n => n.kind === 'streak')
  assert.match(news.text, /3 câu liền/)
  assert.equal(news.province, null)
  // Sai → về 0, lần nhận thẻ kế tiếp lại cần đủ 3 câu
  const wrong = stepAnswer(game, db, a, false)
  assert.equal(wrong.lostStreak, 3)
  assert.equal(game.teamView(a).streak, 0)
  now.advance(RULES.lockWrongMs + 1)
  assert.equal(stepAnswer(game, db, a).streak.n, 1)
})

test('chuỗi đúng: bỏ qua cũng mất chuỗi; khay đầy thì nhận điểm thưởng thay thẻ', () => {
  const { game, db, teams, now } = setupGame()
  const a = teams[0].id
  clearOwnership(db)
  placeTeam(db, a, 'thanh-hoa')
  stepAnswer(game, db, a)
  const owned = new Set(Object.keys(game.ownerView().ownership))
  game.move(a, game.teamView(a).neighbors.find(id => !owned.has(id)))
  game.skip(a)
  assert.equal(game.teamView(a).streak, 0)
  now.advance(RULES.lockWrongMs + 1)
  for (let i = 0; i < RULES.maxCards; i++) db.prepare("INSERT INTO cards (team_id, kind) VALUES (?, 'march')").run(a)
  stepAnswer(game, db, a); stepAnswer(game, db, a)
  const before = game.scores().find(s => s.teamId === a).bonus
  const r = stepAnswer(game, db, a)
  assert.equal(r.streak.card, null)
  assert.equal(r.streak.bonus, RULES.streakFullBonus)
  assert.equal(game.teamView(a).cards.length, RULES.maxCards)
  assert.equal(game.scores().find(s => s.teamId === a).bonus - before, RULES.streakFullBonus - r.penalty + r.speedBonus)
})

test('thẻ 50:50: ẩn 2 đáp án sai (không ẩn đáp án đúng), mỗi câu một lần, chỉ khi đang trả lời', () => {
  const { game, db, teams } = setupGame()
  const a = teams[0].id
  clearOwnership(db)
  placeTeam(db, a, 'thanh-hoa')
  db.prepare("INSERT INTO cards (team_id, kind) VALUES (?, 'fifty'), (?, 'fifty')").run(a, a)
  const [c1, c2] = game.teamView(a).cards
  assert.throws(() => game.useCard(a, c1.id, ''), { code: 'no-pending' })
  const { question } = game.move(a, 'nghe-an')
  assert.equal(question.kind, 'choice')
  const right = correctAnswer(db, a)
  const r = game.useCard(a, c1.id, '')
  assert.equal(r.hidden.length, 2)
  assert.ok(!r.hidden.includes(right))
  assert.ok(!('answer' in r) && !JSON.stringify(r).includes('correct'))
  assert.deepEqual(game.teamView(a).pendingQuestion.hidden, r.hidden) // đồng đội / tải lại trang cùng thấy
  assert.throws(() => game.useCard(a, c2.id, ''), { code: 'bad-target' })
  assert.equal(game.answer(a, question.id, right).captured, true)
})

test('thẻ Thêm giờ: +15 giây cho cả hạn chót lẫn khoảng đủ điểm; mỗi câu một lần', () => {
  const { game, db, teams, now } = setupGame()
  const a = teams[0].id
  clearOwnership(db)
  placeTeam(db, a, 'thanh-hoa')
  db.prepare("INSERT INTO cards (team_id, kind) VALUES (?, 'time'), (?, 'time')").run(a, a)
  const [c1, c2] = game.teamView(a).cards
  const { question } = game.move(a, 'nghe-an')
  now.advance(20_000)
  assert.equal(game.useCard(a, c1.id, '').extraMs, RULES.extraTimeMs)
  const p = game.teamView(a).pendingQuestion
  assert.equal(p.deadline, question.deadline + RULES.extraTimeMs)
  assert.equal(p.freeUntil, question.freeUntil + RULES.extraTimeMs)
  assert.throws(() => game.useCard(a, c2.id, ''), { code: 'bad-target' })
  // 40 giây: quá giờ thường nhưng còn trong giờ đã cộng; trừ điểm theo khoảng đã dời (25 giây đủ điểm / 45 giây)
  now.advance(20_000)
  const r = game.answer(a, question.id, correctAnswer(db, a))
  assert.equal(r.correct, true)
  const points = game.provinces.get('nghe-an').points
  assert.equal(r.penalty, Math.round(points * (40_000 - RULES.answerFreeMs.normal - RULES.extraTimeMs) / (RULES.answerLimitMs.normal - RULES.answerFreeMs.normal)))
})

test('Câu hỏi vàng: cả bản đồ; câu phát ra lúc đó đúng được ×2 điểm tỉnh, sai khóa ×2', () => {
  const { game, db, teams, now } = setupGame()
  const [a, b] = teams.map(t => t.id)
  clearOwnership(db)
  placeTeam(db, a, 'thanh-hoa')
  placeTeam(db, b, 'lam-dong')
  const before = game.move(b, 'dong-nai').question // phát trước sự kiện → không phải câu vàng
  const ev = game.triggerEvent('golden', 'north')
  assert.equal(ev.region, null)
  assert.equal(ev.until - now(), RULES.goldenMs)
  assert.equal(before.golden, false)
  const { question } = game.move(a, 'nghe-an')
  assert.equal(question.golden, true)
  const r = game.answer(a, question.id, correctAnswer(db, a))
  assert.equal(r.goldenBonus, game.provinces.get('nghe-an').points)
  assert.equal(game.scores().find(s => s.teamId === a).bonus, r.goldenBonus + r.speedBonus)
  // Sai câu vàng: khóa gấp đôi
  const next = game.move(a, game.teamView(a).neighbors.find(id => id !== 'thanh-hoa' && id !== 'nghe-an')).question
  assert.equal(next.golden, true)
  const w = game.answer(a, next.id, wrongAnswer(db, a))
  assert.equal(w.lockedUntil - now(), RULES.lockWrongMs * RULES.goldenLockFactor)
  // Câu phát trước sự kiện vẫn tính thường
  assert.equal(game.answer(b, before.id, correctAnswer(db, b)).goldenBonus, 0)
  assert.match(game.screenView().news.find(n => n.text.includes('Câu hỏi vàng')).text, /×2/)
})

// ---------- Đặt cược, bỏ phiếu đáp án, thưởng siêu tốc (28/10) ----------

test('đặt cược: phòng bật thì tới tỉnh trống phải chọn Chắc ăn / Liều; Liều đúng +50%, sai khóa thêm 30 giây', () => {
  const { game, db, teams, now } = setupGame()
  const a = teams[0].id
  clearOwnership(db)
  placeTeam(db, a, 'thanh-hoa')
  game.setBetChoice(true)
  const r = game.move(a, 'nghe-an')
  assert.equal(r.status, 'choose')
  assert.equal(r.bet, true)
  assert.deepEqual(r.topics, [])
  assert.equal(game.teamView(a).choosing.bet, true)
  const { question } = game.chooseTopic(a, 'random', 'An', true)
  assert.equal(question.bet, true)
  now.advance(6_000) // quá 5 giây: không có thưởng siêu tốc
  const ok = game.answer(a, question.id, correctAnswer(db, a))
  const points = game.provinces.get('nghe-an').points
  assert.equal(ok.betBonus, Math.round(points * RULES.betBonusRatio))
  assert.equal(game.scores().find(s => s.teamId === a).bonus, ok.betBonus)
  // Liều sai: khóa 30 + 30 giây
  game.move(a, 'ha-tinh')
  const q2 = game.chooseTopic(a, 'random', 'An', true).question
  const bad = game.answer(a, q2.id, wrongAnswer(db, a))
  assert.equal(bad.lockedUntil - now(), RULES.lockWrongMs + RULES.betExtraLockMs)
})

test('đặt cược: Chắc ăn như thường; phòng tắt thì không có bước chọn và không nhận cược', () => {
  const { game, db, teams, now } = setupGame()
  const a = teams[0].id
  clearOwnership(db)
  placeTeam(db, a, 'thanh-hoa')
  game.setBetChoice(true)
  game.move(a, 'nghe-an')
  const { question } = game.chooseTopic(a, 'random', 'An', false)
  now.advance(6_000)
  assert.equal(game.answer(a, question.id, correctAnswer(db, a)).betBonus, 0)
  game.setBetChoice(false)
  const r = game.move(a, 'ha-tinh')
  assert.equal(r.status, 'question')
  assert.equal(r.question.bet, false)
})

test('siêu tốc: đúng trong 5 giây đầu được +20% điểm tỉnh, chậm hơn thì không', () => {
  for (const [ms, got] of [[4_000, true], [5_000, true], [5_500, false]]) {
    const { game, db, teams, now } = setupGame()
    const a = teams[0].id
    clearOwnership(db)
    placeTeam(db, a, 'thanh-hoa')
    const { question } = game.move(a, 'nghe-an')
    now.advance(ms)
    const r = game.answer(a, question.id, correctAnswer(db, a))
    assert.equal(r.speedBonus, got ? Math.round(game.provinces.get('nghe-an').points * RULES.speedBonusRatio) : 0, `${ms}ms`)
    assert.equal(game.teamView(a).log.some(e => e.action === 'speed'), got, `${ms}ms`)
  }
})

test('bỏ phiếu: đồng đội thấy ai chọn gì; mọi người online cùng chọn thì tự chốt; ai bấm Chốt thì nộp', () => {
  const { core, game, db, teams, room } = setupGame()
  const a = teams[0].id
  const an = core.joinRoom(room.code, 'An', a).playerId
  const binh = core.joinRoom(room.code, 'Bình', a).playerId
  clearOwnership(db)
  placeTeam(db, a, 'thanh-hoa')
  const { question } = game.move(a, 'nghe-an')
  const right = correctAnswer(db, a), wrong = wrongAnswer(db, a)
  // An chọn sai, Bình chọn đúng → chưa chốt; phiếu hiện cho cả team
  assert.equal(game.vote(a, an, question.id, wrong, 'An', [an, binh]).voted, true)
  assert.equal(game.vote(a, binh, question.id, right, 'Bình', [an, binh]).voted, true)
  assert.deepEqual(game.teamView(a).pendingQuestion.votes.map(v => [v.name, v.answer]).sort(), [['An', wrong], ['Bình', right]].sort())
  // An đổi ý theo Bình → cả 2 người online cùng chọn → tự chốt
  const r = game.vote(a, an, question.id, right, 'An', [an, binh])
  assert.equal(r.correct, true)
  assert.equal(r.captured, true)
  // Câu mới: không còn phiếu cũ; chỉ 1 người online thì bấm là chốt
  const q2 = game.move(a, 'ha-tinh').question
  assert.deepEqual(q2.votes, [])
  assert.equal(game.vote(a, an, q2.id, correctAnswer(db, a), 'An', [an]).correct, true)
})

test('bỏ phiếu: không chọn được đáp án đã bị 50:50 loại; câu đã trả lời thì từ chối', () => {
  const { core, game, db, teams, room } = setupGame()
  const a = teams[0].id
  const an = core.joinRoom(room.code, 'An', a).playerId
  clearOwnership(db)
  placeTeam(db, a, 'thanh-hoa')
  db.prepare("INSERT INTO cards (team_id, kind) VALUES (?, 'fifty')").run(a)
  const { question } = game.move(a, 'nghe-an')
  const { hidden } = game.useCard(a, game.teamView(a).cards[0].id, '')
  assert.throws(() => game.vote(a, an, question.id, hidden[0], 'An', [an, 999]), { code: 'bad-answer' })
  game.answer(a, question.id, correctAnswer(db, a), 'Bình')
  assert.throws(() => game.vote(a, an, question.id, 0, 'An', [an]), { code: 'no-pending' })
})

// ---------- Đấu tay đôi khi công thành (28/10) ----------

// Đáp án theo thứ tự đã xáo riêng cho đội giữ tỉnh (đọc từ DB — client không làm được)
function defenseAnswer(db, duelId, right = true) {
  const d = db.prepare('SELECT question_id, defender_order FROM duels WHERE id = ?').get(duelId)
  const q = db.prepare('SELECT kind, answer FROM questions WHERE id = ?').get(d.question_id)
  const expected = JSON.parse(q.answer)
  if (q.kind === 'choice') return JSON.parse(d.defender_order).findIndex(i => (i === expected) === right)
  if (q.kind === 'truefalse') return right ? expected : !expected
  return right ? expected[0] : 'chắc chắn sai'
}
// B (đứng ở Thanh Hóa) công thành Nghệ An của A; trả về câu của B + lượt phòng thủ của A
function startDuel(rounds = 1) {
  const g = setupGame()
  const { game, db, teams } = g
  clearOwnership(db)
  const [a, b] = teams
  placeTeam(db, a.id, 'ha-tinh')
  placeTeam(db, a.id, 'nghe-an', { owned: true })
  db.prepare("UPDATE teams SET current_province = 'ha-tinh' WHERE id = ?").run(a.id)
  placeTeam(db, b.id, 'thanh-hoa')
  game.move(b.id, 'nghe-an')
  const { question } = siegeNow(game, db, b.id, rounds)
  return { ...g, a, b, question, defense: game.teamView(a.id).defense[0] }
}
// Như startDuel nhưng mới bấm Thử tài — đang cược số hiệp
function startBet() {
  const g = setupGame()
  const { game, db, teams } = g
  clearOwnership(db)
  const [a, b] = teams
  placeTeam(db, a.id, 'nghe-an', { owned: true })
  db.prepare("UPDATE teams SET current_province = 'ha-tinh' WHERE id = ?").run(a.id)
  placeTeam(db, b.id, 'thanh-hoa')
  game.move(b.id, 'nghe-an')
  return { ...g, a, b, bet: game.siege(b.id) }
}

test('cược thử tài: bấm Thử tài → chưa có câu, hai đội cược kín; đội công thành đứng chờ; chủ nhà chưa trả lời được', () => {
  const { game, a, b, bet } = startBet()
  assert.equal(bet.status, 'siege-bet')
  const vb = game.teamView(b.id)
  assert.equal(vb.pendingQuestion, null)
  assert.equal(vb.choosing, null) // không mở khung chọn chủ đề
  assert.deepEqual(vb.siegeBet, { duelId: bet.duelId, province: 'nghe-an', until: bet.until, mine: null, max: RULES.siegeBetMax })
  const da = game.teamView(a.id).defense
  assert.deepEqual(da, [{ duelId: bet.duelId, phase: 'bet', province: 'nghe-an', until: bet.until, mine: null, max: RULES.siegeBetMax }])
  assert.throws(() => game.move(b.id, 'thanh-hoa'), { code: 'choosing' })
  assert.throws(() => game.defend(a.id, bet.duelId, 0), { code: 'betting' })
  assert.throws(() => game.betSiege(b.id, bet.duelId, 4), { code: 'bad-bet' })
  game.betSiege(b.id, bet.duelId, 2)
  assert.throws(() => game.betSiege(b.id, bet.duelId, 3), { code: 'bet-done' })
  assert.equal(game.teamView(b.id).siegeBet.mine, 2)
  assert.equal(game.teamView(a.id).defense[0].mine, null) // cược kín: chủ nhà không thấy đoàn khách cược mấy
})

test('cược thử tài: số hiệp = cược lớn hơn; một bên không cược thì theo bên kia; không ai cược thì 1; tạm dừng dời hạn cược', () => {
  const cases = [[3, 1, 3], [1, 2, 2], [2, null, 2], [null, 3, 3], [null, null, 1]]
  for (const [att, def, want] of cases) {
    const { game, db, a, b, bet, now } = startBet()
    if (att) game.betSiege(b.id, bet.duelId, att)
    if (def) game.betSiege(a.id, bet.duelId, def)
    if (!att || !def) {
      game.pause()
      now.advance(60_000)
      game.resume()
      now.advance(RULES.siegeBetMs - 1)
      assert.equal(game.settleSiegeBets(), false, `${att}/${def}: còn hạn`)
      now.advance(1)
      assert.equal(game.settleSiegeBets(), true)
    }
    const d = db.prepare('SELECT * FROM duels WHERE id = ?').get(bet.duelId)
    assert.equal(d.phase, 'play')
    assert.equal(d.rounds, want, `${att}/${def}`)
    assert.ok(game.teamView(b.id).pendingQuestion)
    assert.equal(game.teamView(a.id).defense[0].phase, 'play')
    assert.equal(!!game.teamView(a.id).defense[0].round, want > 1)
  }
})

test('cược thử tài: bỏ qua lúc đang cược → thôi thử tài, lùi về, chủ nhà được miễn thử tài một lúc', () => {
  const { game, a, b, bet, now } = startBet()
  const r = game.skip(b.id)
  assert.equal(r.skipped, true)
  const vb = game.teamView(b.id)
  assert.equal(vb.current, 'thanh-hoa')
  assert.equal(vb.siegeBet, null)
  assert.equal(vb.lockedUntil - now(), RULES.lockSkipMs)
  assert.deepEqual(game.teamView(a.id).defense, [])
  assert.throws(() => game.betSiege(a.id, bet.duelId, 1), { code: 'bet-closed' })
})

test('đấu 3 hiệp: thắng đa số — đoàn khách thắng hiệp 1, chủ nhà thắng hiệp 2, đoàn khách thắng hiệp 3 → cướp tỉnh, +50 × 3', () => {
  const { game, db, now, a, b, question } = startDuel(3)
  assert.deepEqual(question.duel, { foeMissed: false, round: { no: 1, of: 3, att: 0, def: 0 } })
  // Hiệp 1: đoàn khách đúng
  let r = game.answer(b.id, question.id, correctAnswer(db, b.id))
  assert.equal(r.captured, false)
  assert.deepEqual(r.round, { no: 1, of: 3, winner: 'att', att: 1, def: 0, done: null })
  const q2 = game.teamView(b.id).pendingQuestion
  assert.notEqual(q2.id, question.id)
  assert.equal(q2.issuedAt - now(), RULES.duelRoundGapMs) // giữa hai hiệp: chưa tính giờ ngay
  const d2 = game.teamView(a.id).defense[0]
  assert.deepEqual(d2.round, { no: 2, of: 3, att: 1, def: 0 })
  // Đáp án gửi cho hiệp cũ bị từ chối
  assert.throws(() => game.defend(a.id, d2.duelId, 0, 'An', 1), { code: 'round-over' })
  // Hiệp 2: chủ nhà đúng trước → câu của đoàn khách bị hủy, sang hiệp 3
  r = game.defend(a.id, d2.duelId, defenseAnswer(db, d2.duelId), 'An', 2)
  assert.deepEqual(r.round, { no: 2, of: 3, winner: 'def', att: 1, def: 1, done: null })
  assert.equal(r.held, false)
  const q3 = game.teamView(b.id).pendingQuestion
  assert.ok(q3 && q3.id !== q2.id)
  assert.equal(game.teamView(b.id).lastResult.roundLost, true)
  // Hiệp 3: đoàn khách đúng → cướp tỉnh
  r = game.answer(b.id, q3.id, correctAnswer(db, b.id))
  assert.equal(r.captured, true)
  assert.equal(r.round.done, 'attacker')
  assert.equal(r.bonus, RULES.stealBonus * 3)
  assert.equal(db.prepare("SELECT team_id FROM ownership WHERE province_id = 'nghe-an'").get().team_id, b.id)
  assert.deepEqual(game.teamView(a.id).defense, [])
  assert.equal(game.scores().find(s => s.teamId === a.id).bonus, 0) // thắng hiệp lẻ không được thưởng
})

test('đấu 2 hiệp: hòa 1–1 → chủ nhà giữ tỉnh +50 × 2; đoàn khách được mời về, nghỉ chân 30 giây × 2', () => {
  const { game, db, now, a, b, question } = startDuel(2)
  game.answer(b.id, question.id, correctAnswer(db, b.id))
  const q2 = game.teamView(b.id).pendingQuestion
  const r = game.answer(b.id, q2.id, wrongAnswer(db, b.id))
  assert.equal(r.correct, false)
  assert.deepEqual({ ...r.round, done: r.round.done }, { no: 2, of: 2, winner: 'def', att: 1, def: 1, done: 'defender', defenderBonus: RULES.defendBonus * 2, lockedUntil: r.lockedUntil, pushedBack: true })
  assert.equal(db.prepare("SELECT team_id FROM ownership WHERE province_id = 'nghe-an'").get().team_id, a.id)
  assert.equal(game.scores().find(s => s.teamId === a.id).bonus, RULES.defendBonus * 2)
  const vb = game.teamView(b.id)
  assert.equal(vb.current, 'thanh-hoa')
  assert.equal(vb.lockedUntil - now(), RULES.repelLockMs * 2)
  assert.equal(vb.pendingQuestion, null)
  assert.deepEqual(game.teamView(a.id).defense, [])
})

test('đấu 2 hiệp lúc có câu hỏi vàng: đoàn khách thua → nghỉ chân 30 giây × 2 × 2', () => {
  const { game, db, now, b, question } = startDuel(2)
  db.prepare('UPDATE teams SET pending_golden = 1 WHERE id = ?').run(b.id)
  const r = game.answer(b.id, question.id, wrongAnswer(db, b.id)) // 2 hiệp: chủ nhà thắng hiệp 1 là xong
  assert.equal(r.round.done, 'defender')
  assert.equal(game.teamView(b.id).lockedUntil - now(), RULES.repelLockMs * 2 * RULES.goldenLockFactor)
})

test('đấu 2 hiệp: chủ nhà thắng hiệp 1 là xong (đoàn khách không thể thắng đa số); bỏ qua giữa trận = bỏ cuộc', () => {
  let { game, db, a, b, defense } = startDuel(2)
  let r = game.defend(a.id, defense.duelId, defenseAnswer(db, defense.duelId), 'An', 1)
  assert.equal(r.held, true)
  assert.equal(r.round.done, 'defender')
  assert.equal(r.bonus, RULES.defendBonus * 2)
  assert.equal(game.teamView(b.id).lastResult.repelled, true)
  ;({ game, db, a, b } = startDuel(3))
  r = game.skip(b.id)
  assert.equal(r.skipped, true)
  assert.equal(game.scores().find(s => s.teamId === a.id).bonus, RULES.defendBonus * 3)
  assert.deepEqual(game.teamView(a.id).defense, [])
})

test('đấu tay đôi: đội giữ tỉnh nhận cùng câu (không đáp án, không lộ đội công thành); đội công thành thấy đang đấu', () => {
  const { game, a, b, question, defense } = startDuel()
  assert.deepEqual(question.duel, { foeMissed: false })
  assert.deepEqual(game.teamView(b.id).pendingQuestion.duel, { foeMissed: false })
  assert.equal(defense.id, question.id)
  assert.equal(defense.province, 'nghe-an')
  assert.equal(defense.deadline, question.deadline)
  const text = JSON.stringify(game.teamView(a.id))
  assert.ok(!text.includes(b.name) && !('answer' in defense) && !('explanation' in defense))
})

test('đấu tay đôi: đội giữ tỉnh đúng trước → giữ tỉnh +50; đội công thành bị đẩy về, khóa 15 giây, giữ chuỗi đúng', () => {
  const { game, db, now, a, b, question, defense } = startDuel()
  db.prepare('UPDATE teams SET streak = 2 WHERE id = ?').run(b.id)
  const r = game.defend(a.id, defense.duelId, defenseAnswer(db, defense.duelId), 'An')
  assert.equal(r.held, true)
  assert.equal(game.scores().find(s => s.teamId === a.id).bonus, RULES.defendBonus)
  assert.equal(db.prepare("SELECT team_id FROM ownership WHERE province_id = 'nghe-an'").get().team_id, a.id)
  const vb = game.teamView(b.id)
  assert.equal(vb.pendingQuestion, null)
  assert.equal(vb.current, 'thanh-hoa')
  assert.equal(vb.lockedUntil - now(), RULES.repelLockMs)
  assert.equal(vb.lastResult.repelled, true)
  assert.equal(vb.streak, 2)
  assert.throws(() => game.answer(b.id, question.id, 0), { code: 'no-pending' })
  assert.deepEqual(game.teamView(a.id).defense, [])
  assert.ok(game.screenView().news.some(n => n.text.includes('tiếp khách thành công')))
})

test('đấu tay đôi: đội công thành đúng trước → cướp tỉnh; lượt phòng thủ đóng lại', () => {
  const { game, db, a, b, question, defense } = startDuel()
  assert.equal(game.answer(b.id, question.id, correctAnswer(db, b.id)).captured, true)
  assert.deepEqual(game.teamView(a.id).defense, [])
  assert.throws(() => game.defend(a.id, defense.duelId, defenseAnswer(db, defense.duelId), 'An'), { code: 'no-duel' })
})

test('đấu tay đôi: đội giữ tỉnh sai thì không bị phạt, hết quyền phòng thủ; đội công thành sai thì đội giữ tỉnh được báo giữ được', () => {
  const { game, db, a, b, question, defense } = startDuel()
  assert.equal(game.defend(a.id, defense.duelId, defenseAnswer(db, defense.duelId, false), 'An').correct, false)
  assert.deepEqual(game.teamView(b.id).pendingQuestion.duel, { foeMissed: true }) // đội công thành được báo "đối thủ trượt"
  assert.equal(game.teamView(a.id).lockedUntil, null)
  assert.deepEqual(game.teamView(a.id).defense, [])
  assert.throws(() => game.defend(a.id, defense.duelId, defenseAnswer(db, defense.duelId), 'Bình'), { code: 'answered' })
  game.answer(b.id, question.id, wrongAnswer(db, b.id))
  assert.ok(game.teamView(a.id).log.some(e => e.action === 'held' && e.province === 'nghe-an'))
  assert.equal(db.prepare("SELECT result FROM duels").get().result, 'attacker-fail')
})

test('đấu tay đôi: hết giờ thì không phòng thủ được nữa; tạm dừng dời giờ phòng thủ', () => {
  const { game, db, now, a, defense } = startDuel()
  game.pause()
  now.advance(60_000)
  game.resume()
  assert.equal(game.teamView(a.id).defense.length, 1)
  now.advance(RULES.answerLimitMs.siege + RULES.answerNetworkGraceMs + 1)
  assert.deepEqual(game.teamView(a.id).defense, [])
  assert.throws(() => game.defend(a.id, defense.duelId, defenseAnswer(db, defense.duelId), 'An'), { code: 'no-duel' })
})

test('chống công thành liên tục: tỉnh vừa đứng vững được miễn 60 giây (giữ được hoặc đội công thành sai)', () => {
  for (const how of ['defend', 'attacker-wrong']) {
    const { game, db, now, a, b, question, defense, teams } = startDuel()
    if (how === 'defend') game.defend(a.id, defense.duelId, defenseAnswer(db, defense.duelId), 'An')
    else game.answer(b.id, question.id, wrongAnswer(db, b.id))
    // Đội thứ ba tới Nghệ An: thấy tỉnh vừa đứng vững, chưa công thành được
    const c = teams[2]
    placeTeam(db, c.id, 'thanh-hoa')
    const r = game.move(c.id, 'nghe-an')
    assert.equal(r.blocked, 'calm', how)
    assert.throws(() => game.siege(c.id), { code: 'calm' }, how)
    now.advance(RULES.siegeCalmMs + 1)
    assert.doesNotThrow(() => game.siege(c.id), how)
  }
})

test('chống công thành liên tục: mỗi tỉnh một lượt công thành một lúc; bị cướp thì hết miễn', () => {
  const { game, db, a, b, question, teams } = startDuel()
  const c = teams[2]
  placeTeam(db, c.id, 'thanh-hoa')
  assert.equal(game.move(c.id, 'nghe-an').blocked, 'besieged')
  assert.throws(() => game.siege(c.id), { code: 'besieged' })
  // B cướp được → tỉnh đổi chủ, không có thời gian miễn: C công thành B được ngay
  game.answer(b.id, question.id, correctAnswer(db, b.id))
  assert.doesNotThrow(() => game.siege(c.id))
  assert.equal(game.teamView(b.id).defense.length, 1)
  assert.deepEqual(game.teamView(a.id).defense, [])
})

test('đấu tay đôi: đội công thành sai trước → đội giữ tỉnh vẫn trả lời tiếp được tới hết giờ, đúng thì +50', () => {
  const { game, db, a, b, question, defense } = startDuel()
  game.answer(b.id, question.id, wrongAnswer(db, b.id))
  const lockB = game.teamView(b.id).lockedUntil
  const still = game.teamView(a.id).defense
  assert.equal(still.length, 1)
  assert.equal(still[0].attackerDone, true)
  const r = game.defend(a.id, defense.duelId, defenseAnswer(db, defense.duelId), 'An')
  assert.equal(r.held, true)
  assert.equal(r.attackerDone, true)
  assert.equal(game.scores().find(s => s.teamId === a.id).bonus, RULES.defendBonus)
  assert.equal(game.teamView(b.id).lockedUntil, lockB) // đội công thành không bị phạt thêm
  assert.deepEqual(game.teamView(a.id).defense, [])
})

test('đấu tay đôi: bấm phòng thủ sau khi đội công thành đã cướp được → báo rõ', () => {
  const { game, db, a, b, question, defense } = startDuel()
  game.answer(b.id, question.id, correctAnswer(db, b.id))
  assert.throws(() => game.defend(a.id, defense.duelId, 0, 'An'), { code: 'no-duel', message: 'Lượt thử tài này đã kết thúc' })
})

// ---------- Chọn câu: tránh lặp trong phòng và xoay vòng qua các trận (28/10) ----------

test('chọn câu: các team trong cùng phòng tới cùng tỉnh nhận câu khác nhau (đỡ nghe lỏm)', () => {
  const { game, db, teams, now } = setupGame()
  clearOwnership(db)
  const seen = new Set()
  for (const t of teams) {
    placeTeam(db, t.id, 'thanh-hoa')
    const { question } = game.move(t.id, 'nghe-an')
    assert.ok(!seen.has(question.id), `${t.name} gặp lại câu ${question.id}`)
    seen.add(question.id)
    game.answer(t.id, question.id, wrongAnswer(db, t.id)) // sai → tỉnh vẫn trống cho team sau
    now.advance(RULES.lockWrongMs + 1)
  }
})

test('chọn câu: ưu tiên câu ít được hỏi nhất từ trước tới giờ (xoay vòng qua các trận); mỗi lần phát đều đếm', () => {
  const { game, db, teams } = setupGame()
  clearOwnership(db)
  const ids = db.prepare("SELECT id FROM questions WHERE province_id = 'nghe-an' AND difficulty = 'normal' ORDER BY id").all().map(r => r.id)
  const fresh = ids[ids.length - 1]
  db.prepare("UPDATE questions SET asked_count = 5 WHERE province_id = 'nghe-an' AND id != ?").run(fresh)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const { question } = game.move(teams[0].id, 'nghe-an')
  assert.equal(question.id, fresh)
  assert.equal(db.prepare('SELECT asked_count FROM questions WHERE id = ?').get(fresh).asked_count, 1)
})

test('chọn câu: đội giữ tỉnh đã thấy câu phòng thủ thì không bị phát lại câu đó; không tính vào thống kê', () => {
  const { game, db, a, question } = startDuel()
  assert.ok(db.prepare('SELECT 1 FROM answered WHERE team_id = ? AND question_id = ? AND skipped = 1').get(a.id, question.id))
  assert.ok(!game.questionStats().some(r => r.id === question.id && r.answers > 0))
})

test('Về quê: chọn quê lúc vào phòng — tỉnh phải có thật; trước khi bắt đầu đổi được, sau đó khóa (chưa chọn thì chọn được một lần)', () => {
  const { core, game, teams, room, now } = setupGame({ start: false })
  assert.throws(() => core.joinRoom(room.code, 'An', teams[0].id, 'khong-co'), { code: 'bad-home' })
  const p = core.joinRoom(room.code, 'An', teams[0].id, 'hue')
  const homeOf = () => game.teamView(teams[0].id).members.find(m => m.id === p.playerId).home
  assert.equal(homeOf(), 'hue')
  core.joinRoom(room.code, 'An', teams[0].id, 'nghe-an')
  assert.equal(homeOf(), 'nghe-an')
  core.joinRoom(room.code, 'Bình', teams[0].id)
  startNow(game, now)
  core.joinRoom(room.code, 'An', teams[0].id, 'hue')
  assert.equal(homeOf(), 'nghe-an', 'đã bắt đầu: không đổi quê được')
  core.joinRoom(room.code, 'Bình', teams[0].id, 'da-nang')
  assert.equal(game.teamView(teams[0].id).members.find(m => m.name === 'Bình').home, 'da-nang', 'chưa chọn thì chọn được một lần')
})

test('Về quê: cắm cờ ở tỉnh quê của thành viên → +50 một lần mỗi tỉnh; quê không lộ cho team khác hay màn chiếu', () => {
  const { core, game, db, teams, room } = setupGame()
  core.joinRoom(room.code, 'An', teams[0].id, 'nghe-an')
  core.joinRoom(room.code, 'Bảo', teams[0].id, 'nghe-an')
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  let { question } = game.move(teams[0].id, 'nghe-an')
  let r = game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id))
  assert.deepEqual(r.home, { names: ['An', 'Bảo'], bonus: RULES.homeBonus, n: 1 })
  assert.equal(game.scores().find(s => s.teamId === teams[0].id).bonus, RULES.homeBonus + r.speedBonus - r.penalty)
  const view = game.teamView(teams[0].id)
  assert.deepEqual(view.homes, { max: RULES.homeMax, bonus: RULES.homeBonus, done: ['nghe-an'] })
  assert.ok(view.log.some(e => e.action === 'home' && e.names.includes('An')))
  // Mất tỉnh rồi chiếm lại: không thưởng lần hai
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  ;({ question } = game.move(teams[0].id, 'nghe-an'))
  r = game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id))
  assert.equal(r.captured, true)
  assert.equal(r.home, null)
  // Không lộ quê ra ngoài team
  for (const other of [game.teamView(teams[1].id), game.screenView(), game.ownerView()]) {
    const s = JSON.stringify(other)
    assert.ok(!s.includes('"home":"nghe-an"') && !s.includes('names'), 'quê chỉ đồng đội thấy')
  }
})

test('Về quê: tối đa 3 tỉnh mỗi team', () => {
  const { core, game, db, teams, room } = setupGame()
  const homes = ['nghe-an', 'ha-tinh', 'quang-tri', 'hue']
  homes.forEach((h, i) => core.joinRoom(room.code, `Người ${i}`, teams[0].id, h))
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  const got = homes.map(h => {
    const { question } = game.move(teams[0].id, h)
    return game.answer(teams[0].id, question.id, correctAnswer(db, teams[0].id)).home?.n ?? null
  })
  assert.deepEqual(got, [1, 2, 3, null])
  assert.equal(game.teamView(teams[0].id).homes.done.length, RULES.homeMax)
})

test('tỉnh xuất phát: miền xáo mỗi trận (team đầu không luôn ở miền Bắc, phòng 2 team vẫn có miền Nam); không giáp nhau', () => {
  const db = memoryDb(), now = fakeClock(), core = createCore(db, now)
  const firstTeam = { north: 0, central: 0, south: 0 }, anyTeam = { north: 0, central: 0, south: 0 }
  for (let i = 0; i < 40; i++) {
    const { roomId } = core.createRoom({ name: `P${i}`, teamCount: i % 2 ? 2 : 3 })
    core.room(roomId).start()
    const starts = db.prepare('SELECT current_province AS p FROM teams WHERE room_id = ? ORDER BY id').all(roomId).map(r => core.room(roomId).provinces.get(r.p))
    firstTeam[starts[0].region]++
    for (const s of starts) anyTeam[s.region]++
    const adj = core.room(roomId).adjacency
    for (const a of starts) for (const b of starts) assert.ok(a === b || !adj.get(a.id).has(b.id), `${a.id} giáp ${b.id}`)
  }
  for (const r of ['north', 'central', 'south']) {
    assert.ok(firstTeam[r] >= 5, `team đầu ở ${r}: ${firstTeam[r]}/40`)
    assert.ok(anyTeam[r] >= 25, `${r}: ${anyTeam[r]}`)
  }
})

// Câu hỏi chung cả phòng: đáp án đúng của câu chung theo thứ tự đã xáo (đọc từ DB)
function sharedCorrect(db, roomId) {
  const s = JSON.parse(db.prepare('SELECT shared_question FROM rooms WHERE id = ?').get(roomId).shared_question)
  return s.order.indexOf(JSON.parse(db.prepare('SELECT answer FROM questions WHERE id = ?').get(s.question).answer))
}

test('câu hỏi chung: tạm dừng trận, không lộ đáp án trước khi công bố, cả phòng đúng ≥ 70% → mọi team +100', () => {
  const { db, now, core, game, teams, room } = setupGame()
  const ids = ['Xuka', 'Nobita', 'Chaien', 'Xeko'].map((n, i) => core.joinRoom(room.code, n, teams[i % 3].id).playerId)
  assert.throws(() => game.voteShared(ids[0], 0), { code: 'shared-closed' })
  game.startShared()
  assert.equal(game.state().status, 'paused')
  assert.throws(() => game.startShared(), { code: 'not-running' })
  const right = sharedCorrect(db, room.roomId)
  const views = () => [game.teamView(teams[0].id), game.screenView(), game.ownerView()]
  for (const v of views()) {
    assert.equal(v.shared.options.length, 4)
    assert.equal(v.shared.result, null)
    assert.ok(!JSON.stringify(v.shared).includes('answer'))
  }
  assert.throws(() => game.voteShared(ids[0], 9), { code: 'bad-answer' })
  game.voteShared(ids[0], (right + 1) % 4)
  game.voteShared(ids[0], right) // đổi phiếu được
  for (const id of ids.slice(1)) game.voteShared(id, right)
  assert.equal(game.screenView().shared.voted, 4)
  assert.equal(game.settleShared(), false) // chưa hết giờ
  now.advance(RULES.sharedMs)
  assert.equal(game.settleShared(), true)
  assert.throws(() => game.voteShared(ids[1], right), { code: 'shared-closed' })
  for (const v of views()) {
    assert.deepEqual({ ...v.shared.result, answer: undefined, explanation: undefined },
      { counts: [0, 1, 2, 3].map(i => (i === right ? 4 : 0)), correct: right, voters: 4, pct: 100, passed: true, bonus: RULES.sharedBonus, answer: undefined, explanation: undefined })
    assert.ok(v.shared.result.explanation)
    // Chỉ số đếm gộp: không tên người, không theo team
    for (const n of ['Xuka', 'Nobita', 'Chaien', 'Xeko']) assert.ok(!JSON.stringify(v.shared).includes(n))
  }
  for (const t of teams) assert.equal(game.scores().find(s => s.teamId === t.id).bonus, RULES.sharedBonus)
  assert.equal(game.teamView(teams[0].id).log[0].action, 'shared-bonus')
  assert.match(game.screenView().news[0].text, /đúng 100% — mọi team \+100/)
  game.resume()
  assert.equal(game.state().status, 'running')
  assert.equal(game.teamView(teams[0].id).shared, null)
})

test('câu hỏi chung: dưới 70% không thưởng; MC tiếp tục sớm thì công bố luôn; câu đã ra không lặp lại trong phòng', () => {
  const { db, now, core, game, teams, room } = setupGame({ teamCount: 2 })
  const ids = ['An', 'Bình', 'Chi'].map((n, i) => core.joinRoom(room.code, n, teams[i % 2].id).playerId)
  game.startShared()
  const first = game.screenView().shared.content
  const right = sharedCorrect(db, room.roomId)
  game.voteShared(ids[0], right)
  game.voteShared(ids[1], (right + 1) % 4)
  game.resume() // chưa hết giờ: công bố (2 người chọn, 1 đúng = 50%) rồi đóng câu
  assert.equal(game.state().status, 'running')
  const log = db.prepare("SELECT detail FROM events_log WHERE action = 'shared-result'").get()
  assert.deepEqual({ ...JSON.parse(log.detail), question: undefined }, { pct: 50, voters: 2, passed: false, bonus: 0, question: undefined })
  for (const t of teams) assert.equal(game.scores().find(s => s.teamId === t.id).bonus, 0)
  now.advance(1000)
  game.startShared()
  assert.notEqual(game.screenView().shared.content, first)
  game.end()
  assert.equal(game.screenView().shared, null)
})

test('sảnh chờ "Bạn có biết?": 12 câu chia đều 3 miền, có lời giải, cố định theo phòng; không phát cho team trong phòng', () => {
  const { db, now, game, teams } = setupGame({ start: false })
  const v = game.screenView()
  assert.equal(v.facts.length, RULES.factCount)
  const region = id => db.prepare('SELECT region FROM provinces WHERE id = ?').get(id).region
  assert.deepEqual(v.facts.slice(0, 3).map(f => region(f.province)).sort(), ['central', 'north', 'south'])
  for (const f of v.facts) assert.ok(f.content && f.answer && f.explanation)
  assert.deepEqual(game.teamView(teams[0].id).facts, v.facts) // cùng danh sách trên mọi máy
  const contents = new Set(v.facts.map(f => f.content))
  startNow(game, now)
  assert.equal(game.screenView().facts, null)
  // Tới tỉnh có câu sảnh chờ nhiều lần: không lần nào nhận đúng câu đã lộ
  const target = v.facts[0].province
  const from = [...db.prepare('SELECT neighbor_id FROM adjacency WHERE province_id = ?').all(target)][0].neighbor_id
  clearOwnership(db)
  for (let i = 0; i < 6; i++) {
    db.prepare('UPDATE teams SET pending_question = NULL, choosing_at = NULL, locked_until = NULL WHERE id = ?').run(teams[0].id)
    placeTeam(db, teams[0].id, from)
    game.move(teams[0].id, target)
    const q = game.teamView(teams[0].id).pendingQuestion
    assert.ok(!contents.has(q.content), q.content)
    db.prepare('INSERT OR IGNORE INTO answered (team_id, question_id, correct, answered_at) VALUES (?, ?, 0, 0)').run(teams[0].id, q.id)
  }
})

test('"Đã từng / Muốn thử": chỉ sau câu đúng về ẩm thực / di sản của team mình; chỉ trả số gộp; tổng kết văn hóa sau trận', () => {
  const { db, now, core, game, teams, room } = setupGame({ start: false })
  const [p1, p2, p3] = ['Xuka', 'Nobita', 'Chaien'].map((n, i) => core.joinRoom(room.code, n, teams[i === 2 ? 1 : 0].id).playerId)
  assert.throws(() => game.react(teams[0].id, p1, 'nghe-an', 'food', 'been'), { code: 'not-started' })
  startNow(game, now)
  clearOwnership(db)
  // Trả lời đúng một câu ẩm thực ở Nghệ An (dựng thẳng câu đang chờ)
  const food = db.prepare("SELECT id FROM questions WHERE province_id = 'nghe-an' AND topic = 'am-thuc' AND difficulty = 'normal' AND kind = 'choice' LIMIT 1").get().id
  placeTeam(db, teams[0].id, 'nghe-an')
  db.prepare('UPDATE teams SET pending_question = ?, pending_order = ?, pending_at = ? WHERE id = ?').run(food, '[0,1,2,3]', now(), teams[0].id)
  const r = game.answer(teams[0].id, food, correctAnswer(db, teams[0].id))
  assert.equal(r.react, 'food')
  assert.throws(() => game.react(teams[1].id, p3, 'nghe-an', 'food', 'been'), { code: 'bad-react' }) // team khác chưa trả lời
  assert.throws(() => game.react(teams[0].id, p1, 'nghe-an', 'place', 'been'), { code: 'bad-react' }) // chưa có câu di sản
  assert.throws(() => game.react(teams[0].id, p1, 'nghe-an', 'food', 'bad'), { code: 'bad-react' })
  game.react(teams[0].id, p1, 'nghe-an', 'food', 'want')
  assert.deepEqual(game.react(teams[0].id, p1, 'nghe-an', 'food', 'been'), { been: 1, want: 0, mine: 'been' }) // đổi ý
  assert.deepEqual(game.react(teams[0].id, p2, 'nghe-an', 'food', 'want'), { been: 1, want: 1, mine: 'want' })
  assert.deepEqual(game.react(teams[0].id, p2, 'nghe-an', 'food', null), { been: 1, want: 0, mine: null })
  game.react(teams[0].id, p2, 'nghe-an', 'food', 'want')
  // Một câu sai để có "câu khó nhất"
  placeTeam(db, teams[1].id, 'ha-tinh')
  const { question } = game.move(teams[1].id, 'quang-tri')
  game.answer(teams[1].id, question.id, (correctAnswer(db, teams[1].id) + 1) % 4)
  game.end()
  const c = game.replay().culture
  assert.equal(c.answers, 2)
  assert.equal(c.correctPct, 50)
  assert.equal(c.hardest.length, 1)
  assert.equal(c.hardest[0].content, question.content)
  assert.ok(c.hardest[0].answer && c.hardest[0].explanation)
  assert.deepEqual(c.food, { been: [{ province: 'nghe-an', n: 1 }], want: [{ province: 'nghe-an', n: 1 }] })
  assert.equal(c.reactions, 2)
  for (const n of ['Xuka', 'Nobita', 'Chaien']) assert.ok(!JSON.stringify(c).includes(n))
  game.reset()
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reactions').get().n, 0)
})

test('chủ phòng sửa tên người chơi: chuẩn hóa, không trùng, tên cũ biến khỏi nhật ký; xem lại không có dòng sửa tên', () => {
  const { db, now, core, game, teams, room } = setupGame({ start: false })
  const a = core.joinRoom(room.code, 'Tên Xấu', teams[0].id).playerId
  core.joinRoom(room.code, 'Bình', teams[1].id)
  startNow(game, now)
  clearOwnership(db)
  placeTeam(db, teams[0].id, 'thanh-hoa')
  game.move(teams[0].id, 'nghe-an', 'Tên Xấu')
  assert.throws(() => game.renamePlayer(a, '  '), { code: 'bad-name' })
  assert.throws(() => game.renamePlayer(a, 'binh'), { code: 'name-taken' })
  assert.throws(() => game.renamePlayer(999, 'X'), { code: 'no-player' })
  assert.deepEqual(game.renamePlayer(a, '  Lan   Anh '), { name: 'Lan Anh' })
  const v = game.teamView(teams[0].id)
  assert.deepEqual(v.members.map(m => m.name), ['Lan Anh'])
  assert.ok(!JSON.stringify(v).includes('Tên Xấu'))
  assert.equal(v.log.find(e => e.action === 'move').by, 'Lan Anh')
  assert.ok(!JSON.stringify(game.ownerView()).includes('Tên Xấu'))
  // Vào lại bằng tên mới (mất phiên) nhận lại đúng chỗ
  assert.equal(core.joinRoom(room.code, 'lan anh', teams[0].id).playerId, a)
  game.end()
  assert.ok(!game.replay().events.some(e => e.action === 'rename'))
})

// ---------- Phòng chơi đơn ----------
function setupSolo(names = ['Xuka', 'Nobita', 'Chaien'], { start = true, pioneer = true } = {}) {
  const db = memoryDb()
  const now = fakeClock()
  const core = createCore(db, now)
  const created = core.createRoom({ name: 'Phòng đơn', mode: 'solo', pioneer })
  const game = core.room(created.roomId)
  const players = names.map(n => core.joinRoom(created.code, n))
  if (start) startNow(game, now)
  return { db, now, core, game, room: created, players }
}
// Đưa người chơi tới tỉnh `to` (từ một tỉnh giáp ranh) và trả lời
function soloVisit(db, game, p, to, right = true) {
  const from = db.prepare('SELECT neighbor_id FROM adjacency WHERE province_id = ?').get(to).neighbor_id
  db.prepare('UPDATE teams SET current_province = ?, previous_province = NULL, locked_until = NULL WHERE id = ?').run(from, p.teamId)
  const r = game.move(p.teamId, to)
  if (r.status !== 'question') return r
  const ans = correctAnswer(db, p.teamId)
  const given = right ? ans : typeof ans === 'number' ? (ans + 1) % r.question.options.length : typeof ans === 'boolean' ? !ans : 'sai bét'
  return game.answer(p.teamId, r.question.id, given)
}

test('phòng đơn: mỗi người một team ẩn, sảnh chờ không lộ tên, xuất phát có tem, không có chủ tỉnh', () => {
  const { db, core, game, room, players } = setupSolo(['Xuka', 'Nobita', 'Chaien'], { start: false })
  assert.equal(new Set(players.map(p => p.teamId)).size, 3)
  const lobby = core.lobby(room.code)
  assert.equal(lobby.mode, 'solo')
  assert.deepEqual(lobby.teams, [])
  assert.equal(lobby.players, 3)
  assert.equal(core.joinRoom(room.code, 'xuka').teamId, players[0].teamId) // vào lại đúng tên
  assert.throws(() => core.createRoom({ name: 'x', mode: 'abc' }), { code: 'bad-room' })
  game.start()
  const stamps = db.prepare('SELECT * FROM stamps').all()
  assert.equal(stamps.length, 3)
  assert.ok(stamps.every(s => s.first === 0 && s.question_id === null))
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ownership').get().n, 0)
  for (const s of game.scores()) assert.equal(s.provinces, 1)
})

test('phòng đơn: nhận tem + Tiên phong cho người đúng đầu tiên; tỉnh đã có tem đi qua không hỏi; người sau vẫn có tem thường', () => {
  const { db, game, players: [a, b, c] } = setupSolo()
  db.exec('DELETE FROM stamps') // bỏ tem xuất phát cho dễ dựng tình huống
  const ra = soloVisit(db, game, a, 'nghe-an')
  assert.equal(ra.captured, true)
  assert.equal(ra.pioneer, RULES.pioneerBonus)
  const rb = soloVisit(db, game, b, 'nghe-an')
  assert.equal(rb.captured, true)
  assert.equal(rb.pioneer, 0)
  assert.equal(soloVisit(db, game, a, 'nghe-an').status, 'own')
  const rc = soloVisit(db, game, c, 'nghe-an', false)
  assert.equal(rc.correct, false)
  assert.ok(rc.lockedUntil)
  const points = game.provinces.get('nghe-an').points
  const sc = new Map(game.scores().map(s => [s.teamId, s]))
  assert.equal(sc.get(a.teamId).total, points + sc.get(a.teamId).bonus)
  assert.ok(sc.get(a.teamId).bonus >= RULES.pioneerBonus)
  assert.equal(sc.get(b.teamId).provinces, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ownership').get().n, 0)
  // Màn team: tem của mình, số người có tem ở tỉnh đã ghé, hạng
  const va = game.teamView(a.teamId)
  assert.deepEqual(va.stamps.map(s => [s.province, s.first]), [['nghe-an', true]])
  assert.equal(va.stampCounts['nghe-an'], 2)
  assert.equal(va.known['nghe-an'], 'mine')
  assert.equal(va.rank.of, 3)
  assert.equal(game.teamView(c.teamId).known['nghe-an'], 'free')
  assert.equal(game.teamView(c.teamId).canRetry, true)
  // Màn chiếu: tin Tiên phong không nêu tên, bản đồ nhiệt
  const sv = game.screenView()
  assert.equal(sv.news[0].text, 'Một lữ khách vừa là người đầu tiên tới Nghệ An!')
  assert.ok(!sv.news.some(n => n.kind === 'capture'))
  assert.equal(sv.heat['nghe-an'], 2)
  // Trang chủ phòng: số tem Tiên phong của từng người (danh sách lữ khách)
  const ov = new Map(game.ownerView().teams.map(t => [t.id, t]))
  assert.equal(ov.get(a.teamId).pioneers, 1)
  assert.equal(ov.get(b.teamId).pioneers, 0)
})

test('phòng đơn: tắt Tiên phong thì không thưởng; màn chiếu chỉ top 10; vào muộn xuất phát ngay; tối đa 50 người', () => {
  const names = Array.from({ length: 12 }, (_, i) => `Người ${i + 1}`)
  const { db, core, game, room, players } = setupSolo(names, { pioneer: false })
  db.exec('DELETE FROM stamps')
  assert.equal(soloVisit(db, game, players[0], 'hue').pioneer, 0)
  const sv = game.screenView()
  assert.equal(sv.scoreboard.length, RULES.screenTop)
  assert.equal(sv.players, 12)
  const late = core.joinRoom(room.code, 'Đến muộn')
  const t = db.prepare('SELECT current_province FROM teams WHERE id = ?').get(late.teamId)
  assert.ok(t.current_province)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stamps WHERE team_id = ?').get(late.teamId).n, 1)
  for (let i = 14; i <= RULES.maxSoloPlayers; i++) core.joinRoom(room.code, `Thêm ${i}`)
  assert.throws(() => core.joinRoom(room.code, 'Quá tải'), { code: 'room-full' })
})

test('phòng đơn: câu vàng lấy từ kho thử tài (giờ 45 giây) nhưng hiện như câu thường; sai không bị đẩy về', () => {
  const { db, now, game, players: [a] } = setupSolo(['Xuka'])
  db.exec('DELETE FROM stamps')
  game.triggerEvent('golden')
  const from = db.prepare("SELECT neighbor_id FROM adjacency WHERE province_id = 'hue'").get().neighbor_id
  db.prepare('UPDATE teams SET current_province = ? WHERE id = ?').run(from, a.teamId)
  const r = game.move(a.teamId, 'hue')
  assert.equal(db.prepare('SELECT difficulty FROM questions WHERE id = ?').get(r.question.id).difficulty, 'siege')
  assert.equal(r.question.difficulty, 'normal')
  assert.equal(r.question.golden, true)
  assert.equal(r.question.deadline - r.question.issuedAt, RULES.answerLimitMs.siege)
  now.advance(RULES.answerLimitMs.normal + 5000) // quá giờ câu thường nhưng còn giờ câu thử tài
  const res = game.answer(a.teamId, r.question.id, correctAnswer(db, a.teamId))
  assert.equal(res.captured, true)
  assert.ok(res.goldenBonus > 0)
  // Sai câu vàng: khóa ×2, không bị đẩy về tỉnh trước
  const r2 = soloVisit(db, game, a, 'da-nang', false)
  assert.equal(r2.pushedBack, false)
  assert.equal(r2.lockedUntil - now(), RULES.lockWrongMs * RULES.goldenLockFactor)
})

test('phòng đơn: chủ phòng sửa tên đổi cả tên trên bảng điểm; mời ra xóa luôn hành trình; ống nhòm cho số người có tem', () => {
  const { db, game, players: [a, b] } = setupSolo(['Tên Xấu', 'Nobita'])
  game.renamePlayer(a.playerId, 'Lan Anh')
  assert.ok(game.screenView().scoreboard.some(s => s.name === 'Lan Anh'))
  assert.ok(!JSON.stringify(game.screenView()).includes('Tên Xấu'))
  db.prepare("INSERT INTO cards (team_id, kind) VALUES (?, 'scout')").run(b.teamId)
  const card = db.prepare('SELECT id FROM cards WHERE team_id = ?').get(b.teamId)
  const region = db.prepare('SELECT region FROM provinces WHERE id = (SELECT current_province FROM teams WHERE id = ?)').get(a.teamId).region
  const r = game.useCard(b.teamId, card.id, region)
  assert.ok(Object.values(r.counts).reduce((x, y) => x + y, 0) >= 1)
  game.kickPlayer(a.playerId)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teams WHERE id = ?').get(a.teamId).n, 0)
  assert.equal(game.scores().length, 1)
})

test('phòng chơi đơn có sẵn: tạo đủ, người vào trước làm chủ phòng, chủ phòng rời thì người kế nhận; kết thúc lâu thì làm mới', () => {
  const db = memoryDb()
  const now = fakeClock()
  const core = createCore(db, now)
  core.ensurePresetRooms()
  core.ensurePresetRooms() // gọi lại không tạo trùng
  const list = core.presetRooms()
  assert.deepEqual(list.map(r => r.name), RULES.presetRooms)
  assert.ok(list.every(r => r.status === 'waiting' && r.players === 0 && !r.hasHost))
  const code = list[0].code
  const a = core.joinRoom(code, 'Xuka')
  const b = core.joinRoom(code, 'Nobita')
  assert.equal(a.host, true)
  assert.equal(b.host, false)
  // Vào lại bằng tên (mất phiên / máy khác): nhận lại chỗ nhưng không nhận quyền chủ phòng — tên ai cũng biết
  const rejoin = core.joinRoom(code, 'xuka')
  assert.equal(rejoin.playerId, a.playerId)
  assert.equal(rejoin.host, false)
  assert.equal(rejoin.noHost, true)
  assert.equal(core.presetRooms()[0].hasHost, true)
  const game = core.room(a.roomId)
  assert.equal(game.teamView(a.teamId).hostId, a.playerId)
  assert.equal(game.teamView(b.teamId).hostId, null)
  assert.equal(game.ownerView().hostId, a.playerId)
  game.leave(a.playerId) // chủ phòng rời phòng (trước khi bắt đầu)
  assert.equal(game.ownerView().hostId, b.playerId)
  // Phòng tự tạo không có chủ phòng kiểu này
  const own = core.createRoom({ name: 'Tự tạo', mode: 'solo' })
  assert.equal(core.joinRoom(own.code, 'Chaien').host, false)
  // Kết thúc quá 30 phút → xóa, tạo lại phòng mới cùng tên (mã mới)
  startNow(game, now)
  game.end()
  now.advance(RULES.presetIdleMs + 1000)
  core.cleanupRooms()
  core.ensurePresetRooms()
  const again = core.presetRooms()
  assert.equal(again.length, RULES.presetRooms.length)
  assert.notEqual(again.find(r => r.name === list[0].name).code, code)
})

test('danh sách phòng đang mở: chỉ phòng tự tạo bật "hiện trong danh sách", chưa kết thúc; mới nhất trước; không có tên người chơi', () => {
  const db = memoryDb()
  const now = fakeClock()
  const core = createCore(db, now)
  core.ensurePresetRooms()
  const hidden = core.createRoom({ name: 'Kín', teamCount: 2 })
  const team = core.createRoom({ name: 'Phòng team', teamCount: 3, listed: true })
  now.advance(1000)
  const solo = core.createRoom({ name: 'Phòng đơn', mode: 'solo', listed: true })
  core.joinRoom(solo.code, 'Xuka')
  const list = core.publicRooms()
  assert.deepEqual(list.map(r => r.code), [solo.code, team.code])
  assert.ok(!list.some(r => r.code === hidden.code))
  assert.deepEqual(list[0], { code: solo.code, name: 'Phòng đơn', status: 'waiting', mode: 'solo', durationMin: list[0].durationMin, players: 1, teams: null, maxPerTeam: RULES.maxPlayersPerTeam, max: RULES.maxSoloPlayers })
  assert.equal(list[1].teams.length, 3)
  assert.deepEqual(Object.keys(list[1].teams[0]).sort(), ['color', 'mascot', 'members'])
  assert.equal(list[1].max, 3 * RULES.maxPlayersPerTeam)
  assert.ok(!JSON.stringify(list).includes('Xuka'))
  // Kết thúc → rời danh sách
  const game = core.room(solo.roomId)
  startNow(game, now)
  game.end()
  assert.deepEqual(core.publicRooms().map(r => r.code), [team.code])
})

test('bảng xếp hạng cá nhân: phòng đơn kết thúc thì ghi; cùng tên nhiều phòng cộng dồn; phòng team không ghi; giữ 7 ngày', () => {
  const { db, now, core, game, players: [xuka, nobita, chaien] } = setupSolo(['Xuka', 'Nobita', 'Chaien'])
  db.prepare('UPDATE teams SET bonus_points = 100 WHERE id = ?').run(xuka.teamId)
  db.prepare('DELETE FROM stamps WHERE team_id = ?').run(chaien.teamId) // chưa có tem nào, 0 điểm → không ghi
  assert.equal(core.leaderboard().entries.length, 0) // chưa kết thúc
  game.end()
  let board = core.leaderboard()
  assert.deepEqual(board.entries.map(e => [e.rank, e.name, e.games]), [[1, 'Xuka', 1], [2, 'Nobita', 1]])
  assert.equal(board.entries[0].stamps, 1)
  assert.equal(board.players, 2)

  // Phòng đơn thứ hai, hết giờ tự kết thúc: "xuka" (khác hoa thường) = cùng người → cộng dồn điểm + tem, số trận 2, tên theo trận mới nhất
  const r2 = core.createRoom({ name: 'Phòng 2', mode: 'solo', durationMin: 15 })
  const g2 = core.room(r2.roomId)
  const [x2, n2, s2] = ['xuka', 'Nobita', 'Shizuka'].map(n => core.joinRoom(r2.code, n))
  startNow(g2, now)
  db.prepare('UPDATE teams SET bonus_points = 500 WHERE id = ?').run(n2.teamId)
  const best = board.entries[0].score, nobitaOld = board.entries[1].score
  now.advance(16 * 60_000)
  g2.state()
  board = core.leaderboard()
  const by = Object.fromEntries(board.entries.map(e => [e.name, e]))
  const game2 = name => db.prepare('SELECT score, stamps FROM leaderboard WHERE room_id = ? AND name = ?').get(r2.roomId, name)
  assert.equal(board.entries[0].name, 'Nobita')
  assert.equal(by.xuka.score, best + game2('xuka').score)
  assert.equal(by.xuka.stamps, 1 + game2('xuka').stamps)
  assert.equal(by.xuka.games, 2)
  assert.ok(!by.Xuka) // tên hiện theo trận gần nhất
  assert.equal(by.Nobita.score, nobitaOld + game2('Nobita').score)
  assert.equal(by.Nobita.games, 2)
  assert.equal(by.Shizuka.games, 1)
  assert.equal(board.plays, 5)
  void x2; void n2; void s2

  // Phòng team kết thúc: không ghi
  const { game: teamGame } = setupGame({ teamCount: 2 })
  teamGame.end()
  assert.equal(core.leaderboard().plays, 5)

  // Quá 7 ngày: không còn trên bảng, dọn khỏi DB
  now.advance(RULES.leaderboardKeepMs + 1000)
  assert.equal(core.leaderboard().entries.length, 0)
  core.cleanupRooms()
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM leaderboard').get().n, 0)
})

test('bảng xếp hạng cá nhân: bằng điểm và bằng số tem thì cùng hạng', () => {
  const { db, core, game } = setupSolo(['A', 'B', 'C'])
  db.exec('DELETE FROM stamps; UPDATE teams SET bonus_points = 50')
  game.end()
  assert.deepEqual(core.leaderboard().entries.map(e => e.rank), [1, 1, 1])
})
