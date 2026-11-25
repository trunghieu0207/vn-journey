// Dọn phòng bị bỏ / treo (chốt 31/10). Chạy theo nhịp tick của server, chỉ dựa vào ai đang mở trang (kết nối realtime) —
// số liệu giữ trong bộ nhớ: khởi động lại server thì mọi phòng được tính lại từ đầu (không ai bị xóa oan ngay sau khi restart).
//  1. Phòng chưa bắt đầu, không ai mở trang (kể cả chủ phòng) liên tục RULES.idleRoomMs → xóa. Phòng quản trị tạo hộ thì giữ.
//  2. Mỗi trình duyệt giữ tối đa RULES.maxRoomsPerCreator phòng chưa kết thúc do mình tạo (cookie vnj_creator).

import { RULES } from './game.js'

export function createHousekeeping({ db, game, hub, now = Date.now, keepRoom = () => false }) {
  const startedAt = now()
  const lastSeen = new Map()   // roomId → lần cuối có người mở trang
  const creators = new Map()   // khóa trình duyệt → Set(roomId) đã tạo

  const rooms = () => db.prepare(`SELECT r.id, r.status, r.created_at
                                  FROM rooms r WHERE r.status != 'ended'`).all()

  // Trả về các phòng có thay đổi (cần đẩy realtime) — app.js gọi mỗi giây
  function tick() {
    const t = now()
    const changed = new Set()
    const alive = new Set()
    for (const r of rooms()) {
      alive.add(r.id)
      if (hub.roomOnline(r.id) > 0) lastSeen.set(r.id, t)

      // 1. Phòng chờ bị bỏ
      if (r.status === 'waiting') {
        // Mốc "còn người" gần nhất: lần cuối có người mở trang, lúc server khởi động, hoặc lúc tạo phòng
        // (thiếu created_at thì phòng vừa tạo trên server đã chạy > 30 phút bị xóa ngay — lỗi 31/10)
        const seen = Math.max(lastSeen.get(r.id) ?? 0, startedAt, r.created_at)
        const idle = t - seen >= RULES.idleRoomMs
        if (idle && !keepRoom(r.id)) {
          db.prepare('DELETE FROM rooms WHERE id = ?').run(r.id)
          changed.add(r.id)
        }
      }
    }
    for (const id of lastSeen.keys()) if (!alive.has(id)) lastSeen.delete(id)
    return changed
  }

  // ---------- 2. Giới hạn phòng mỗi trình duyệt ----------
  function openRoomsOf(key) {
    const ids = creators.get(key)
    if (!ids) return 0
    const open = new Set(db.prepare("SELECT id FROM rooms WHERE status != 'ended'").all().map(r => r.id))
    for (const id of ids) if (!open.has(id)) ids.delete(id)
    return ids.size
  }
  const canCreate = key => !key || openRoomsOf(key) < RULES.maxRoomsPerCreator
  function noteCreated(key, roomId) {
    if (!key) return
    if (!creators.has(key)) creators.set(key, new Set())
    creators.get(key).add(roomId)
  }

  return { tick, canCreate, noteCreated }
}
