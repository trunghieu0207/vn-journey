// Bản đồ: hiệu ứng — bấm tỉnh, chiếm / mất tỉnh, nón lá nhảy sang tỉnh mới, vòng sóng, cờ bật.
// Bản tham chiếu: mockup/animations.html. Máy bật "giảm chuyển động" thì bỏ qua (chỉ đổi trạng thái).

import { reducedMotion, confetti } from '../fx.js'
import { NS, svgEl } from './geometry.js'
import { LIFT_PX } from './assets.js'

// m: phần dùng chung của bản đồ — phần tử SVG, dữ liệu tỉnh, hàm xếp nhãn; m.view / m.hopping đọc-ghi lúc chạy
export function createEffects(m) {
  const { svg, wrap, layers, byId, tileEls, lblEls, marker, hop, trail, trailCasing } = m

  // Hiệu ứng "bay lên khỏi bản đồ" (vòng sóng, giấy vụn, chữ điểm, mảnh sticker) là phần tử HTML đặt chồng lên khung
  // bản đồ, chỉ đổi transform / opacity → GPU ghép thẳng, không bắt vẽ lại cả SVG bản đồ mỗi khung hình
  // (trước đây vẽ trong SVG + bộ lọc bóng đổ: GPU bận ~30% suốt 2 giây sau mỗi lần chiếm tỉnh).
  // Toạ độ (pixel, so với góc trên-trái khung bản đồ) của điểm bản đồ (x, y)
  function toWrap(x, y) {
    const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()), r = wrap.getBoundingClientRect()
    return [pt.x - r.left, pt.y - r.top]
  }
  // Điểm giữa tỉnh trên khung bản đồ (pixel) — tỉnh đang đứng thì tính theo mặt trên khối nổi
  function spot(id) {
    const p = byId.get(id)
    if (!p) return null
    const [x, y] = toWrap(p.x, p.y)
    return [x, m.view.current === id ? y - LIFT_PX : y]
  }
  function layerEl(cls, x, y) {
    const d = document.createElement('div')
    d.className = cls
    d.style.left = `${x}px`
    d.style.top = `${y}px`
    wrap.append(d)
    return d
  }
  // Mảnh hình tỉnh tách ra một SVG nhỏ nằm đúng chỗ tỉnh trên khung bản đồ (để diễn trên GPU rồi bỏ đi)
  function shapeLayer(id, color, cls) {
    const geo = tileEls[id].querySelector('.geo')
    const bb = geo.getBBox(), r = geo.getBoundingClientRect(), wr = wrap.getBoundingClientRect()
    const pad = 6, u = bb.width / (r.width || 1) // chừa chỗ cho nét viền trắng
    const o = document.createElementNS(NS, 'svg')
    o.setAttribute('class', `map-fx-shape ${cls}`)
    o.setAttribute('viewBox', `${bb.x - pad * u} ${bb.y - pad * u} ${bb.width + 2 * pad * u} ${bb.height + 2 * pad * u}`)
    o.setAttribute('preserveAspectRatio', 'none')
    Object.assign(o.style, { left: `${r.left - wr.left - pad}px`, top: `${r.top - wr.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` })
    svgEl('path', { d: byId.get(id).d }, o).style.fill = color
    wrap.append(o)
    return o
  }

  // Vòng sóng lan ra từ tỉnh (cls 'burst' màu team / 'ripple' vàng)
  function burst(id, color, cls = 'burst') {
    const p = byId.get(id)
    if (!p || reducedMotion) return
    const c = layerEl(`map-fx-ring ${cls}`, ...toWrap(p.x, p.y))
    if (color) c.style.color = color
    after(anim(c, [{ transform: 'translate(-50%, -50%) scale(.3)', opacity: 1 }, { transform: 'translate(-50%, -50%) scale(2.6)', opacity: 0 }],
      { duration: 1400, easing: 'ease-out', fill: 'forwards' }), () => c.remove())
  }
  const anim = (el, frames, opts) => (reducedMotion ? null : el.animate(frames, { easing: 'ease', ...opts }))
  const after = (a, fn) => (a ? a.finished.then(fn, fn) : fn())
  // Tỉnh được bấm nảy nhẹ
  function tap(id) {
    anim(tileEls[id], [{ transform: 'scale(1)' }, { transform: 'scale(1.05)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.3, 1.6, .5, 1)' })
  }
  // Chữ điểm bay lên từ tỉnh
  function floatText(id, text) {
    const p = byId.get(id), [x, y] = toWrap(p.x, p.y)
    const t = layerEl('map-fx-pts', x, y - 26)
    t.textContent = text
    after(anim(t, [
      { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%, calc(-50% - 8px)) scale(1.15)', opacity: 1, offset: 0.25, easing: 'cubic-bezier(.3, 1.6, .5, 1)' },
      { transform: 'translate(-50%, calc(-50% - 14px)) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%, calc(-50% - 24px)) scale(1)', opacity: 0 },
    ], { duration: 1500, delay: 100, fill: 'both' }), () => t.remove())
  }
  // Giấy vụn bắn ra từ tỉnh (dùng chung với đếm ngược — shared/fx.js)
  function paperBurst(id) {
    const p = byId.get(id)
    confetti(wrap, ...toWrap(p.x, p.y), { n: 14, spread: 75 })
  }
  // Mảnh sticker trùng khít mặt trên của khối nổi (tỉnh đang đứng: nhấc lên + nghiêng) — vẽ path theo đúng ma trận
  // màn hình của mặt trên, viền vàng như .lift-top → lúc gỡ mảnh đi không lệch vị trí / màu
  function liftLayer(top, fill) {
    const r = top.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), pad = 8
    const x0 = r.left - pad, y0 = r.top - pad
    const o = document.createElementNS(NS, 'svg')
    o.setAttribute('class', 'map-fx-shape slam')
    Object.assign(o.style, { left: `${x0 - wr.left}px`, top: `${y0 - wr.top}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` })
    const c = top.getScreenCTM()
    const path = svgEl('path', { d: top.getAttribute('d'), transform: `matrix(${c.a} ${c.b} ${c.c} ${c.d} ${c.e - x0} ${c.f - y0})` }, o)
    Object.assign(path.style, { fill, stroke: '#FFC800', strokeWidth: '4px' })
    wrap.append(o)
    return o
  }
  // Chiếm được tỉnh: mảnh sticker màu team rơi xuống dập lên tỉnh → giấy vụn + vòng sóng + cờ bật + "+điểm".
  // from: màu tỉnh trước khi chiếm (mặc định màu miền; công thành: var(--taken)). Bản đồ đã vẽ màu mới (render chạy trước)
  // → giữ màu cũ tới lúc mảnh chạm xuống rồi đổi một lần, không chuyển màu dần (trước đây: mảnh biến mất, tỉnh mới đổi màu dần
  // trong 0,5 giây và khối nổi bật lên lệch chỗ mảnh vừa đáp → trông như giật)
  function capture(id, color, points, from) {
    const p = byId.get(id), g = tileEls[id]
    if (!p) return
    if (reducedMotion) return pop(id)
    const old = from || `var(--tile-${p.region[0]})`
    const geo = g.querySelector('.geo')
    const lift = m.view.current === id ? m.liftEls : null
    const paint = [] // [phần tử, thuộc tính, giá trị mới] — đặt lại một lần lúc mảnh chạm
    const hold = (el, prop, oldValue) => { paint.push([el, prop, el.style[prop]]); el.style[prop] = oldValue }
    geo.style.transition = 'none'
    let st
    if (lift) {
      const top = lift.raised[0]
      paint.push([svg, '--lift-wall', svg.style.getPropertyValue('--lift-wall')])
      svg.style.setProperty('--lift-wall', m.shade(old, 0.6))
      for (const w of lift.walls) { hold(w, 'fill', m.shade(old, 0.6)); hold(w, 'stroke', m.shade(old, 0.6)) }
      st = liftLayer(top, top.style.fill)
      hold(top, 'fill', m.tint(old, 0.45))
    } else {
      hold(geo, 'fill', old)
      st = shapeLayer(id, color, 'slam')
    }
    after(anim(st, [
      { transform: 'translateY(-18px) scale(1.4) rotate(-9deg)', opacity: 0, easing: 'ease-in' },
      { transform: 'translateY(-10px) scale(1.25) rotate(-6deg)', opacity: 1, offset: 0.35, easing: 'cubic-bezier(.6, 0, .9, .5)' },
      { transform: 'translateY(0) scale(.96) rotate(1deg)', opacity: 1, offset: 0.8 },
      { transform: 'translateY(0) scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: 560, fill: 'forwards' }), () => {
      for (const [el, prop, v] of paint) prop.startsWith('--') ? el.style.setProperty(prop, v) : (el.style[prop] = v)
      // Gỡ mảnh sau khi bản đồ đã vẽ màu mới (2 khung) → không lộ màu cũ giữa chừng
      requestAnimationFrame(() => requestAnimationFrame(() => { st.remove(); geo.style.transition = '' }))
      paperBurst(id)
      burst(id, color)
      if (points) floatText(id, `+${points}`)
    })
  }
  // Mất tỉnh: nháy đỏ + rung, lớp màu team bong ra như sticker bị bóc (lộ màu mới bên dưới), cờ "?" bật lên
  function lose(id, color) {
    shake(id)
    const p = byId.get(id)
    if (!p || reducedMotion) return
    setTimeout(() => {
      const peel = shapeLayer(id, color, 'peel')
      after(anim(peel, [
        { transform: 'rotate(0deg) translate(0, 0)', opacity: 1 },
        { transform: 'rotate(10deg) translate(3px, -6px)', opacity: 1, offset: 0.35, easing: 'ease-in' },
        { transform: 'rotate(28deg) translate(14px, 26px)', opacity: 0 },
      ], { duration: 820, easing: 'ease-out', fill: 'both' }), () => peel.remove())
      pop(id)
      burst(id, '#FF4B4B')
    }, 520)
  }
  // Cờ bật nảy khi vừa chiếm
  function pop(id) {
    const l = lblEls[id]
    if (!l) return
    l.classList.add('just')
    setTimeout(() => l.classList.remove('just'), 800)
  }
  // Tỉnh rung + nháy đỏ khi bị mất
  function shake(id) {
    const g = tileEls[id]
    if (!g) return
    g.classList.add('lost')
    setTimeout(() => g.classList.remove('lost'), 1200)
  }
  // Nón lá nhảy vòng cung từ tỉnh cũ sang (lấy đà → bay → đáp co giãn), đường đi dài ra theo nón lá,
  // tỉnh mới nhấc lên (viền vàng) + vòng sóng khi nón lá đáp
  function arrive() {
    const from = m.takeHopFrom()
    const id = m.view.current
    const lift = layers.lift.firstChild
    if (reducedMotion || !from || !byId.get(from) || !id) return lift?.classList.add('rise')
    const hopEl = hop
    const trailPts = [...(m.view.trail || [])].map(t => byId.get(t))
    const setTrail = t => {
      const pts = trailPts.map((q, i) => (i === trailPts.length - 1 && t < 1
        ? `${trailPts[i - 1].x + (q.x - trailPts[i - 1].x) * t},${trailPts[i - 1].y + (q.y - trailPts[i - 1].y) * t}`
        : `${q.x},${q.y}`)).join(' ')
      trail.setAttribute('points', pts)
      trailCasing.setAttribute('points', pts)
    }
    const growTrail = trailPts.length > 1 && trailPts.at(-1).id === id && trailPts.at(-2).id === from
    if (lift) lift.style.opacity = '0'
    svg.classList.add('lift-off') // khối nổi tạm ẩn khi nón lá nhảy → tỉnh gốc hiện màu thường
    m.hopping = { from, t: 0 }
    if (growTrail) setTrail(0)
    m.placeMarker()
    // lấy đà
    after(anim(hopEl, [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.18, .78)' }], { duration: 160, easing: 'ease-out', fill: 'forwards' }), () => {
      anim(hopEl, [{ transform: 'scale(1.18, .78)' }, { transform: 'scale(.9, 1.15)', offset: 0.25 }, { transform: 'scale(1, 1)', offset: 0.8 }, { transform: 'scale(1.25, .75)' }], { duration: 600 })
      const t0 = performance.now()
      const step = now => {
        if (!m.hopping) return
        m.hopping.t = Math.min(1, (now - t0) / 600)
        if (growTrail) setTrail(m.hopping.t)
        m.placeMarker()
        if (m.hopping.t < 1) return requestAnimationFrame(step)
        m.hopping = null
        m.placeMarker()
        anim(hopEl, [{ transform: 'scale(1.25, .75)' }, { transform: 'scale(.95, 1.06)', offset: 0.5 }, { transform: 'scale(1, 1)' }], { duration: 300, easing: 'ease-out' })
        const l = layers.lift.firstChild
        if (l) { l.style.opacity = ''; l.classList.add('rise') }
        svg.classList.remove('lift-off')
        burst(id, null, 'ripple')
      }
      requestAnimationFrame(step)
    })
  }
  return { burst, tap, floatText, paperBurst, capture, lose, pop, shake, arrive, spot }
}
