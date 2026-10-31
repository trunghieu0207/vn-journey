// Dọn phòng bị bỏ / treo (server/housekeeping.js): phòng chờ bỏ trống, chủ phòng có sẵn vắng mặt, tự bắt đầu phòng có sẵn.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCore, fakeClock, memoryDb } from './helpers.js'
import { createHousekeeping } from '../server/housekeeping.js'
import { RULES } from '../server/game.js'

// Giả lập "ai đang mở trang": tập người chơi online + số kết nối theo phòng
function fakeHub(db) {
  const online = new Set()
  const extra = new Map() // roomId → số kết nối không phải người chơi (chủ phòng, màn chiếu)
  return {
    online, extra,
    isOnline: id => online.has(id),
    roomOnline: roomId => (extra.get(roomId) ?? 0)
      + db.prepare('SELECT id FROM players WHERE room_id = ?').all(roomId).filter(p => online.has(p.id)).length,
  }
}

function setup({ keep = () => false } = {}) {
  const db = memoryDb()
  const now = fakeClock()
  const core = createCore(db, now)
  const hub = fakeHub(db)
  const hk = createHousekeeping({ db, game: core, hub, now, keepRoom: keep })
  return { db, now, core, hub, hk }
}
const roomExists = (db, id) => !!db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(id)

test('phòng chờ không ai mở trang 30 phút thì bị xóa; có người mở trang thì giữ; phòng quản trị tạo hộ thì giữ', () => {
  const kept = new Set()
  const { db, now, core, hub, hk } = setup({ keep: id => kept.has(id) })
  const idle = core.createRoom({ name: 'Bỏ trống', teamCount: 2 }).roomId
  const busy = core.createRoom({ name: 'Có người', teamCount: 2 }).roomId
  const admin = core.createRoom({ name: 'Quản trị tạo', teamCount: 2 }).roomId
  kept.add(admin)
  hk.tick()
  now.advance(RULES.idleRoomMs - 60_000)
  hub.extra.set(busy, 1) // chủ phòng mở trang chủ phòng
  hk.tick()
  hub.extra.delete(busy)
  now.advance(60_000)
  const changed = hk.tick()
  assert.equal(roomExists(db, idle), false)
  assert.ok(changed.has(idle))
  assert.equal(roomExists(db, busy), true) // vừa có người cách đây 1 phút
  assert.equal(roomExists(db, admin), true)
  now.advance(RULES.idleRoomMs)
  hk.tick()
  assert.equal(roomExists(db, busy), false)
})

test('phòng đang chơi không bị dọn dù không ai mở trang (tự kết thúc khi hết giờ)', () => {
  const { db, now, core, hk } = setup()
  const id = core.createRoom({ name: 'Đang chơi', teamCount: 2 }).roomId
  core.room(id).start()
  now.advance(RULES.idleRoomMs * 2)
  hk.tick()
  assert.equal(roomExists(db, id), true)
})

test('phòng có sẵn: trống thì giữ nguyên; có người vào rồi bỏ đó 30 phút thì làm mới', () => {
  const { db, now, core, hk } = setup()
  core.ensurePresetRooms()
  const [a, b] = db.prepare('SELECT id, code FROM rooms WHERE preset IS NOT NULL ORDER BY id').all()
  core.joinRoom(b.code, 'Lan')
  hk.tick()
  now.advance(RULES.idleRoomMs)
  hk.tick()
  assert.equal(roomExists(db, a.id), true)
  assert.equal(roomExists(db, b.id), false)
  core.ensurePresetRooms() // vòng dọn sau tạo lại phòng đó với mã mới
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rooms WHERE preset IS NOT NULL').get().n, RULES.presetRooms.length)
})

test('phòng có sẵn: chủ phòng đóng trang quá 2 phút → quyền chủ phòng chuyển cho người đang mở trang vào sớm nhất', () => {
  const { db, now, core, hub, hk } = setup()
  core.ensurePresetRooms()
  const room = db.prepare('SELECT id, code FROM rooms WHERE preset IS NOT NULL ORDER BY id').get()
  const lan = core.joinRoom(room.code, 'Lan')
  const minh = core.joinRoom(room.code, 'Minh')
  const an = core.joinRoom(room.code, 'An')
  assert.equal(lan.host, true)
  const host = () => db.prepare('SELECT host_player_id AS h FROM rooms WHERE id = ?').get(room.id).h
  hub.online.add(an.playerId) // Lan (chủ phòng) và Minh đã đóng trang, chỉ An còn mở
  hk.tick()
  now.advance(RULES.hostAwayMs - 1000)
  hk.tick()
  assert.equal(host(), lan.playerId) // chưa đủ 2 phút
  now.advance(1000)
  const changed = hk.tick()
  assert.equal(host(), an.playerId)
  assert.ok(changed.has(room.id))
  void minh
  // Không ai mở trang: giữ nguyên chủ phòng (không có ai để chuyển)
  hub.online.clear()
  now.advance(RULES.hostAwayMs * 2)
  hk.tick()
  assert.equal(host(), an.playerId)
})

test('phòng có sẵn: từ 2 người đang mở trang, chủ phòng chưa bấm Bắt đầu sau 3 phút → tự bắt đầu', () => {
  const { db, now, core, hub, hk } = setup()
  core.ensurePresetRooms()
  const room = db.prepare('SELECT id, code FROM rooms WHERE preset IS NOT NULL ORDER BY id').get()
  const lan = core.joinRoom(room.code, 'Lan')
  hub.online.add(lan.playerId)
  hk.tick()
  assert.equal(hk.autoStartAt(room.id), null) // mới 1 người
  const minh = core.joinRoom(room.code, 'Minh')
  hub.online.add(minh.playerId)
  hk.tick()
  assert.equal(hk.autoStartAt(room.id), now() + RULES.autoStartMs)
  // Một người đóng trang → hủy đếm ngược; mở lại → đếm lại từ đầu
  hub.online.delete(minh.playerId)
  hk.tick()
  assert.equal(hk.autoStartAt(room.id), null)
  hub.online.add(minh.playerId)
  hk.tick()
  now.advance(RULES.autoStartMs)
  hk.tick()
  assert.equal(core.room(room.id).state().status, 'running')
  assert.equal(hk.autoStartAt(room.id), null)
})

test('phòng tự tạo không tự bắt đầu, không chuyển chủ phòng', () => {
  const { db, now, core, hub, hk } = setup()
  const r = core.createRoom({ name: 'Tự tạo', mode: 'solo' })
  for (const n of ['Lan', 'Minh', 'An']) hub.online.add(core.joinRoom(r.code, n).playerId)
  hk.tick()
  now.advance(RULES.autoStartMs * 2)
  hk.tick()
  assert.equal(core.room(r.roomId).state().status, 'waiting')
  assert.equal(hk.autoStartAt(r.roomId), null)
  void db
})

test('mỗi trình duyệt giữ tối đa 3 phòng chưa kết thúc', () => {
  const { core, hk } = setup()
  const ids = []
  for (let i = 0; i < RULES.maxRoomsPerCreator; i++) {
    assert.equal(hk.canCreate('may-a'), true)
    const id = core.createRoom({ name: `P${i}`, teamCount: 2 }).roomId
    hk.noteCreated('may-a', id)
    ids.push(id)
  }
  assert.equal(hk.canCreate('may-a'), false)
  assert.equal(hk.canCreate('may-b'), true) // trình duyệt khác không bị ảnh hưởng
  core.room(ids[0]).start()
  core.room(ids[0]).end()
  assert.equal(hk.canCreate('may-a'), true) // kết thúc một phòng thì tạo tiếp được
})
