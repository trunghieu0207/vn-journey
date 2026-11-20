// Màn team phòng Chạy trạm: khay key (mảnh đã nhặt), nút Ngôi sao hy vọng, sổ gợi ý mật thư.
// Dữ liệu từ view.tram (server/game/tram.js teamPublic): không có tỉnh của key hay đáp án, chỉ chữ mảnh + gợi ý.

import { api, formatClock } from '/shared/api.js'
import { sound } from '/shared/sound.js'
import { icon, labeled } from '/shared/icons.js'
import { $, button, el } from '/shared/dom.js'
import { closeDialog, openDialog } from './dialogs.js'
import { toast } from './notify.js'
import { act } from './actions.js'
import { renderAll } from './render.js'
import { showTab } from './menu.js'
import { syncTramMap, tickTramMap } from './tram-map.js'
import { hasPending, now, running, state } from './state.js'

const STAR_HINT = {
  ready: 'Câu tới: đúng thì được ×2 điểm tỉnh, sai thì bị trừ điểm tỉnh. Mỗi trận một lần.',
  armed: 'Đã bật: câu hỏi kế tiếp mang ngôi sao. Bấm lại để tắt.',
  used: 'Ngôi sao đã dùng rồi.',
  off: 'Ngôi sao hy vọng chỉ dùng ở trạm tỉnh — map đặc biệt không dùng được.',
}
// Trạng thái hiện cho nút / ghi chú: qua map đặc biệt mà chưa dùng sao thì 'off'
const starView = tr => (tr.star !== 'used' && tr.stage !== 'map' ? 'off' : tr.star)

// Hộp xác nhận tự vẽ (không dùng confirm())
function askStar() {
  openDialog('card', el('div', { class: 'result' },
    el('h2', {}, labeled('star-hope', 'Ngôi sao hy vọng')),
    el('p', { class: 'explain' }, 'Câu tới: đúng ×2, sai bị trừ điểm tỉnh.'),
    el('p', { class: 'muted' }, 'Mỗi trận chỉ có một ngôi sao. Cả đội thấy khi bạn bật, bấm lại để tắt trước khi nhận câu.'),
    el('div', { class: 'dialog-actions' },
      button('Để sau', '', closeDialog),
      button(labeled('star-hope', 'Bật ngôi sao'), 'green', () => setStar(true)))))
}

function setStar(on) {
  act(async () => {
    try {
      const r = await api('/api/tram/star', { on })
      closeDialog()
      if (state.me?.tram) state.me.tram.star = r.star // SSE sẽ xác nhận lại cho cả đội
      sound.click()
      toast(on ? 'Đã bật Ngôi sao hy vọng cho câu tới' : 'Đã tắt Ngôi sao hy vọng', false, 'star-hope')
      renderAll()
    } catch (err) {
      if (err.code === 'star-used' && state.me?.tram) { state.me.tram.star = 'used'; closeDialog(); renderAll() }
      if (err.code === 'star-map') { closeDialog(); renderAll() }
      throw err
    }
  })
}

function starButton(tr) {
  const b = el('button', {
    type: 'button',
    class: `btn star-btn ${tr.star}`,
    'aria-pressed': String(tr.star === 'armed'),
    title: STAR_HINT[starView(tr)],
    disabled: starView(tr) !== tr.star || tr.star === 'used' || state.busy || !running() || hasPending(),
    onclick: () => (tr.star === 'armed' ? setStar(false) : askStar()),
  }, labeled('star-hope', tr.star === 'armed' ? 'Ngôi sao: đang bật' : tr.star === 'used' ? 'Ngôi sao đã dùng' : 'Ngôi sao hy vọng'))
  return b
}

// Khay: `need` ô, ô đã nhặt hiện icon key + chữ mảnh (theo thứ tự nhặt)
function trayCard(tr) {
  const slots = Array.from({ length: tr.need }, (_, i) => i < tr.pieces.length
    ? el('li', { class: 'slot got' }, icon('key', { size: '1.3em' }), el('span', {}, tr.pieces[i]))
    : el('li', { class: 'slot', 'aria-label': 'Chưa nhặt' }, el('span', { class: 'slot-empty', 'aria-hidden': 'true' }, '?')))
  return [
    el('h2', {}, labeled('key', `Key đã nhặt `), el('span', { class: 'muted' }, `${tr.found}/${tr.need}`)),
    el('ul', { class: 'key-tray' }, ...slots),
    el('div', { class: 'btn-row' }, starButton(tr)),
    el('p', { class: 'muted star-note' }, STAR_HINT[starView(tr)]),
  ]
}

function bookCard(tr) {
  const items = [...tr.hints].reverse().map(h => el('li', { class: `hint-item${h.level === 2 ? ' extra' : ''}` },
    icon('scroll', { size: '1.4em' }),
    el('div', {},
      h.level === 2 ? el('span', { class: 'hint-tag' }, 'Gợi ý thêm') : '',
      el('p', {}, h.text))))
  const next = tr.stage === 'map' ? el('p', { class: 'muted', id: 'tramNext' }, `Còn ${tr.nextHintIn} tỉnh đúng nữa có gợi ý mới`) : ''
  return [
    el('h2', {}, labeled('scroll', 'Sổ gợi ý')),
    next,
    el('p', { class: 'muted', id: 'tramRescue', hidden: true }),
    items.length ? el('ol', { class: 'hint-list' }, ...items)
      : el('p', { class: 'muted hint-empty' }, 'Chưa có gợi ý. Trả lời đúng ở các tỉnh để mở mật thư.'),
  ]
}

// Vẽ khối tram của màn team; phòng khác gọi cũng được (ẩn hết)
export function renderTram() {
  const isTram = state.me?.room.mode === 'tram' // bố cục theo kiểu phòng, không theo việc đã có hành trình
  const tr = isTram ? state.me.tram : null
  $('tramTray').hidden = !tr
  $('tramBook').hidden = !tr
  $('hintTab').hidden = !tr
  $('cardsTab').hidden = isTram
  $('cardsCard').hidden = isTram
  // Tab đang mở vừa bị ẩn (Gợi ý khi chưa có hành trình, Thẻ bài trong phòng tram) → về Bản đồ
  const tab = $('app').dataset.tab
  if ((tab === 'hint' && $('hintTab').hidden) || (tab === 'cards' && isTram)) showTab('map')
  if (!tr) { syncTramMap(); return }
  $('tramTray').replaceChildren(...trayCard(tr))
  $('tramBook').replaceChildren(...bookCard(tr))
  tickTram()
  syncTramMap()
}

// Gọi mỗi 250 ms: đếm lùi tới mốc gợi ý cứu trợ (nửa thời lượng)
export function tickTram() {
  const tr = state.me?.room.mode === 'tram' ? state.me.tram : null
  tickTramMap()
  const r = $('tramRescue')
  if (!tr || !r) return
  const left = tr.rescueAt ? tr.rescueAt - now() : 0
  r.hidden = !(left > 0 && state.me.status === 'running' && tr.stage === 'map')
  if (!r.hidden) r.textContent = `Gợi ý cứu trợ sau ${formatClock(left)}`
}
