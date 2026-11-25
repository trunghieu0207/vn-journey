// Dọn phòng bị bỏ / treo (server/housekeeping.js): phòng chờ bỏ trống, giới hạn phòng mỗi trình duyệt.

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

test('phòng vừa tạo trên server đã chạy lâu không bị xóa ngay (tính từ lúc tạo phòng)', () => {
  const { db, now, core, hk } = setup()
  hk.tick()
  now.advance(RULES.idleRoomMs * 3) // server đã chạy 90 phút
  const id = core.createRoom({ name: 'Mới tạo', teamCount: 2 }).roomId
  hk.tick()
  assert.equal(roomExists(db, id), true)
  now.advance(RULES.idleRoomMs - 1000)
  hk.tick()
  assert.equal(roomExists(db, id), true)
  now.advance(1000) // đủ 30 phút từ lúc tạo mà không ai mở trang
  hk.tick()
  assert.equal(roomExists(db, id), false)
})

test('phòng đang chơi không bị dọn dù không ai mở trang (tự kết thúc khi hết giờ)', () => {
  const { db, now, core, hk } = setup()
  const id = core.createRoom({ name: 'Đang chơi', teamCount: 2 }).roomId
  core.room(id).start()
  now.advance(RULES.idleRoomMs * 2)
  hk.tick()
  assert.equal(roomExists(db, id), true)
})

test('phòng chờ đủ người không tự bắt đầu, không chuyển chủ phòng (chỉ chủ phòng bấm Bắt đầu)', () => {
  const { now, core, hub, hk } = setup()
  const r = core.createRoom({ name: 'Tự tạo', mode: 'solo' })
  for (const n of ['Lan', 'Minh', 'An']) hub.online.add(core.joinRoom(r.code, n).playerId)
  hk.tick()
  now.advance(10 * 60_000)
  hk.tick()
  assert.equal(core.room(r.roomId).state().status, 'waiting')
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
