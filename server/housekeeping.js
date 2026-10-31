// Dọn phòng bị bỏ / treo (chốt 31/10). Chạy theo nhịp tick của server, chỉ dựa vào ai đang mở trang (kết nối realtime) —
// số liệu giữ trong bộ nhớ: khởi động lại server thì mọi phòng được tính lại từ đầu (không ai bị xóa oan ngay sau khi restart).
//  1. Phòng tự tạo chưa bắt đầu, không ai mở trang (kể cả chủ phòng) liên tục RULES.idleRoomMs → xóa.
//     Phòng có sẵn có người vào rồi bỏ đó → làm mới (xóa, vòng dọn sau tạo lại mã mới). Phòng quản trị tạo hộ thì giữ.
//  2. Phòng có sẵn: chủ phòng đóng trang quá RULES.hostAwayMs → quyền chủ phòng chuyển cho người đang mở trang vào sớm nhất.
//  3. Phòng có sẵn đang chờ, từ 2 người đang mở trang trở lên mà chủ phòng chưa bấm Bắt đầu sau RULES.autoStartMs → tự bắt đầu.
//  4. Mỗi trình duyệt giữ tối đa RULES.maxRoomsPerCreator phòng chưa kết thúc do mình tạo (cookie vnj_creator).

import { RULES } from './game.js'

export function createHousekeeping({ db, game, hub, now = Date.now, keepRoom = () => false }) {
  const startedAt = now()
  const lastSeen = new Map()   // roomId → lần cuối có người mở trang
  const hostAway = new Map()   // roomId → lúc chủ phòng (phòng có sẵn) bắt đầu vắng
  const readySince = new Map() // roomId → lúc phòng có sẵn bắt đầu có ≥ 2 người đang mở trang
  const creators = new Map()   // khóa trình duyệt → Set(roomId) đã tạo

  const rooms = () => db.prepare(`SELECT r.id, r.status, r.preset, r.host_player_id, (SELECT COUNT(*) FROM players p WHERE p.room_id = r.id) AS players
                                  FROM rooms r WHERE r.status != 'ended'`).all()
  const onlinePlayers = roomId => db.prepare('SELECT id FROM players WHERE room_id = ? ORDER BY id').all(roomId).filter(p => hub.isOnline(p.id))

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
        const seen = Math.max(lastSeen.get(r.id) ?? 0, startedAt)
        const idle = t - seen >= RULES.idleRoomMs
        if (idle && !keepRoom(r.id) && (!r.preset || r.players > 0)) {
          db.prepare('DELETE FROM rooms WHERE id = ?').run(r.id)
          changed.add(r.id)
          continue
        }
      }
      if (!r.preset) continue

      // 2. Chủ phòng có sẵn vắng mặt → chuyển quyền
      const online = onlinePlayers(r.id)
      if (r.host_player_id != null && !online.some(p => p.id === r.host_player_id)) {
        if (!hostAway.has(r.id)) hostAway.set(r.id, t)
        const next = online[0]
        if (next && t - hostAway.get(r.id) >= RULES.hostAwayMs) {
          db.prepare('UPDATE rooms SET host_player_id = ? WHERE id = ?').run(next.id, r.id)
          hostAway.delete(r.id)
          changed.add(r.id)
        }
      } else hostAway.delete(r.id)

      // 3. Tự bắt đầu phòng có sẵn
      if (r.status === 'waiting' && online.length >= 2) {
        if (!readySince.has(r.id)) {
          readySince.set(r.id, t)
          changed.add(r.id) // mọi máy hiện đồng hồ "tự bắt đầu sau…"
        }
        if (t - readySince.get(r.id) >= RULES.autoStartMs) {
          try { game.room(r.id).start() } catch {} // vừa có người bấm Bắt đầu cùng lúc
          readySince.delete(r.id)
          changed.add(r.id)
        }
      } else if (readySince.delete(r.id)) changed.add(r.id)
    }
    for (const map of [lastSeen, hostAway, readySince]) for (const id of map.keys()) if (!alive.has(id)) map.delete(id)
    return changed
  }

  // Mốc tự bắt đầu (để màn chờ hiện đếm ngược), null nếu không có
  const autoStartAt = roomId => (readySince.has(roomId) ? readySince.get(roomId) + RULES.autoStartMs : null)

  // ---------- 4. Giới hạn phòng mỗi trình duyệt ----------
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

  return { tick, autoStartAt, canCreate, noteCreated }
}
