// Dữ liệu tĩnh đọc một lần (tỉnh, giáp ranh, bộ sưu tập, chủ đề) và các câu lệnh SQL dùng chung.

import { RULES } from './rules.js'

export function loadData(db, now) {
  // ---------- Dữ liệu tĩnh (đọc một lần) ----------
  const provinces = new Map(db.prepare('SELECT * FROM provinces').all().map(p => [p.id, p]))
  const adjacency = new Map([...provinces.keys()].map(id => [id, new Set()]))
  for (const { province_id, neighbor_id } of db.prepare('SELECT * FROM adjacency').all()) {
    adjacency.get(province_id).add(neighbor_id)
  }
  const collections = db.prepare('SELECT * FROM collections').all().map(c => ({
    ...c,
    members: new Set(db.prepare('SELECT province_id FROM collection_members WHERE collection_id = ?')
      .all(c.id).map(r => r.province_id)),
  }))

  const json = v => (v == null ? null : JSON.parse(v))
  const topicNames = new Map(db.prepare('SELECT id, name FROM topics').all().map(t => [t.id, t.name]))

  // Kho câu cho sảnh chờ "Bạn có biết?" theo miền (dễ / vừa, có lời giải, chủ đề văn hóa — đời sống)
  const factPool = Object.fromEntries(['north', 'central', 'south'].map(r => [r, db.prepare(`
    SELECT q.id FROM questions q JOIN provinces p ON p.id = q.province_id
    WHERE p.region = ? AND q.difficulty = 'normal' AND q.hidden = 0 AND q.level <= 2 AND q.explanation IS NOT NULL
      AND q.topic IN (${RULES.factTopics.map(() => '?').join(', ')}) ORDER BY q.id`).all(r, ...RULES.factTopics).map(x => x.id)]))

  // ---------- Câu lệnh SQL dùng chung ----------
  const q = {
    room: db.prepare('SELECT * FROM rooms WHERE id = ?'),
    roomByCode: db.prepare('SELECT * FROM rooms WHERE code = ?'),
    team: db.prepare('SELECT * FROM teams WHERE id = ? AND room_id = ?'),
    teams: db.prepare('SELECT * FROM teams WHERE room_id = ? ORDER BY id'),
    players: db.prepare('SELECT id, team_id, name, home FROM players WHERE room_id = ? ORDER BY id'),
    owner: db.prepare('SELECT * FROM ownership WHERE room_id = ? AND province_id = ?'),
    owners: db.prepare('SELECT * FROM ownership WHERE room_id = ?'),
    question: db.prepare('SELECT * FROM questions WHERE id = ?'),
    candidates: db.prepare(`
      SELECT id FROM questions
      WHERE province_id = ? AND difficulty = ? AND hidden = 0
        AND id NOT IN (SELECT question_id FROM answered WHERE team_id = ?)`),
    anyCandidates: db.prepare('SELECT id FROM questions WHERE province_id = ? AND difficulty = ? AND hidden = 0'), // câu bị quản trị ẩn không phát nữa
    // Số lần câu đã ra trong phòng (đã trả lời / bỏ qua / đang chờ, mọi team) — để các team trong phòng nhận câu khác nhau
    roomUses: db.prepare(`SELECT (SELECT COUNT(*) FROM answered a JOIN teams t ON t.id = a.team_id WHERE t.room_id = ? AND a.question_id = ?)
                               + (SELECT COUNT(*) FROM teams WHERE room_id = ? AND pending_question = ?) AS n`),
    visits: db.prepare('SELECT province_id FROM visits WHERE team_id = ?'),
    addVisit: db.prepare('INSERT OR IGNORE INTO visits (team_id, province_id) VALUES (?, ?)'),
    cards: db.prepare('SELECT * FROM cards WHERE team_id = ? AND used_at IS NULL ORDER BY id'),
    card: db.prepare('SELECT * FROM cards WHERE id = ? AND team_id = ?'),
    // Đấu tay đôi đang diễn ra: của đội công thành / các lượt phòng thủ đội giữ tỉnh chưa trả lời
    duelOf: db.prepare('SELECT * FROM duels WHERE attacker_id = ? AND resolved_at IS NULL'),
    duel: db.prepare('SELECT * FROM duels WHERE id = ?'),
    // (đội công thành đã thua — attacker-fail — đội giữ tỉnh vẫn trả lời tiếp được tới hết giờ để lấy +50; bỏ lúc đang cược thì không còn gì để trả lời)
    defenses: db.prepare(`SELECT * FROM duels WHERE defender_id = ? AND defender_answer IS NULL
                          AND (resolved_at IS NULL OR (result = 'attacker-fail' AND phase = 'play')) ORDER BY id`),
    // Phòng đơn: tem
    stamps: db.prepare('SELECT * FROM stamps WHERE team_id = ? ORDER BY at'),
    stamp: db.prepare('SELECT * FROM stamps WHERE team_id = ? AND province_id = ?'),
    roomStamps: db.prepare('SELECT * FROM stamps WHERE room_id = ?'),
    stampCounts: db.prepare('SELECT province_id, COUNT(*) AS n FROM stamps WHERE room_id = ? GROUP BY province_id'),
    addStamp: db.prepare('INSERT OR IGNORE INTO stamps (room_id, team_id, province_id, first, question_id, at) VALUES (?, ?, ?, ?, ?, ?)'),
    log: db.prepare(`INSERT INTO events_log (room_id, team_id, player_name, action, province_id, detail, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`),
  }

  // extraMs: giờ cộng thêm bởi thẻ Thêm giờ
  const timedOut = (difficulty, issuedAt, extraMs = 0) =>
    now() - issuedAt > RULES.answerLimitMs[difficulty] + extraMs + RULES.answerNetworkGraceMs

  return { provinces, adjacency, collections, json, topicNames, q, timedOut, factPool }
}
