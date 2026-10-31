// Công cụ dùng chung cho test: DB trong bộ nhớ, đồng hồ giả, số ngẫu nhiên có hạt giống.

import { openDatabase, seedDatabase } from '../server/db.js'
import { createGame } from '../server/game.js'
import { hashSecret } from '../server/auth.js'
import { RULES } from '../server/game/rules.js'

export function memoryDb() {
  const db = openDatabase(':memory:')
  seedDatabase(db)
  return db
}

export function fakeClock(start = 1_800_000_000_000) {
  let t = start
  const now = () => t
  now.advance = ms => { t += ms }
  return now
}

export function seededRandom(seed = 42) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

let codeCounter = 0
const testCode = n => String(++codeCounter).padStart(n, 'A').slice(-n)

// questionLeadMs mặc định 0 trong test: giờ câu hỏi tính đúng từ lúc phát (test riêng kiểm tra mốc thật RULES.questionLeadMs)
export function createCore(db = memoryDb(), now = fakeClock(), { questionLeadMs = 0 } = {}) {
  return createGame(db, {
    now, random: seededRandom(), freezeBeforeEndMin: 10, defaultDurationMin: 45, questionLeadMs,
    newCode: testCode, hashSecret,
  })
}

// Bắt đầu trận và cho đồng hồ chạy qua đếm ngược 3·2·1 (trước đó người chơi chưa thao tác được)
export function startNow(game, now) {
  game.start()
  now.advance(RULES.startCountdownMs)
}

// Tạo một phòng có `teamCount` team (tên theo linh vật: Team Rồng, Team Lân, Team Rùa…)
export function setupGame({ teamCount = 3, start = true, questionLeadMs = 0, ...roomOpts } = {}) {
  const db = memoryDb()
  const now = fakeClock()
  const core = createCore(db, now, { questionLeadMs })
  const created = core.createRoom({ name: 'Phòng test', teamCount, ...roomOpts })
  const game = core.room(created.roomId)
  if (start) startNow(game, now)
  const teams = db.prepare('SELECT id, name FROM teams WHERE room_id = ? ORDER BY id').all(created.roomId)
  return { db, now, core, game, teams, room: created }
}

// Đặt vị trí team trực tiếp (dựng tình huống test)
export function placeTeam(db, teamId, provinceId, { owned = false } = {}) {
  db.prepare('UPDATE teams SET current_province = ?, previous_province = NULL WHERE id = ?').run(provinceId, teamId)
  if (owned) {
    db.prepare(`INSERT INTO ownership (room_id, province_id, team_id, captured_at)
                VALUES ((SELECT room_id FROM teams WHERE id = ?), ?, ?, 0)
                ON CONFLICT(room_id, province_id) DO UPDATE SET team_id = excluded.team_id`).run(teamId, provinceId, teamId)
  }
}

export function clearOwnership(db) {
  db.exec('DELETE FROM ownership')
}

// Tìm đáp án đúng theo thứ tự đã xáo (đọc từ DB — client không thể làm điều này)
export function correctAnswer(db, teamId) {
  const t = db.prepare('SELECT pending_question, pending_order FROM teams WHERE id = ?').get(teamId)
  const q = db.prepare('SELECT kind, answer FROM questions WHERE id = ?').get(t.pending_question)
  const expected = JSON.parse(q.answer)
  if (q.kind === 'choice') return JSON.parse(t.pending_order).indexOf(expected)
  if (q.kind === 'truefalse') return expected
  return expected[0]
}

export function wrongAnswer(db, teamId) {
  const t = db.prepare('SELECT pending_question, pending_order FROM teams WHERE id = ?').get(teamId)
  const q = db.prepare('SELECT kind, answer FROM questions WHERE id = ?').get(t.pending_question)
  const expected = JSON.parse(q.answer)
  if (q.kind === 'choice') return JSON.parse(t.pending_order).findIndex(i => i !== expected)
  if (q.kind === 'truefalse') return !expected
  return 'chắc chắn sai'
}

// Thử tài: bấm Thử tài rồi hai đội cùng cược `rounds` hiệp → vào đấu ngay (không chờ hết hạn cược).
// Trả về { question (câu hiệp 1 của đội công thành), duelId, defenderId }
export function siegeNow(game, db, attackerId, rounds = 1) {
  const { duelId } = game.siege(attackerId)
  const defenderId = db.prepare('SELECT defender_id FROM duels WHERE id = ?').get(duelId).defender_id
  game.betSiege(attackerId, duelId, rounds)
  game.betSiege(defenderId, duelId, rounds)
  return { question: game.teamView(attackerId).pendingQuestion, duelId, defenderId }
}
