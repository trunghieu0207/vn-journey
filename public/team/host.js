// Màn team: bảng điều khiển chủ phòng ngay trong màn chơi (người tạo phòng vào chơi luôn / người vào trước ở phòng có sẵn).
// Ngăn kéo bên phải, không che bản đồ: điều khiển trận, sự kiện, câu hỏi chung, mã màn chiếu. Việc ít dùng (sửa tên,
// mời ra, sửa điểm, thống kê) ở trang chủ phòng đầy đủ. Mọi quyền kiểm tra ở server (phiên giữ quyền chủ phòng).

import { api } from '/shared/api.js'
import { labeled } from '/shared/icons.js'
import { $, button, el } from '/shared/dom.js'
import { toast } from './notify.js'
import { isHost, now, state } from './state.js'

const drawer = $('hostDrawer')
let screenCode = null
let evKind = 'festival', evRegion = 'north' // giữ lựa chọn khi bảng vẽ lại (mỗi lần có cập nhật)
let confirmAt = { action: null, until: 0 } // thao tác cần bấm 2 lần (Kết thúc, Chơi lại) — không dùng confirm() của trình duyệt

async function call(path, body, ok) {
  try {
    await api(path, body)
    if (ok) toast(ok)
  } catch (err) {
    toast(err.message, true)
  }
}

function game(action, label, cls = '', twice = null) {
  return button(label, cls, () => {
    if (twice && !(confirmAt.action === action && confirmAt.until > Date.now())) {
      confirmAt = { action, until: Date.now() + 4000 }
      toast(twice)
      return renderHost()
    }
    confirmAt = { action: null, until: 0 }
    call('/api/owner/game', { action })
  })
}

export function renderHost() {
  $('hostBtn').hidden = !isHost()
  if (!isHost()) drawer.hidden = true
  if (drawer.hidden) return
  const s = state.me.status
  const arm = a => confirmAt.action === a && confirmAt.until > Date.now()
  const buttons = []
  if (s === 'waiting') buttons.push(game('start', labeled('play', 'Bắt đầu'), 'green'))
  if (s === 'running') buttons.push(game('pause', labeled('pause', 'Tạm dừng')))
  if (s === 'paused' && !state.me.shared) buttons.push(game('resume', labeled('play', 'Tiếp tục'), 'green'))
  if (s === 'running' || s === 'paused') buttons.push(game('end', arm('end') ? 'Bấm lần nữa để kết thúc' : labeled('stop', 'Kết thúc'), 'danger', 'Bấm "Kết thúc" lần nữa trong 4 giây để kết thúc trận'))
  if (s !== 'waiting') buttons.push(game('reset', arm('reset') ? 'Bấm lần nữa để chơi lại' : '↺ Chơi lại', '', 'Bấm "Chơi lại" lần nữa trong 4 giây — xóa toàn bộ diễn biến và điểm'))

  const running = s === 'running'
  const kind = el('select', { class: 'input compact', 'aria-label': 'Loại sự kiện' },
    el('option', { value: 'festival' }, 'Lễ hội (+100, 5 phút)'), el('option', { value: 'storm' }, 'Bão (chặn đường, 3 phút)'),
    el('option', { value: 'golden' }, 'Câu hỏi vàng (×2, 2 phút)'), el('option', { value: 'rumor' }, 'Tin đồn'))
  const region = el('select', { class: 'input compact', 'aria-label': 'Miền' },
    el('option', { value: 'north' }, 'Miền Bắc'), el('option', { value: 'central' }, 'Miền Trung'), el('option', { value: 'south' }, 'Miền Nam'))
  kind.value = evKind
  region.value = evRegion
  region.disabled = ['rumor', 'golden'].includes(evKind)
  kind.addEventListener('change', () => { evKind = kind.value; region.disabled = ['rumor', 'golden'].includes(evKind) })
  region.addEventListener('change', () => { evRegion = region.value })
  const ev = state.me.event && state.me.event.until > now()

  drawer.replaceChildren(
    el('div', { class: 'host-head' }, el('h2', {}, 'Chủ phòng'), button('✕', 'kick', () => { drawer.hidden = true }, { 'aria-label': 'Đóng' })),
    el('section', {}, el('h3', {}, 'Trận đấu'), el('div', { class: 'btn-row' }, ...buttons)),
    el('section', {}, el('h3', {}, 'Sự kiện'), ev ? el('p', { class: 'muted' }, 'Đang có sự kiện — tung sự kiện mới sẽ thay sự kiện cũ.') : '',
      el('div', { class: 'btn-row' }, kind, region,
        button('Tung sự kiện', 'on', () => call('/api/owner/event', { kind: kind.value, region: region.value }, 'Đã tung sự kiện'), { disabled: !running })),
      button(labeled('question', 'Câu hỏi chung cả phòng'), '', () => call('/api/owner/shared', { action: 'start' }, 'Đã tung câu hỏi chung — trận tạm dừng'),
        { disabled: !running, title: 'Trận tạm dừng, mỗi người chọn trên máy mình trong 30 giây' })),
    el('section', {}, el('h3', {}, 'Màn chiếu'),
      el('p', {}, 'Mã phòng ', el('b', {}, state.me.room.code), ' · mã màn chiếu ', el('b', {}, screenCode ?? '…')),
      el('a', { class: 'btn', href: '/screen.html', target: '_blank', rel: 'noopener' }, labeled('screen', 'Mở màn chiếu'))),
    el('a', { class: 'link', href: '/admin.html' }, 'Trang chủ phòng đầy đủ (sửa tên, mời ra, sửa điểm, thống kê) →')) // có nút "Quay lại chơi"
}

$('hostBtn').addEventListener('click', async () => {
  drawer.hidden = !drawer.hidden
  if (!drawer.hidden && !screenCode) {
    try {
      screenCode = (await api('/api/owner/overview')).screenCode
    } catch {}
  }
  renderHost()
})
