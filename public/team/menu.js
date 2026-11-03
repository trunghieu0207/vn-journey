// Màn team trên điện thoại / máy tính bảng dọc (css/mobile.css): menu ≡ gom các nút phụ của thanh trên,
// thanh tab dưới chọn thẻ hiện trong ngăn dưới bản đồ, màn che mở / đóng bằng chạm (không có phím Esc).

import { sound } from '/shared/sound.js'
import { music } from '/shared/music.js'
import { $, el } from '/shared/dom.js'
import { labeled } from '/shared/icons.js'

// ---------- Màn che ----------
const touch = matchMedia('(hover: none)')
export function toggleCover(show = $('cover').hidden) {
  $('cover').hidden = !show
  document.body.classList.toggle('covered', show)
}
$('coverHint').textContent = touch.matches ? 'Chạm 2 lần để mở lại' : 'Nhấn Esc để mở lại'
$('cover').addEventListener('dblclick', () => toggleCover(false))

// ---------- Menu ≡ ----------
const pop = $('menuPop')
const item = (iconName, text, onClick, extra = {}) =>
  el('button', { type: 'button', role: 'menuitem', ...extra, onclick: () => { closeMenu(); onClick() } }, labeled(iconName, text))

function openMenu() {
  const muted = sound.muted
  pop.replaceChildren(
    $('hostBtn').hidden ? '' : item('play', 'Chủ phòng', () => $('hostBtn').click(), { class: 'host' }),
    $('journeyCard').hidden ? '' : item('map', 'Sổ tay hành trình', () => $('journeyBtn').click()),
    item('question', 'Luật chơi', () => open('/rules', '_blank', 'noopener')),
    item(muted ? 'sound-off' : 'sound-on', muted ? 'Bật âm thanh' : 'Tắt âm thanh', () => $('muteBtn').click()),
    $('musicBtn').hidden ? '' : item(music.on ? 'music-on' : 'music-off', music.on ? 'Tắt nhạc nền' : 'Bật nhạc nền', () => $('musicBtn').click()),
    item('fog', 'Che màn hình', () => toggleCover(true)),
    el('hr'),
    item('retreat', 'Thoát', () => $('logoutBtn').click()))
  pop.hidden = false
  $('menuBtn').setAttribute('aria-expanded', 'true')
}
function closeMenu() {
  pop.hidden = true
  $('menuBtn').setAttribute('aria-expanded', 'false')
}
$('menuBtn').addEventListener('click', e => {
  e.stopPropagation()
  if (pop.hidden) openMenu()
  else closeMenu()
})
document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target)) closeMenu() })

// ---------- Thanh tab dưới ----------
// #app[data-tab] quyết định thẻ nào hiện trong ngăn dưới (mobile.css). Bấm lại tab đang mở → về Bản đồ (thu ngăn)
export function showTab(tab) {
  $('app').dataset.tab = tab
  for (const b of $('tabbar').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.tab === tab))
}
$('tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]')
  if (!b) return
  sound.click()
  showTab(b.dataset.tab === $('app').dataset.tab ? 'map' : b.dataset.tab)
})
showTab('map')
