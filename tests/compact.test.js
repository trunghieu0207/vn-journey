// Phòng "Team gọn" (chốt 3/11): không thẻ bài, thưởng nhanh thay trừ giờ, cược Chắc ăn / Liều;
// tắt Đấu (mặc định) = mỗi team một bản đồ riêng (tem) + thưởng về đích; bật Đấu = chung bản đồ, có thử tài.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupGame, startNow, placeTeam, correctAnswer, wrongAnswer, memoryDb } from './helpers.js'
import { upgradeDatabase } from '../server/db.js'
import { RULES } from '../server/game.js'

const cityId = db => db.prepare('SELECT id FROM provinces WHERE is_city = 1 ORDER BY id LIMIT 1').get().id
const points = (db, id) => db.prepare('SELECT points FROM provinces WHERE id = ?').get(id).points
const allIds = db => db.prepare('SELECT id FROM provinces ORDER BY id').all().map(r => r.id)

// Team đứng ở tỉnh rồi nhận câu (trả lời lại tại chỗ — không cần đi từ tỉnh kề)
function askAt(game, db, teamId, provinceId) {
  placeTeam(db, teamId, provinceId)
  const r = game.retry(teamId)
  assert.equal(r.status, 'question')
  return r.question
}
const answerRight = (game, db, teamId, q) => game.answer(teamId, q.id, correctAnswer(db, teamId))

function setupCompact(opts = {}) {
  const g = setupGame({ mode: 'compact', teamCount: 2, start: false, ...opts })
  const players = g.teams.map((t, i) => g.core.joinRoom(g.room.code, `Người ${i + 1}`, t.id))
  startNow(g.game, g.now)
  return { ...g, players }
}

test('Team gọn: lưu là phòng team, mặc định tắt Đấu, không Tiên phong, 30 phút; bật Đấu khi tạo được', () => {
  const { db, core, room } = setupGame({ mode: 'compact', teamCount: 3, start: false })
  const r = db.prepare('SELECT mode, compact, duel, pioneer, duration_min FROM rooms WHERE id = ?').get(room.roomId)
  assert.deepEqual({ ...r }, { mode: 'team', compact: 1, duel: 0, pioneer: 0, duration_min: RULES.compactDurationMin })
  assert.equal(core.lobby(room.code).compact, true)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teams WHERE room_id = ?').get(room.roomId).n, 3)
  const duel = core.createRoom({ name: 'Có đấu', mode: 'compact', teamCount: 2, duel: true })
  assert.equal(db.prepare('SELECT duel FROM rooms WHERE id = ?').get(duel.roomId).duel, 1)
  // Phòng team thường: luôn có đấu, không phải Team gọn
  const normal = core.createRoom({ name: 'Thường', teamCount: 2 })
  assert.deepEqual({ ...db.prepare('SELECT compact, duel FROM rooms WHERE id = ?').get(normal.roomId) }, { compact: 0, duel: 1 })
})

test('Team gọn tắt Đấu: mỗi team một bản đồ — tỉnh team khác đã chiếm vẫn trả lời và chiếm được; không thử tài', () => {
  const { db, game, teams: [a, b] } = setupCompact()
  const starts = new Set([a, b].flatMap(t => game.teamView(t.id).mine.map(m => m.province)))
  const id = allIds(db).find(x => !starts.has(x))
  const qa = askAt(game, db, a.id, id)
  assert.equal(answerRight(game, db, a.id, qa).captured, true)
  const qb = askAt(game, db, b.id, id)
  const rb = answerRight(game, db, b.id, qb)
  assert.equal(rb.captured, true)
  assert.equal(rb.stamp, false) // không gọi là "tem" như phòng đơn
  const owned = Object.fromEntries(game.scores().map(s => [s.teamId, s.provinces]))
  assert.equal(owned[a.id], 2) // tỉnh xuất phát + tỉnh vừa chiếm
  assert.equal(owned[b.id], 2)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ownership').get().n, 0)
  assert.throws(() => game.siege(a.id), { code: 'no-siege' })
  // Màn team: đã chiếm thì là "của mình", không hỏi lại
  assert.equal(game.teamView(a.id).known[id], 'mine')
  assert.equal(game.teamView(a.id).room.stamps, true)
  assert.throws(() => game.retry(a.id), { code: 'own-province' })
})

test('Team gọn: không có thẻ bài — chiếm thành phố không rơi thẻ, đúng liền 3 câu được +50', () => {
  const { db, game, teams: [a] } = setupCompact()
  const city = cityId(db)
  const r = answerRight(game, db, a.id, askAt(game, db, a.id, city))
  assert.equal(r.card, null)
  const others = allIds(db).filter(id => id !== city && !game.teamView(a.id).mine.some(m => m.province === id)).slice(0, 2)
  let last
  for (const id of others) last = answerRight(game, db, a.id, askAt(game, db, a.id, id))
  assert.deepEqual([last.streak.n, last.streak.card, last.streak.bonus], [3, null, RULES.streakFullBonus])
  assert.equal(game.teamView(a.id).cards.length, 0)
})

test('Team gọn: thưởng nhanh giảm đều từ +100% điểm tỉnh về 0 lúc hết giờ, chậm không bị trừ', () => {
  const { db, now, game, teams: [a] } = setupCompact()
  const [p1, p2, p3] = allIds(db).filter(id => !game.teamView(a.id).mine.some(m => m.province === id))
  const at = (id, waitMs) => {
    const q = askAt(game, db, a.id, id)
    now.advance(waitMs)
    return answerRight(game, db, a.id, q)
  }
  const limit = RULES.answerLimitMs.normal
  assert.equal(at(p1, 0).speedBonus, points(db, p1))
  assert.equal(at(p2, limit / 2).speedBonus, Math.round(points(db, p2) / 2))
  const late = at(p3, limit - 1000)
  assert.equal(late.penalty, 0)
  assert.equal(late.speedBonus, Math.round(points(db, p3) * 1000 / limit))
})

test('Team gọn: cược "Liều" giữ nguyên — đúng +50% điểm tỉnh, sai khóa thêm', () => {
  const { db, game, teams: [a] } = setupCompact({ betChoice: true })
  const [p1, p2] = allIds(db).filter(id => !game.teamView(a.id).mine.some(m => m.province === id))
  placeTeam(db, a.id, p1)
  assert.equal(game.retry(a.id).status, 'choose')
  const q1 = game.chooseTopic(a.id, 'random', null, true).question
  assert.equal(answerRight(game, db, a.id, q1).betBonus, Math.round(points(db, p1) * RULES.betBonusRatio))
  placeTeam(db, a.id, p2)
  game.retry(a.id)
  const q2 = game.chooseTopic(a.id, 'random', null, true).question
  const wrong = game.answer(a.id, q2.id, wrongAnswer(db, a.id))
  assert.equal(wrong.bet, true)
})

test('Team gọn tắt Đấu: đủ 34 tỉnh → thưởng về đích theo phút còn lại; mọi team về đích thì trận kết thúc', () => {
  const { db, now, game, teams: [a, b] } = setupCompact()
  const ids = allIds(db)
  const fillAllBut = (teamId, last) => {
    const have = new Set(game.teamView(teamId).mine.map(m => m.province))
    for (const id of ids) if (id !== last && !have.has(id)) {
      db.prepare('INSERT INTO stamps (room_id, team_id, province_id, first, question_id, at) VALUES ((SELECT room_id FROM teams WHERE id = ?), ?, ?, 0, NULL, 0)').run(teamId, teamId, id)
    }
  }
  const lastOf = teamId => ids.find(id => !game.teamView(teamId).mine.some(m => m.province === id))
  now.advance(10 * 60_000) // còn 20 phút
  const la = lastOf(a.id)
  fillAllBut(a.id, la)
  const ra = answerRight(game, db, a.id, askAt(game, db, a.id, la))
  assert.deepEqual(ra.finish, { bonus: 20 * RULES.finishBonusPerMin, ended: false })
  assert.deepEqual(game.teamView(a.id).finished, { at: game.teamView(a.id).finished.at, bonus: 20 * RULES.finishBonusPerMin })
  assert.ok(game.screenView().news.some(n => n.kind === 'finish'))
  assert.equal(game.state().status, 'running')

  now.advance(5 * 60_000 + 30_000) // còn 14,5 phút
  const lb = lastOf(b.id)
  fillAllBut(b.id, lb)
  const rb = answerRight(game, db, b.id, askAt(game, db, b.id, lb))
  assert.deepEqual(rb.finish, { bonus: Math.round(14.5 * RULES.finishBonusPerMin), ended: true })
  assert.equal(game.state().status, 'ended')
  assert.equal(game.screenView().news[0].text, 'Mọi đội đã về đích!')
})

test('Team gọn: team không có ai chơi không chặn việc kết thúc khi các team khác đã về đích', () => {
  const g = setupGame({ mode: 'compact', teamCount: 3, start: false })
  g.core.joinRoom(g.room.code, 'Một mình', g.teams[0].id)
  startNow(g.game, g.now)
  const { db, game } = g
  const a = g.teams[0]
  const ids = allIds(db)
  const last = ids.find(id => !game.teamView(a.id).mine.some(m => m.province === id))
  for (const id of ids) if (id !== last && !game.teamView(a.id).mine.some(m => m.province === id)) {
    db.prepare('INSERT INTO stamps (room_id, team_id, province_id, first, question_id, at) VALUES (?, ?, ?, 0, NULL, 0)').run(g.room.roomId, a.id, id)
  }
  assert.equal(answerRight(game, db, a.id, askAt(game, db, a.id, last)).finish.ended, true)
})

test('Team gọn bật Đấu: chung bản đồ, thử tài được, vẫn không có thẻ và tính thưởng nhanh', () => {
  const { db, game, teams: [a, b] } = setupCompact({ duel: true })
  const city = cityId(db)
  const r = answerRight(game, db, a.id, askAt(game, db, a.id, city))
  assert.equal(r.card, null)
  assert.equal(r.speedBonus, points(db, city))
  assert.equal(db.prepare('SELECT team_id FROM ownership WHERE province_id = ?').get(city).team_id, a.id)
  placeTeam(db, b.id, city)
  assert.equal(game.retry(b.id).status, 'owned') // tỉnh có chủ → mời thử tài, không phải câu thường
  assert.equal(game.siege(b.id).status, 'siege-bet')
})

test('Team gọn: chủ phòng tung thẻ cho mọi team — đúng loại, đúng số, khay tối đa 3, nhật ký team có ghi', () => {
  const { db, game, teams } = setupCompact({ teamCount: 3 })
  const [a, b, c] = teams
  db.prepare("INSERT INTO cards (team_id, kind) VALUES (?, 'march'), (?, 'march')").run(b.id, b.id) // b còn 1 chỗ
  for (let i = 0; i < RULES.maxCards; i++) db.prepare("INSERT INTO cards (team_id, kind) VALUES (?, 'fifty')").run(c.id) // c đã đầy
  assert.deepEqual(game.giveCards('time', 2), { teams: 2, cards: 3 })
  const kinds = id => game.teamView(id).cards.map(x => x.kind).sort()
  assert.deepEqual(kinds(a.id), ['time', 'time'])
  assert.deepEqual(kinds(b.id), ['march', 'march', 'time'])
  assert.equal(kinds(c.id).length, RULES.maxCards)
  assert.deepEqual(game.teamView(a.id).log.find(e => e.action === 'gift').kinds, ['time', 'time'])
  // Thẻ được tung dùng được như thẻ thường
  const q = askAt(game, db, a.id, cityId(db))
  assert.ok(q)
  const card = game.teamView(a.id).cards[0]
  assert.equal(game.useCard(a.id, card.id, '').kind, 'time')
})

test('Team gọn: tung thẻ ngẫu nhiên; không đấu không có Hàng rào; kiểm tra loại / số / trạng thái / kiểu phòng', () => {
  const { game, teams: [a] } = setupCompact()
  assert.deepEqual(game.giveCards('random', 3), { teams: 2, cards: 6 })
  assert.ok(game.teamView(a.id).cards.every(x => x.kind !== 'shield'))
  assert.throws(() => game.giveCards('shield', 1), { code: 'bad-card' })
  assert.throws(() => game.giveCards('bogus', 1), { code: 'bad-card' })
  const fresh = setupCompact()
  for (const n of [0, 4, 1.5, NaN]) assert.throws(() => fresh.game.giveCards('scout', n), { code: 'bad-count' })
  // Bật Đấu: có Hàng rào
  const duel = setupCompact({ duel: true })
  assert.deepEqual(duel.game.giveCards('shield', 1), { teams: 2, cards: 1 * 2 })
  // Chưa bắt đầu / phòng team thường: không tung được
  const waiting = setupGame({ mode: 'compact', teamCount: 2, start: false })
  assert.throws(() => waiting.game.giveCards('scout', 1), { code: 'not-running' })
  const normal = setupGame({ teamCount: 2 })
  assert.throws(() => normal.game.giveCards('scout', 1), { code: 'not-compact' })
})

test('nâng cấp DB cũ: thêm cột compact / duel còn thiếu, giữ dữ liệu', () => {
  const db = memoryDb()
  db.exec('ALTER TABLE rooms DROP COLUMN duel')
  db.exec('ALTER TABLE rooms DROP COLUMN compact')
  upgradeDatabase(db)
  const cols = db.prepare('PRAGMA table_info(rooms)').all().map(c => c.name)
  assert.ok(cols.includes('compact') && cols.includes('duel'))
  upgradeDatabase(db) // chạy lại không lỗi
})

test('nghỉ chân (mọi kiểu phòng, chốt 4/11): sai 15 giây, Mạo hiểm sai tổng 25 giây; bỏ qua nghỉ tối đa 15 giây', () => {
  const { db, now, game, teams: [a] } = setupCompact({ betChoice: true })
  const [p1, p2, p3] = allIds(db).filter(id => !game.teamView(a.id).mine.some(m => m.province === id))
  placeTeam(db, a.id, p1)
  game.retry(a.id)
  const q1 = game.chooseTopic(a.id, 'random', null, false).question
  assert.equal(game.answer(a.id, q1.id, wrongAnswer(db, a.id)).lockedUntil - now(), 15_000)
  now.advance(15_000)
  placeTeam(db, a.id, p2)
  game.retry(a.id)
  const q2 = game.chooseTopic(a.id, 'random', null, true).question
  assert.equal(game.answer(a.id, q2.id, wrongAnswer(db, a.id)).lockedUntil - now(), 25_000)
  now.advance(25_000)
  placeTeam(db, a.id, p3)
  game.retry(a.id)
  game.chooseTopic(a.id, 'random', null, false)
  now.advance(20_000)
  assert.equal(game.skip(a.id).lockedUntil - now(), 15_000)
})

test('trượt ở một tỉnh (sai / hết giờ / bỏ qua sau khi xem câu): điểm tỉnh với team giảm 25% mỗi lần, thấp nhất 25%', () => {
  const { db, now, game, teams: [a] } = setupGame({ teamCount: 2 })
  db.exec('DELETE FROM ownership')
  const id = 'lang-son'
  const full = points(db, id)
  const miss = how => {
    const q = askAt(game, db, a.id, id)
    if (how === 'wrong') game.answer(a.id, q.id, wrongAnswer(db, a.id))
    else if (how === 'skip') game.skip(a.id)
    else { now.advance(RULES.answerLimitMs.normal + RULES.answerNetworkGraceMs + 1); game.expireTeam(a.id) }
    now.advance(60_000)
  }
  miss('wrong')
  assert.equal(askAt(game, db, a.id, id).worth, full * 0.75)
  game.skip(a.id)
  now.advance(60_000)
  miss('timeout')
  assert.equal(askAt(game, db, a.id, id).worth, full * 0.25)
  game.skip(a.id)
  now.advance(60_000)
  const q = askAt(game, db, a.id, id) // 4 lần trượt → vẫn còn 25%
  assert.equal(q.worth, full * 0.25)
  const r = answerRight(game, db, a.id, q)
  assert.deepEqual([r.worth, r.missPenalty], [full * 0.25, full * 0.75])
  const s = game.scores().find(x => x.teamId === a.id)
  assert.equal(s.bonus, -full * 0.75 + r.speedBonus) // điểm tỉnh trên bảng điểm cộng đủ, phần trừ nằm ở điểm thưởng (Siêu tốc tính trên 25%)
})

test('trượt: bỏ qua lúc chọn chủ đề (chưa thấy câu) không tính; cắm cờ xong đếm lại từ đầu', () => {
  const { db, now, game, teams: [a] } = setupCompact({ betChoice: true })
  const id = allIds(db).find(x => !game.teamView(a.id).mine.some(m => m.province === x))
  placeTeam(db, a.id, id)
  assert.equal(game.retry(a.id).status, 'choose')
  game.skip(a.id) // chưa xem câu
  now.advance(60_000)
  placeTeam(db, a.id, id)
  const c = game.retry(a.id)
  assert.equal(c.worth, points(db, id))
  const q = game.chooseTopic(a.id, 'random', null, false).question
  assert.equal(q.worth, points(db, id))
})
