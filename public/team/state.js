// Màn team: hằng số, trạng thái dùng chung và các phép kiểm tra suy ra từ trạng thái (đang chơi, bị khóa, đi được tỉnh nào…).

import { serverClock } from '/shared/api.js'

export const CARD_INFO = {
  scout: { icon: 'scout', name: 'Ống nhòm', hint: 'Nhìn xuyên sương mù 1 miền trong 10 giây (thấy tỉnh nào có chủ, không biết đội nào)' },
  shield: { icon: 'shield', name: 'Hàng rào', hint: 'Dựng hàng rào quanh 1 tỉnh của mình trong 5 phút, không đội nào ghé thử tài được' },
  march: { icon: 'march', name: 'Xe tốc hành', hint: 'Lượt di chuyển kế tiếp được đi xa 2 tỉnh' },
  // Thẻ trợ giúp: dùng ngay trong khung câu hỏi (nhận khi chiếm thành phố hoặc đúng 3 câu liên tiếp)
  fifty: { icon: 'fifty', name: '50:50', hint: 'Bỏ 2 đáp án sai của câu trắc nghiệm đang trả lời', help: true },
  time: { icon: 'time', name: 'Thêm giờ', hint: 'Câu đang trả lời được thêm 15 giây (cả thời gian được đủ điểm)', help: true },
}

// Biểu tượng cho từng chủ đề câu hỏi (tên lấy từ server)
export const TOPIC_ICON = { 'am-thuc': 'topic-am-thuc', 'doi-song': 'topic-doi-song', 'van-hoa': 'topic-van-hoa', 'di-san': 'topic-di-san', 'lich-su': 'topic-lich-su', 'dia-ly': 'map', 'sap-nhap': 'topic-sap-nhap' }

export const clock = serverClock()

// Điện thoại / máy tính bảng dọc (css/mobile.css): nút "Chủ phòng" nằm trong menu ≡ thay vì trên thanh trên
const compact = matchMedia('(max-width: 699px), (max-width: 1099px) and (orientation: portrait)')
// Máy chỉ có cảm ứng (không bàn phím / chuột): không nhắc phím tắt
export const touchOnly = () => matchMedia('(hover: none)').matches
export const hostBtnWhere = () => compact.matches ? 'trong menu ≡ góc trên bên phải' : 'nút xanh ở thanh trên'

export const nameOf = id => state.map?.byId.get(id)?.name ?? id
export const now = () => clock.now()

// Trạng thái màn team, dùng chung giữa các module (một object để module nào cũng gán lại được)
export const state = {
  map: null,
  me: null,        // trạng thái mới nhất từ /api/me hoặc SSE
  stream: null,
  busy: false,
  dialogMode: null, // 'question' | 'result' | 'siege' | 'card' | 'results' | 'defense' | 'topic'
  question: null,  // { q } — q có issuedAt, freeUntil, deadline (giờ server)
  scout: null,     // { region, revealed: Set, until }
  notes: [],       // ghi chú chung (bắt đầu, sự kiện…) — nhật ký hành động của team lấy từ server
  lobbyData: null, // phòng đang chọn team (bước 2 khi vào phòng)
  final: null,     // tổng kết sau khi kết thúc: { data, owners: Map tỉnh → team, teams: Map id → team }
  loadingFinal: false,
  moving: false,   // đang bay tới tỉnh vừa bấm: chưa mở câu hỏi cho tới khi camera tới nơi
  focusedId: null, // tỉnh đang được làm nổi (khung câu hỏi neo bên phải)
  answering: false, // đang gửi đáp án: giữ khung câu hỏi tới khi có kết quả (tránh đóng rồi mở lại)
  cardQueue: [],   // thẻ vừa nhận, chờ diễn hiệu ứng lật thẻ khi không còn hộp thoại nào mở
  defense: null,   // lượt phòng thủ đang mở (đội khác công thành tỉnh của mình)
  defending: false, // đang gửi câu trả lời phòng thủ: giữ khung tới khi diễn xong
  defenseSkipped: new Set(), // lượt phòng thủ đã bấm "Bỏ qua" — không mở lại
  holdLock: false,   // đang diễn cảnh công thành bị đẩy lui: tạm chưa hiện màn "Bị khóa"
  siegeChoice: null, // khung "Tỉnh này đã có chủ" đang mở: { id, block } (block: trạng thái chờ lúc tới tỉnh)
  siegeBet: null,    // khung cược số hiệp đang mở: { duelId, province, until, mine, max, role: 'att' | 'def' }
}

// ---------- Tính toán trạng thái ----------
// Phòng chơi đơn: mỗi người một hành trình (tem thay cho cắm cờ)
export const solo = () => state.me?.room.mode === 'solo'
// Máy này đang giữ quyền chủ phòng (người tạo phòng vào chơi luôn / người vào trước ở phòng có sẵn)
export const isHost = () => !!state.me?.hostId && state.me.hostId === state.me.me?.id
export const running = () => state.me?.status === 'running'
export const locked = () => !!(state.me?.lockedUntil && state.me.lockedUntil > now())
export const started = () => running() && now() >= (state.me.startedAt ?? 0) // qua đếm ngược 3·2·1
export const canMove = () => started() && !locked() && !state.me.pendingQuestion && !state.me.choosing
// Server đang chờ team chọn chủ đề / trả lời mà khung không mở (lệch trạng thái) → mở lại thay vì kẹt
export const hasPending = () => running() && !!(state.me.pendingQuestion || state.me.choosing || state.me.siegeBet)
// Mã lỗi nghĩa là "đồng đội đã thao tác trước" (server xử lý lần lượt, người đến sau bị từ chối)
export const TEAMMATE_FIRST = new Set(['pending', 'choosing', 'same-province', 'not-adjacent', 'locked'])
// Người vừa thao tác gần nhất trong team (từ nhật ký server)
export const lastActor = () => state.me.log?.find(e => e.by)?.by ?? 'Đồng đội'
export const stormRegion = () => (state.me.event?.kind === 'storm' && state.me.event.until > now() ? state.me.event.region : null)
export const scoutActive = () => state.scout && state.scout.until > now()

// Tỉnh có thể đi: giáp ranh; có thẻ Hành quân gấp thì xa 2 tỉnh
export function reachable() {
  if (!state.me.current) return new Set()
  const set = new Set(state.me.neighbors)
  if (state.me.marchReady) for (const n of state.me.neighbors) for (const m of state.map.adjacency.get(n)) set.add(m)
  set.delete(state.me.current)
  return set
}
