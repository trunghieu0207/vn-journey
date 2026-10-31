// Chữ cho sự kiện MC tung (Lễ hội / Bão / Câu hỏi vàng) — dùng chung cho trang team, chủ phòng, màn chiếu.
// e: { kind, region, until, bonus? } từ server (activeEvent)

import { REGION_NAME } from './map.js'

// Nhãn ngắn (thanh trạng thái, nhật ký): "Lễ hội Miền Bắc", "Câu hỏi vàng"
export function eventLabel(e) {
  if (e.kind === 'golden') return 'Câu hỏi vàng'
  return `${e.kind === 'festival' ? 'Lễ hội' : 'Bão'} ${REGION_NAME[e.region]}`
}

// Câu đầy đủ (thông báo, nhật ký)
export function eventText(e) {
  return `${eventLabel(e)}! ${eventSub(e)}`
}

function eventSub(e) {
  if (e.kind === 'festival') return `Cắm cờ ở đây được +${e.bonus} điểm`
  if (e.kind === 'storm') return 'Không thể đi vào các tỉnh miền này'
  return 'Câu hỏi lúc này: đúng được ×2 điểm tỉnh, sai nghỉ chân ×2'
}

// Biển treo (fx.hangSign)
export const eventSign = e => ({ kind: e.kind, title: `${eventLabel(e)}!`, sub: eventSub(e) })

// Sự kiện có biển treo + nhãn đếm ngược (Tin đồn chỉ là bản tin)
export const timedEvent = e => !!e && ['festival', 'storm', 'golden'].includes(e.kind)
