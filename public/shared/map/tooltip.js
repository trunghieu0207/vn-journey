// Bản đồ: tooltip tự vẽ khi rê chuột lên tỉnh / đảo / quần đảo.

import { labeled } from '../icons.js'
import { REGION_NAME, ISLANDS, ARCHIPELAGOS } from './assets.js'

// m: { svg, wrap, tip, byId, tileOf, tipExtra, isDragging }
export function attachTooltip(m) {
  const { svg, wrap, tip, byId, tileOf, tipExtra } = m

  function showTip(e, title, lines) {
    const head = document.createElement('strong')
    head.textContent = title
    // Mỗi dòng: [chữ, mờ?, tên icon?, màu cờ?]
    tip.replaceChildren(head, ...lines.map(([text, muted, ic, color]) => {
      const d = document.createElement('div')
      d.append(ic ? labeled(ic, text, { color }) : text)
      if (muted) d.className = 'muted'
      return d
    }))
    tip.hidden = false
    const r = wrap.getBoundingClientRect()
    let x = e.clientX - r.left + 14
    const y = e.clientY - r.top + 14
    if (x + 260 > r.width) x -= 280
    tip.style.left = `${x}px`
    tip.style.top = `${y}px`
  }
  svg.addEventListener('pointermove', e => {
    if (m.isDragging()) { tip.hidden = true; return }
    const prov = e.target.closest('.prov')
    const isl = e.target.closest('[data-island]')
    const archi = e.target.closest('[data-archi]')
    if (prov) {
      const p = byId.get(prov.dataset.id)
      const t = tileOf(p.id)
      const lines = [
        [`${REGION_NAME[p.region]} · ${p.points} điểm`, true],
        [p.mergedFrom.length > 1 ? `Hợp nhất từ: ${p.mergedFrom.join(', ')}` : 'Giữ nguyên, không sáp nhập'],
      ]
      if (t.fog) lines.push(['Chưa khám phá', true, 'fog'])
      if (t.blocked) lines.push(['Đang có bão, không đi vào được', false, 'storm'])
      lines.push(...tipExtra(p.id))
      showTip(e, p.name, lines)
    } else if (isl) {
      const i = ISLANDS.find(x => x.name === isl.dataset.island)
      showTip(e, `Đảo ${i.name}`, [[`Thuộc ${i.owner}`, true]])
    } else if (archi) {
      const a = ARCHIPELAGOS.find(x => x.name === archi.dataset.archi)
      showTip(e, a.full, [[`Thuộc ${a.owner}`, true]])
    } else {
      tip.hidden = true
    }
  })
  svg.addEventListener('pointerleave', () => { tip.hidden = true })
}
