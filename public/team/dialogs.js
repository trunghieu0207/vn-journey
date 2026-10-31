// Màn team: mở / đóng hộp thoại; khung câu hỏi neo bên phải để vẫn thấy tỉnh trên bản đồ.

import { $ } from '/shared/dom.js'
import { revealCards } from './cards.js'
import { state } from './state.js'
import { clearIntro } from './siege-fx.js'

// ---------- Hộp thoại ----------
export const dlg = $('dlg')
// Khung câu hỏi / công thành / kết quả neo bên phải để vẫn thấy tỉnh; các khung khác ở giữa màn hình
const DOCKED = new Set(['topic', 'question', 'siege', 'siegebet', 'result', 'defense'])
// Điện thoại (css/mobile.css): khung trượt lên từ đáy, cao tối đa 64% màn → camera đặt tỉnh vào phần trên còn trống
export const phone = matchMedia('(max-width: 699px)')
// Vùng bị khung che, truyền cho map.focusOn: bề rộng khung + lề tính từ mép phải, hoặc chiều cao tính từ mép dưới
export const dockReserve = () => phone.matches
  ? { reserveBottom: Math.round(innerHeight * 0.64) }
  : { reserveRight: Math.min(520, innerWidth * (innerWidth < 1100 ? 0.55 : 0.4)) + 56 }

export function openDialog(mode, ...children) {
  state.dialogMode = mode
  const docked = DOCKED.has(mode)
  if (!docked && state.focusedId) unfocus()
  dlg.className = docked ? 'docked' : ''
  dlg.replaceChildren(...children)
  try {
    if (!dlg.open) dlg.showModal()
  } catch (err) {
    // Hộp thoại đang ở trạng thái lạ (vd. mở không phải dạng modal) → đóng rồi mở lại
    console.error(err)
    dlg.close()
    dlg.showModal()
  }
}
// Mở khung neo bên phải cho một tỉnh; camera bay tới tỉnh nếu chưa ở đó (vd. tải lại trang, đồng đội vừa bấm).
// Trả về promise xong khi camera tới nơi (để diễn hiệu ứng trên tỉnh sau khi bay xong)
export function openDocked(mode, provinceId, ...children) {
  let flight = Promise.resolve()
  if (state.focusedId !== provinceId) {
    state.focusedId = provinceId
    flight = state.map.focusOn(provinceId, dockReserve())
  }
  openDialog(mode, ...children)
  return flight
}
export function unfocus() {
  if (!state.focusedId) return
  state.focusedId = null
  state.map.unfocus()
}
export function closeDialog() {
  const wasDocked = DOCKED.has(state.dialogMode)
  state.dialogMode = null
  state.question = null
  if (dlg.open) dlg.close()
  clearIntro() // camera sắp bay đi: bỏ cờ mở màn công thành còn đứng trên tỉnh
  if (wasDocked) unfocus()
  if (state.cardQueue.length) setTimeout(revealCards, 300)
}
// Esc dành cho che màn hình, không đóng hộp thoại
dlg.addEventListener('cancel', e => e.preventDefault())

// Bỏ tỉnh đang làm nổi mà không bay về — để lần mở khung kế tiếp bay thẳng tới tỉnh đúng
export function setFocusFree() { state.focusedId = null }
