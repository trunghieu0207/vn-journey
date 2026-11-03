// Kết nối SQLite (node:sqlite built-in), tạo schema và nạp dữ liệu tĩnh.

import { readFileSync, chmodSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function openDatabase(path) {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `)
  return db
}

// Chạy fn trong transaction; lỗi thì rollback và ném lại.
// Server chạy 1 process và node:sqlite là API đồng bộ nên các transaction không xen kẽ nhau;
// BEGIN IMMEDIATE là lớp an toàn thêm.
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

const readJson = name => JSON.parse(readFileSync(join(ROOT, 'data', name), 'utf8'))

// Tạo bảng và nạp dữ liệu tĩnh (tỉnh, giáp ranh, bộ sưu tập, câu hỏi) vào DB rỗng.
export function seedDatabase(db) {
  const { provinces, collections } = readJson('provinces.json')
  const { questions, topics } = readJson('questions.json')
  const geo = readJson('map-geo.json')
  const geoById = new Map(geo.provinces.map(g => [g.id, g]))

  db.exec(readFileSync(join(ROOT, 'db', 'schema.sql'), 'utf8'))

  const insertProvince = db.prepare(`
    INSERT INTO provinces (id, code, name, short_name, full_name, region, merged_from, admin_center_at,
                           is_city, is_capital, points, label_x, label_y)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const insertAdjacency = db.prepare('INSERT INTO adjacency (province_id, neighbor_id) VALUES (?, ?)')
  const insertCollection = db.prepare('INSERT INTO collections (id, name, description, need, bonus) VALUES (?, ?, ?, ?, ?)')
  const insertMember = db.prepare('INSERT INTO collection_members (collection_id, province_id) VALUES (?, ?)')
  const insertQuestion = db.prepare(`
    INSERT INTO questions (id, province_id, difficulty, level, topic, kind, content, options, answer, explanation, sources, status, hidden)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

  transaction(db, () => {
    for (const p of provinces) {
      const g = geoById.get(p.id)
      if (!g) throw new Error(`Tỉnh ${p.id} không có trong map-geo.json`)
      insertProvince.run(p.id, p.code, p.name, p.short ?? null, p.fullName, p.region, JSON.stringify(p.mergedFrom),
        p.adminCenterAt, p.isCity ? 1 : 0, p.isCapital ? 1 : 0, p.points, g.label[0], g.label[1])
    }
    // Lưu cả hai chiều để truy vấn "tỉnh giáp ranh của X" chỉ cần một điều kiện
    for (const [a, b] of geo.adjacency) {
      insertAdjacency.run(a, b)
      insertAdjacency.run(b, a)
    }
    for (const c of collections) {
      insertCollection.run(c.id, c.name, c.description, c.need, c.bonus)
      for (const m of c.members) insertMember.run(c.id, m)
    }
    for (const [id, name] of Object.entries(topics)) {
      db.prepare('INSERT INTO topics (id, name) VALUES (?, ?)').run(id, name)
    }
    for (const q of questions) {
      insertQuestion.run(q.id, q.province, q.difficulty, q.level, q.topic, q.kind, q.content,
        q.options ? JSON.stringify(q.options) : null, JSON.stringify(q.answer), q.explanation ?? null, q.sources ? JSON.stringify(q.sources) : null,
        q.status ?? 'new', q.hidden ? 1 : 0) // status / hidden: có khi file được xuất từ trang quản trị
    }
  })
}

// Nâng cấp DB đã có (tạo trước khi thêm cột): thêm cột còn thiếu, giữ nguyên dữ liệu — không phải db:reset
// (db:reset xóa cả tài khoản quản trị, bảng xếp hạng, câu hỏi đã sửa). Cột mới thêm vào schema.sql thì khai báo thêm ở đây
const ADDED_COLUMNS = [
  ['rooms', 'compact', 'INTEGER NOT NULL DEFAULT 0'],
  ['rooms', 'duel', 'INTEGER NOT NULL DEFAULT 1'],
]
export function upgradeDatabase(db) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column)
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}

// Sao lưu nhất quán khi đang chạy (không cần dừng game)
export function backupDatabase(db, targetPath) {
  db.prepare('VACUUM INTO ?').run(targetPath)
  chmodSync(targetPath, 0o600) // như game.db: chỉ user chạy server đọc được
}
