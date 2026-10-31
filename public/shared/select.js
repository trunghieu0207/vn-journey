// Ô chọn kiểu sticker thay cho danh sách xổ xuống của hệ điều hành (CSS không vẽ lại được phần menu của <select>).
// <select> gốc vẫn nằm đó (ẩn) làm nguồn dữ liệu: code cũ đọc .value / nghe 'change' như trước;
// đổi <option> hay .disabled bằng code thì nút tự cập nhật (MutationObserver).
// Danh sách mở bằng Popover API → nằm ở lớp trên cùng, không bị khung cha / hộp thoại cắt.

import { el } from './dom.js'
import { icon } from './icons.js'

let uid = 0

/** Thay mọi <select class="input"> trong root bằng ô chọn sticker. */
export function enhanceSelects(root = document) {
  for (const sel of root.querySelectorAll('select.input:not(.native-hidden)')) enhance(sel)
}

function enhance(sel) {
  const id = `sel${++uid}`
  // Tên đọc cho trình đọc màn hình: aria-label của <select>, hoặc chữ đầu của <label> bao ngoài ("Số team")
  const name = sel.getAttribute('aria-label') || sel.labels?.[0]?.firstChild?.textContent.trim() || ''
  const text = el('span', { class: 'pick-text' })
  const btn = el('button', {
    type: 'button', class: `pick ${sel.className.replace('input', '').trim()}`,
    'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': id,
  }, text, icon('chevron', { size: 18 }))
  const list = el('ul', { class: 'pick-list', id, role: 'listbox', popover: 'auto', tabindex: '-1' })
  if (name) list.setAttribute('aria-label', name)
  sel.classList.add('native-hidden')
  sel.tabIndex = -1
  sel.setAttribute('aria-hidden', 'true')
  sel.before(btn)
  document.body.append(list)

  let active = -1 // mục đang trỏ bằng bàn phím
  const items = () => [...list.children]
  function sync() {
    const o = sel.selectedOptions[0]
    text.textContent = o?.textContent ?? ''
    btn.disabled = sel.disabled
    btn.setAttribute('aria-label', name ? `${name}: ${text.textContent}` : text.textContent)
  }
  function build() {
    list.replaceChildren(...[...sel.options].map((o, i) => el('li', {
      role: 'option', id: `${id}-${i}`, 'aria-selected': String(o.selected), 'aria-disabled': o.disabled ? 'true' : false,
      onclick: () => choose(i),
    }, o.textContent)))
  }
  function highlight(i) {
    const li = items()
    if (!li.length) return
    active = (i + li.length) % li.length
    li.forEach((x, k) => x.classList.toggle('active', k === active))
    list.setAttribute('aria-activedescendant', li[active].id)
    li[active].scrollIntoView({ block: 'nearest' })
  }
  function choose(i) {
    const o = sel.options[i]
    if (!o || o.disabled) return
    const changed = sel.selectedIndex !== i
    sel.selectedIndex = i
    list.hidePopover()
    btn.focus()
    sync()
    if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }))
  }
  // Đặt danh sách ngay dưới nút (hoặc lên trên nếu sát đáy màn hình)
  function place() {
    const r = btn.getBoundingClientRect()
    list.style.minWidth = `${r.width}px`
    list.style.left = `${Math.min(r.left, innerWidth - list.offsetWidth - 8)}px`
    const below = innerHeight - r.bottom - 12
    list.style.top = below >= Math.min(list.offsetHeight, 240) ? `${r.bottom + 8}px` : `${Math.max(8, r.top - list.offsetHeight - 8)}px`
  }
  function open() {
    if (sel.disabled) return
    build()
    list.showPopover()
    place()
    highlight(Math.max(0, sel.selectedIndex))
    list.focus()
  }

  btn.addEventListener('click', () => (list.matches(':popover-open') ? list.hidePopover() : open()))
  btn.addEventListener('keydown', e => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open() }
  })
  list.addEventListener('keydown', e => {
    const n = items().length
    const keys = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: n - 1 }
    if (e.key in keys) { e.preventDefault(); highlight(Math.max(0, Math.min(n - 1, keys[e.key]))) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active) }
    else if (e.key === 'Tab') list.hidePopover()
    else if (e.key.length === 1) { // gõ chữ cái đầu → nhảy tới mục đó
      const k = items().findIndex((x, i) => i > active && x.textContent.toLowerCase().startsWith(e.key.toLowerCase()))
      const j = k >= 0 ? k : items().findIndex(x => x.textContent.toLowerCase().startsWith(e.key.toLowerCase()))
      if (j >= 0) highlight(j)
    }
  })
  list.addEventListener('pointermove', e => {
    const i = items().indexOf(e.target.closest('li'))
    if (i >= 0 && i !== active) highlight(i)
  })
  list.addEventListener('toggle', e => {
    btn.setAttribute('aria-expanded', String(e.newState === 'open'))
    btn.classList.toggle('open', e.newState === 'open')
    if (e.newState === 'closed' && list.contains(document.activeElement)) btn.focus()
  })
  // Cuộn / đổi cỡ cửa sổ khi đang mở: đóng (khỏi phải bám theo nút)
  addEventListener('resize', () => list.matches(':popover-open') && list.hidePopover())
  addEventListener('scroll', e => { if (!list.contains(e.target) && list.matches(':popover-open')) list.hidePopover() }, true)

  sel.addEventListener('change', sync)
  // đổi danh sách / .disabled bằng code (vd. admin.js nạp lại team rồi đặt lại .value) → cập nhật nút sau đó
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] })
  sync()
  return { sync }
}
