// Bản đồ thật dùng chung cho màn team / màn chiếu / MC.
// Vẽ SVG từ data/map-geo.json (8 lớp, mục 5.3), trạng thái tỉnh đổi bằng class CSS (mục 5.4),
// nhãn to dần theo √zoom + xếp theo ưu tiên để không chồng chữ (mục 5.7).
// Bản tham chiếu thiết kế: mockup/map-styles.html.

import { icon } from './icons.js'
import { reducedMotion } from './fx.js'
import { svgEl, svgText, starPoints, rings, inRing, ringSize, wobble, abbrOf, unionBox, smoothRings } from './map/geometry.js'
import { SEA_TEXT, ISLANDS, STYLIZED_ISLANDS, STYLIZED_ISLAND_D, ARCHIPELAGOS, LIFT_PX, LIFT_STEPS, LABEL_GROW_MAX, DEFS, CLOUD_SVG } from './map/assets.js'
import { zoomPath, easeInOut } from './map/camera-path.js'
import { createEffects } from './map/effects.js'
import { attachTooltip } from './map/tooltip.js'

export { REGION_NAME } from './map/assets.js'

const HOME_PIN_D = 'M0 8C-2.6 4.8-6 2.2-6-1.6a6 6 0 0 1 12 0C6 2.2 2.6 4.8 0 8z'

export function createMap(wrap, { geo, provinces, onSelect = () => {}, tipExtra = () => [] }) {
  const { lon0, lat0, k: K, cos } = geo.projection
  const proj = ([lon, lat]) => [(lon - lon0) * cos * K, (lat0 - lat) * K]

  const geoById = new Map(geo.provinces.map(g => [g.id, g]))
  const byId = new Map(provinces.map(p => {
    const g = geoById.get(p.id)
    // rings: các vòng điểm (đã run nét) để tính toán; d: đường cong mềm để vẽ (map/geometry.js smoothRings)
    const pts = rings(wobble(g.d))
    return [p.id, { ...p, label: p.shortName || p.name, x: g.label[0], y: g.label[1], d: smoothRings(pts), rings: pts, islets: g.islets, areaKm2: g.areaKm2 }]
  }))
  const adjacency = new Map([...byId.keys()].map(id => [id, new Set()]))
  for (const [a, b] of geo.adjacency) {
    adjacency.get(a).add(b)
    adjacency.get(b).add(a)
  }

  // ---------- Khung: SVG, nút zoom, tooltip ----------
  const svg = svgEl('svg', { class: 'map', role: 'application', 'aria-label': 'Bản đồ 34 tỉnh, thành phố Việt Nam' })
  const zoomBar = document.createElement('div')
  zoomBar.className = 'zoom'
  const zoomBtn = (label, text, fn) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'btn'
    b.setAttribute('aria-label', label)
    b.title = label
    b.append(text)
    b.addEventListener('click', fn)
    zoomBar.append(b)
  }
  const tip = document.createElement('div')
  tip.className = 'tooltip'
  tip.hidden = true
  wrap.prepend(svg)
  wrap.append(zoomBar, tip)

  svg.innerHTML = DEFS
  const layers = {}
  for (const name of ['bg', 'shadow', 'outline', 'paper', 'tiles', 'borders', 'trail', 'fog', 'clouds', 'lift', 'labels', 'marker', 'fx']) {
    layers[name] = svgEl('g', { id: `layer-${name}` }, svg)
  }

  const [x0, y0, x1, y1] = geo.bounds
  const PAD = 30
  const BASE = { x: x0 - PAD, y: y0 - PAD, w: x1 - x0 + PAD * 2, h: y1 - y0 + PAD * 2 + 60 }
  let vb = { ...BASE }
  let live = null // camera đang chuyển động (null = đứng yên, camera lấy từ viewBox) — xem setCamera()

  const labelItems = []
  const stylizedEls = []
  const tileEls = {}, paperEls = {}, fogEls = {}, cloudSets = {}, lblEls = {}, stormEls = {}, lanternEls = {}

  // ---------- Nền: tên biển, khung quần đảo, nhãn đảo ----------
  for (const s of SEA_TEXT) {
    const [x, y] = proj([s.lon, s.lat])
    const g = svgEl('g', { class: 'lbl-fixed' }, layers.bg)
    svgText(g, 0, 0, s.text, s.small ? 'sea-label small' : 'sea-label')
    labelItems.push({ el: g, x, y, kind: 'sea' })
  }
  for (const a of ARCHIPELAGOS) {
    const g0 = geoById.get(a.province)
    const offshoreX = proj([a.minLon, 0])[0]
    const shapePts = rings(g0.d).filter(r => r.every(([x]) => x > offshoreX)).flat()
    const pts = [...g0.islets.filter(([x]) => x > offshoreX), ...shapePts]
    if (!pts.length) continue
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 14, ry = (Math.max(...ys) - Math.min(...ys)) / 2 + 14
    const g = svgEl('g', { 'data-archi': a.name }, layers.bg)
    const box = { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2, rx: 18 }
    svgEl('rect', { class: 'archi-frame', ...box }, g)
    svgEl('rect', { class: 'archi-hit', ...box }, g)
    const lg = svgEl('g', { class: 'lbl-fixed' }, layers.labels)
    svgText(lg, 0, 14, a.name, 'archi-label')
    svgText(lg, 0, 27, `(${a.owner})`, 'archi-owner')
    labelItems.push({ el: lg, x: cx, y: cy + ry, kind: 'archi' })
  }
  const shapeBoxes = geo.provinces.flatMap(g => rings(g.d).map(pts => {
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1])
    return [Math.min(...xs) - 4, Math.min(...ys) - 4, Math.max(...xs) + 4, Math.max(...ys) + 4]
  }))
  const hasShape = (x, y) => shapeBoxes.some(([bx0, by0, bx1, by1]) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1)
  for (const isl of ISLANDS) {
    const [x, y] = proj([isl.lon, isl.lat])
    if (!hasShape(x, y) && !STYLIZED_ISLANDS.some(si => si.name === isl.name)) continue
    const g = svgEl('g', { class: 'lbl-fixed island', 'data-island': isl.name }, layers.labels)
    svgText(g, 0, 13, isl.name, 'island-label')
    svgEl('circle', { class: 'island-hit', cx: 0, cy: 0, r: 7 }, g)
    labelItems.push({ el: g, x, y, kind: 'island' })
  }

  // ---------- Từng tỉnh ----------
  for (const p of byId.values()) {
    const g = svgEl('g', {
      class: 'prov', 'data-id': p.id, 'data-region': p.region,
      role: 'button', 'aria-label': `${p.name} – ${p.points} điểm`, tabindex: '-1',
    }, layers.tiles)
    svgEl('path', { class: 'geo', d: p.d }, g)
    // Bóng giấy dưới mảnh tỉnh (lộ ra ở khe trắng khi phóng to)
    paperEls[p.id] = svgEl('path', { class: 'paper-shadow off', d: p.d, transform: 'translate(.7 1.1)' }, layers.paper)
    const archi = ARCHIPELAGOS.find(a => a.province === p.id)
    const minX = archi ? proj([archi.minLon, 0])[0] : Infinity
    for (const [x, y] of p.islets) if (x > minX) svgEl('circle', { class: 'islet', cx: x, cy: y, r: 1.2 }, g)
    for (const si of STYLIZED_ISLANDS.filter(si => si.province === p.id)) {
      const [x, y] = proj([si.lon, si.lat])
      stylizedEls.push({ el: svgEl('path', { class: 'geo islet-shape', d: STYLIZED_ISLAND_D }, g), x, y })
    }
    // Khối "sticker": viền trắng dày + bóng xanh, chỉ lấy đất liền + đảo lớn
    const bigD = smoothRings(p.rings.filter(r => ringSize(r) > 12))
    svgEl('path', { class: 'geo-under', d: bigD }, layers.outline)
    svgEl('path', { class: 'geo-under', d: bigD }, layers.shadow)
    tileEls[p.id] = g
    // Khung bao phần đất liền chính (vòng lớn nhất) — để camera phóng tới tỉnh, bỏ qua đảo xa như Hoàng Sa, Trường Sa
    const main = p.rings.reduce((a, b) => (ringSize(b) > ringSize(a) ? b : a))
    const mx = main.map(q => q[0]), my = main.map(q => q[1])
    p.box = { x: Math.min(...mx), y: Math.min(...my), w: Math.max(...mx) - Math.min(...mx), h: Math.max(...my) - Math.min(...my) }

    const f = svgEl('g', { class: 'fog off' }, layers.fog)
    svgEl('path', { class: 'geo', d: p.d }, f)
    fogEls[p.id] = f
    // Mây: một đám ở nhãn tỉnh; tỉnh lớn thêm tối đa 2 đám phụ (chỉ hiện khi đã phóng to — layoutLabels)
    const cg = svgEl('g', { class: 'cloud-set off' }, layers.clouds)
    const spots = [{ x: p.x, y: p.y, main: true }]
    const [bx0, by0] = [p.box.x, p.box.y]
    for (const [fx, fy] of [[0.28, 0.3], [0.72, 0.68], [0.3, 0.76], [0.7, 0.28]]) {
      if (spots.length >= 3 || p.box.w * p.box.h < 900) break
      const x = bx0 + p.box.w * fx, y = by0 + p.box.h * fy
      if (inRing(main, x, y) && spots.every(o => Math.hypot(o.x - x, o.y - y) > Math.min(p.box.w, p.box.h) * 0.35)) spots.push({ x, y, main: false })
    }
    cloudSets[p.id] = { g: cg, spots: spots.map((sp, i) => {
      const el = svgEl('g', { class: sp.main ? 'cloud' : 'cloud extra' }, cg)
      el.innerHTML = CLOUD_SVG // chuỗi hằng trong file, không có dữ liệu động
      el.firstChild.style.animationDelay = `${-((p.x * 0.37 + i * 1.7) % 5).toFixed(2)}s`
      return { ...sp, el }
    }) }

    // Nhãn vẽ quanh gốc (0,0) theo pixel màn hình; layoutLabels() đặt vị trí, bù zoom, tránh chồng chữ.
    // Hàng biểu tượng phía trên tên: sao thủ đô / chấm thành phố, cờ, khiên.
    const l = svgEl('g', { class: 'lbl', 'data-id': p.id }, layers.labels)
    const badges = svgEl('g', { class: 'badges' }, l)
    if (p.isCapital) {
      svgEl('circle', { class: 'capital-bg', cx: -15, cy: -17, r: 7 }, badges)
      svgEl('polygon', { class: 'capital-star', points: starPoints(-15, -17, 4.6, 1.9) }, badges)
    } else if (p.isCity) {
      // Huy hiệu tròn nền trắng (như cờ) → không chìm trên tỉnh miền Nam vàng tươi (D3)
      svgEl('circle', { class: 'badge-bg', cx: -15, cy: -17, r: 6 }, badges)
      svgEl('circle', { class: 'city', cx: -15, cy: -17, r: 3.4 }, badges)
    }
    for (const [cls, icon] of [['flag', '#i-flag'], ['flag-q', '#i-flag-q']]) {
      const fg = svgEl('g', { class: cls }, badges)
      svgEl('circle', { class: 'badge-bg', cx: 1, cy: -17, r: 8 }, fg)
      svgEl('use', { href: icon, x: -5, y: -23, width: 12, height: 12 }, fg)
    }
    svgEl('use', { class: 'shield', href: '#i-shield', x: 11, y: -23, width: 12, height: 12 }, badges)
    const names = svgEl('g', { class: 'names' }, l)
    svgText(names, 0, 4, p.label, 'label')
    svgText(l, 0, 17, `${p.points}đ`, 'pts')
    svgText(l, 0, 4, abbrOf(p.name), 'label abbr')
    lblEls[p.id] = l
    labelItems.push({ el: l, x: p.x, y: p.y, prov: p })

  }

  const trailCasing = svgEl('polyline', { class: 'trail-casing' }, layers.trail)
  const trail = svgEl('polyline', { class: 'trail' }, layers.trail)
  const trailStops = svgEl('g', { class: 'trail-stops' }, layers.trail)
  const marker = svgEl('g', { class: 'marker', hidden: '' }, layers.marker)
  const hop = svgEl('g', { class: 'hop' }, marker)
  svgEl('ellipse', { cx: 0, cy: 5, rx: 10, ry: 2.4, fill: 'rgba(0,0,0,.25)' }, hop)
  // Viền trắng quanh nón lá → không chìm trên tỉnh màu vàng (D3)
  svgEl('path', { class: 'hat-halo', d: 'M-12 3 Q-2 -16 0 -16 Q2 -16 12 3 Q0 7 -12 3 Z' }, hop)
  svgEl('path', { class: 'hat', d: 'M-12 3 Q-2 -16 0 -16 Q2 -16 12 3 Q0 7 -12 3 Z' }, hop)
  svgEl('path', { class: 'hat-line', d: 'M-7 -2 Q0 1 7 -2 M-4 -8 Q0 -6 4 -8' }, hop)
  const pinLayer = svgEl('g', { class: 'team-pins' }, layers.marker)
  let pinItems = []

  // ---------- Trạng thái hiển thị ----------
  // view = { current, color, trail: [id], tiles: { id: { owner, color, fog, neighbor, blocked, shielded, scouted } },
  //          storm: region|null, festival: region|null, pins: [{ province, color, text }] }
  let view = { current: null, trail: [], tiles: {} }
  const tileOf = id => view.tiles[id] || {}

  let hopFrom = null // tỉnh vừa rời — arrive() cho nón lá nhảy từ đây sang tỉnh mới

  // Hiệu ứng (map/effects.js) dùng chung phần tử + hàm của bản đồ qua object này.
  // hopping = { from, t } trong lúc nón lá đang nhảy (placeMovers đọc để đặt nón lá trên đường vòng cung).
  const m = {
    svg, wrap, layers, byId, tileEls, lblEls, marker, hop, trail, trailCasing, layoutLabels,
    get view() { return view },
    takeHopFrom() { const from = hopFrom; hopFrom = null; return from },
    // chỉ đặt lại nón lá (khi đang nhảy) — không đụng nhãn / mây: đỡ bắt trình duyệt tính lại cả SVG mỗi khung
    placeMarker() { const px = unitsPerPx(); placeMarker(px, px * labelScale()) },
    get liftEls() { return liftEls },
    shade, tint,
    hopping: null,
  }
  const { burst, tap, capture, lose, pop, shake, arrive, spot } = createEffects(m)
  function render(next) {
    const moved = !!next.current && next.current !== view.current
    if (view.current && moved) hopFrom = view.current
    view = next
    svg.style.setProperty('--team-color', view.color || '#C0392B')
    for (const p of byId.values()) {
      const t = tileOf(p.id)
      const g = tileEls[p.id], l = lblEls[p.id]
      const owned = t.owner === 'mine' || t.owner === 'owned'
      g.classList.toggle('is-mine', t.owner === 'mine')
      g.classList.toggle('is-owned', t.owner === 'owned')
      g.classList.toggle('is-taken', t.owner === 'taken')
      g.classList.toggle('is-current', p.id === view.current)
      g.classList.toggle('is-neighbor', !!t.neighbor && !t.blocked)
      g.classList.toggle('is-blocked', !!t.blocked)
      g.classList.toggle('is-scouted', !!t.scouted)
      g.setAttribute('tabindex', t.neighbor && !t.blocked ? '0' : '-1')
      g.setAttribute('aria-label', `${p.name} – ${p.points} điểm${t.neighbor ? ' – có thể đi' : ''}`)
      if (owned) g.style.setProperty('--tile-color', t.color)
      else g.style.removeProperty('--tile-color')
      l.querySelector('.flag').style.color = owned ? t.color : ''
      l.classList.toggle('is-mine', owned)
      l.classList.toggle('is-taken', t.owner === 'taken')
      l.classList.toggle('is-shielded', !!t.shielded)
      l.classList.toggle('on-color', owned || t.owner === 'taken')
      l.classList.toggle('fogged', !!t.fog)
      // notes: chữ thay dòng điểm dưới tên tỉnh (phòng đơn: "12 người" đã có tem)
      const note = view.notes?.[p.id]
      l.querySelector('.pts').textContent = note ?? `${p.points}đ`
      l.classList.toggle('noted', note != null)
      fogEls[p.id].classList.toggle('off', !t.fog)
      setClouds(p.id, !!t.fog)
      paperEls[p.id].classList.toggle('off', !!t.fog)
      eventFx(stormEls, p, view.storm === p.region, makeStorm)
      eventFx(lanternEls, p, view.festival === p.region, makeLanterns)
    }

    const pts = (view.trail || []).map(id => `${byId.get(id).x},${byId.get(id).y}`).join(' ')
    trail.setAttribute('points', pts)
    trailCasing.setAttribute('points', pts)
    trailStops.replaceChildren()
    for (const id of new Set(view.trail || [])) {
      if (id !== view.current) svgEl('circle', { class: 'trail-stop', cx: byId.get(id).x, cy: byId.get(id).y, r: 3 }, trailStops)
    }

    pinLayer.replaceChildren()
    pinItems = []
    const count = {}
    for (const pin of view.pins || []) {
      const p = byId.get(pin.province)
      if (!p) continue
      const i = count[p.id] = (count[p.id] || 0) + 1
      const g = svgEl('g', { class: 'team-pin' }, pinLayer)
      svgEl('circle', { cx: 0, cy: 0, r: 7, fill: pin.color }, g)
      svgText(g, 0, 3, pin.text, '')
      pinItems.push({ el: g, x: p.x, y: p.y, dx: -30 - (i - 1) * 16, dy: -16 })
    }

    // Về quê (chỉ màn team): ghim hồng trên tỉnh quê của đồng đội. done: đã nhận thưởng; capped: team đã đủ số tỉnh thưởng
    for (const h of view.homes || []) {
      const p = byId.get(h.province)
      if (!p) continue
      const g = svgEl('g', { class: `home-pin${h.done ? ' done' : h.capped ? ' capped' : ''}` }, pinLayer)
      svgEl('path', { d: HOME_PIN_D }, g)
      svgEl('circle', { cx: 0, cy: -1.6, r: 2.4 }, g)
      pinItems.push({ el: g, x: p.x, y: p.y, dx: 24, dy: -12 })
    }

    firstRender = false
    if (moved) liven()
    if (view.current) marker.removeAttribute('hidden')
    else marker.setAttribute('hidden', '')
    renderLift()
    measureLabels()
    layoutLabels()
  }

  // Bão / Lễ hội: chỉ tạo phần tử khi sự kiện đang diễn ra ở miền đó (bản đồ ít phần tử → camera bay nhẹ hơn)
  function makeStorm(p) {
    const s = svgEl('g', { class: 'storm on' }, layers.fx)
    svgEl('path', { class: 'hatch', d: p.d }, s)
    svgEl('use', { class: 'swirl', href: '#i-swirl', x: p.x - 9, y: p.y - 9, width: 18, height: 18 }, s)
    return s
  }
  function makeLanterns(p) {
    const ln = svgEl('g', { class: 'lantern on' }, layers.fx)
    svgEl('use', { href: '#i-lantern', x: p.x - 18, y: p.y - 6, width: 10, height: 10 }, ln)
    svgEl('use', { href: '#i-lantern', x: p.x + 9, y: p.y - 2, width: 9, height: 9, class: 'late' }, ln)
    return ln
  }
  function eventFx(els, p, on, make) {
    if (on && !els[p.id]) els[p.id] = make(p)
    else if (!on && els[p.id]) { els[p.id].remove(); delete els[p.id] }
  }

  // Chạy lại các chuyển động trang trí (nón lá nảy, đường đi chạy, mây nhấp nhô) vài nhịp — xem .map.lively trong css/map.css
  function liven() {
    svg.classList.remove('lively')
    void svg.getBoundingClientRect() // bỏ class rồi thêm lại giữa một lần tính bố cục → animation chạy lại từ đầu
    svg.classList.add('lively')
    // xoáy bão / đèn lồng (css/map.css) cũng chạy lại một lượt
    for (const g of [...Object.values(stormEls), ...Object.values(lanternEls)]) {
      for (const a of g.getAnimations({ subtree: true })) { a.currentTime = 0; a.play() }
    }
  }

  // Mây theo trạng thái sương mù: vừa tan → mây phồng lên, bay vút lên rồi tan; phủ lại → hiện dần
  let firstRender = true
  function setClouds(id, on) {
    const set = cloudSets[id], was = !set.g.classList.contains('off')
    if (on === was) return
    const bobs = set.spots.map(s => s.el.firstChild)
    bobs.forEach(b => b.getAnimations().forEach(a => { if (a.id === 'cloud') a.cancel() }))
    if (on) {
      set.g.classList.remove('off')
      if (!firstRender && !reducedMotion) bobs.forEach(b => { b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, id: 'cloud' }) })
      return
    }
    if (firstRender || reducedMotion) return set.g.classList.add('off')
    const anims = bobs.map((b, i) => b.animate([
      { transform: 'translateY(0) scale(1)', opacity: 1 },
      { transform: 'translateY(-4px) scale(1.15)', opacity: 1, offset: 0.35 },
      { transform: 'translateY(-18px) scale(1.4)', opacity: 0 },
    ], { duration: 750, delay: i * 90, easing: 'ease-in', fill: 'forwards', id: 'cloud' }))
    Promise.all(anims.map(a => a.finished)).then(() => { set.g.classList.add('off'); anims.forEach(a => a.cancel()) }, () => {})
  }

  // ---------- Tỉnh đang đứng nổi khối ----------
  let liftEls = null // { g, walls, raised } — giữ sẵn để mỗi khung hình không phải querySelector
  // Màu thật của tỉnh (giải biến CSS như var(--tile-n)) → nhân độ sáng.
  // Tính sẵn bằng JS thay cho CSS filter brightness(): không phải trình duyệt nào cũng áp CSS filter lên phần tử SVG.
  function shade(color, factor) {
    const v = color.startsWith('var(') ? getComputedStyle(svg).getPropertyValue(color.slice(4, -1)).trim() : color
    const m = /^#?([0-9a-f]{6})$/i.exec(v)
    if (!m) return v
    const n = parseInt(m[1], 16)
    const ch = shift => Math.min(255, Math.round(((n >> shift) & 255) * factor))
    return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
  }

  // Pha màu với trắng (t = 0…1)
  function tint(color, t) {
    const v = color.startsWith('var(') ? getComputedStyle(svg).getPropertyValue(color.slice(4, -1)).trim() : color
    const m = /^#?([0-9a-f]{6})$/i.exec(v)
    if (!m) return v
    const n = parseInt(m[1], 16)
    const ch = shift => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * t)
    return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
  }

  function renderLift() {
    liftEls = null
    layers.lift.replaceChildren()
    if (!view.current) return
    const p = byId.get(view.current)
    const t = tileOf(p.id)
    const fill = t.owner === 'mine' ? t.color : t.owner === 'taken' ? 'var(--taken)' : `var(--tile-${p.region[0]})`
    const wall = shade(fill, 0.6)   // thành khối tối (như brightness(.6) ở mockup)
    const top = tint(fill, 0.45)    // mặt trên sáng hẳn lên + viền vàng (CSS .lift-top) → nổi rõ giữa các tỉnh cùng màu
    // Tỉnh gốc nằm dưới khối nổi (đang nghiêng) lộ ra ở mép → tô cùng màu thành khối cho liền (css/map.css .prov.is-current)
    svg.style.setProperty('--lift-wall', wall)
    const g = svgEl('g', { class: 'lift' }, layers.lift)
    // Mảnh giấy được nhấc lên hơi nghiêng; xoay ở nhóm trong để không đụng hiệu ứng .rise (CSS transform trên g)
    const tilt = svgEl('g', { transform: `rotate(-4 ${p.x} ${p.y})` }, g)
    // Bóng đổ: bản sao tối, lệch xuống (placeMovers đặt độ lệch theo pixel). Không dùng bộ lọc SVG: bộ lọc phải tắt
    // khi camera bay cho nhẹ rồi bật lại → bóng nháy lúc zoom xong; hình tính sẵn thì luôn hiện, gần như không tốn
    const shadow = svgEl('path', { class: 'lift-shadow', d: p.d }, tilt)
    const walls = svgEl('g', { class: 'lift-walls' }, tilt)
    for (let i = 0; i < LIFT_STEPS; i++) {
      const w = svgEl('path', { class: 'lift-wall', d: p.d }, walls)
      w.style.fill = wall
      w.style.stroke = wall
    }
    svgEl('path', { class: 'lift-top', d: p.d }, tilt).style.fill = top
    svgEl('path', { class: 'lift-shine', d: p.d }, tilt)
    liftEls = { g, shadow, walls: [...walls.children], raised: [...g.querySelectorAll('.lift-top, .lift-shine')] }
  }

  // ---------- Xếp nhãn ----------
  // Kích thước khung bản đồ (pixel) — chỉ đo khi đổi cỡ (ResizeObserver). Đo lại ngay sau khi đổi viewBox
  // buộc trình duyệt tính lại bố cục giữa khung hình (layout thrashing) → giật khi camera bay.
  // Đo khung chứa (không đo <svg>: trong lúc camera chuyển động, <svg> mang CSS transform nên khung của nó bị lệch)
  let size = { w: 0, h: 0 }
  function measureSize() {
    size = { w: wrap.clientWidth, h: wrap.clientHeight }
    return size
  }
  const sizeNow = () => (size.w && size.h ? size : measureSize())
  // Khung nhìn của bản đồ trên màn hình (phần trong viền của khung chứa)
  function viewRect() {
    const r = wrap.getBoundingClientRect(), left = r.left + wrap.clientLeft, top = r.top + wrap.clientTop
    return { left, top, width: wrap.clientWidth, height: wrap.clientHeight, right: left + wrap.clientWidth, bottom: top + wrap.clientHeight }
  }
  function unitsPerPx() {
    const { w, h } = sizeNow()
    if (live) return live[2] / (w || 1)
    return w && h ? Math.max(vb.w / w, vb.h / h) : 1
  }
  // Nhãn quan trọng hơn được xếp trước; >= 900 luôn hiện
  function priorityOf(it) {
    if (it.kind === 'archi') return 1000
    if (it.kind === 'sea') return 20
    if (it.kind === 'island') return 10
    const p = it.prov
    if (p.id === view.current) return 950
    const t = tileOf(p.id)
    let pr = 100 + (p.areaKm2 || 0) / 1000
    if (p.isCapital) pr += 400
    else if (p.isCity) pr += 200
    if (t.owner === 'mine') pr += 300
    if (t.neighbor) pr += 250
    return pr
  }
  // Đo khung nhãn (pixel, chưa zoom). Chỉ cần đo lại khi nội dung nhãn đổi.
  function measureLabels() {
    if (!svg.isConnected || !wrap.clientWidth) return
    for (const it of labelItems) {
      it.el.classList.remove('lbl-hidden', 'lbl-compact', 'lbl-abbr')
      it.full = it.el.getBBox()
      const names = it.el.querySelector('.names')
      const badges = it.el.querySelector('.badges')
      it.compact = names ? unionBox(names.getBBox(), badges.getBBox()) : it.full
      if (names) {
        it.el.classList.add('lbl-abbr')
        it.abbr = unionBox(it.el.querySelector('.abbr').getBBox(), badges.getBBox())
        it.el.classList.remove('lbl-abbr')
      }
      it.priority = priorityOf(it)
    }
    labelItems.sort((a, b) => b.priority - a.priority)
  }
  const labelScale = () => Math.min(LABEL_GROW_MAX, Math.max(1, Math.sqrt(BASE.w / (live ? live[2] : vb.w))))

  // Đặt nhãn theo thứ tự ưu tiên: đủ chỗ → đầy đủ; chật → bỏ dòng điểm; chật nữa → tên viết tắt;
  // vẫn chật → ẩn (rê chuột vẫn xem được)
  // Phần nhẹ, chạy mỗi khung hình khi camera bay: dời / co giãn nhãn, nón lá, khối nổi, chấm cờ team.
  // Không đổi class, không kiểm tra chồng chữ, không đụng bộ lọc → trình duyệt không phải tính lại style.
  // Nón lá (vị trí team): trên tỉnh đang đứng (đã nổi khối), hoặc trên đường vòng cung khi đang nhảy sang tỉnh mới
  function placeMarker(px, k) {
    if (!view.current) return
    const cur = byId.get(view.current)
    let mx = cur.x, my = cur.y - LIFT_PX * k
    if (m.hopping) { // đang nhảy từ tỉnh cũ (mặt đất) sang tỉnh mới (đã nổi): đường vòng cung cao ~46px
      const a = byId.get(m.hopping.from), t = m.hopping.t
      mx = a.x + (cur.x - a.x) * t
      my = a.y + (my - a.y) * t - 46 * k * 4 * t * (1 - t)
    }
    marker.style.transform = `translate(${mx}px, ${my}px) scale(${k}) translate(0px, -42px)`
  }
  function placeMovers(px, k) {
    for (const c of trailStops.children) c.setAttribute('r', 4 * k)
    for (const { el, x, y } of stylizedEls) el.setAttribute('transform', `translate(${x} ${y}) scale(${k})`)
    layers.shadow.setAttribute('transform', `translate(0 ${6 * px})`)
    if (view.current) {
      const cur = byId.get(view.current)
      if (liftEls) {
        liftEls.walls.forEach((w, i) => w.setAttribute('transform', `translate(0 ${-(i + 1) * LIFT_PX / (LIFT_STEPS + 1) * k})`))
        for (const el of liftEls.raised) el.setAttribute('transform', `translate(0 ${-LIFT_PX * k})`)
        liftEls.shadow.setAttribute('transform', `translate(${2 * px} ${7 * px})`) // bóng lệch 7px trên màn hình, bất kể zoom
      }
      placeMarker(px, k)
    }
    for (const id in cloudSets) {
      const set = cloudSets[id]
      if (set.g.classList.contains('off')) continue
      for (const c of set.spots) c.el.setAttribute('transform', `translate(${c.x} ${c.y}) scale(${k})`)
    }
    for (const pin of pinItems) pin.el.setAttribute('transform', `translate(${pin.x} ${pin.y}) scale(${k}) translate(${pin.dx} ${pin.dy})`)
    for (const it of labelItems) {
      const y = it.y - (it.prov && it.prov.id === view.current ? LIFT_PX * k : 0)
      it.el.setAttribute('transform', `translate(${it.x} ${y}) scale(${k})`)
    }
  }

  // fast = true: đang bay → chỉ phần nhẹ; xếp nhãn chống chồng chữ, chấm đảo, bộ lọc để lúc bay xong
  function layoutLabels(fast = false) {
    if (!labelItems.length || !labelItems[0].full) return
    const px = unitsPerPx()
    const k = px * labelScale()   // tỉ lệ cho nhãn, biểu tượng, nón lá, độ nổi khối
    placeMovers(px, k)
    if (fast) return
    const GAP = 2
    for (const c of layers.tiles.querySelectorAll('.islet')) c.setAttribute('r', 1.8 * px)
    // Mây phụ của tỉnh lớn: chỉ hiện khi tỉnh đủ rộng trên màn hình (xem cả nước thì 1 đám/tỉnh cho đỡ rối)
    for (const id in cloudSets) {
      const wide = byId.get(id).box.w / px > 230
      for (const c of cloudSets[id].spots) if (!c.main) c.el.classList.toggle('far', !wide)
    }
    const placed = []
    const boxAt = (x, y, b) => ({
      x0: x + (b.x - GAP) * k, y0: y + (b.y - GAP) * k,
      x1: x + (b.x + b.width + GAP) * k, y1: y + (b.y + b.height + GAP) * k,
    })
    const hits = bx => placed.some(o => bx.x0 < o.x1 && bx.x1 > o.x0 && bx.y0 < o.y1 && bx.y1 > o.y0)

    if (view.current) {
      const cur = byId.get(view.current)
      if (liftEls) liftEls.g.style.setProperty('--rise-from', `${LIFT_PX * k}px`)
      placed.push(boxAt(cur.x, cur.y - LIFT_PX * k, { x: -14, y: -60, width: 28, height: 26 }))
    }
    for (const pin of pinItems) placed.push(boxAt(pin.x, pin.y, { x: pin.dx - 7, y: pin.dy - 7, width: 14, height: 14 }))
    for (const it of labelItems) {
      const y = it.y - (it.prov && it.prov.id === view.current ? LIFT_PX * k : 0)
      let mode = 'full'
      let bx = boxAt(it.x, y, it.full)
      if (it.priority < 900 && hits(bx)) {
        mode = 'compact'
        bx = boxAt(it.x, y, it.compact)
        if (hits(bx) && it.abbr) {
          mode = 'abbr'
          bx = boxAt(it.x, y, it.abbr)
        }
        if (hits(bx)) mode = 'hidden'
      }
      it.el.classList.toggle('lbl-compact', mode === 'compact')
      it.el.classList.toggle('lbl-abbr', mode === 'abbr')
      it.el.classList.toggle('lbl-hidden', mode === 'hidden')
      if (mode !== 'hidden') placed.push(bx)
    }
  }
  new ResizeObserver(() => {
    measureSize()
    if (!labelItems[0]?.full) measureLabels()
    layoutLabels()
  }).observe(svg)

  // ---------- Zoom & kéo ----------
  function setVB(fast = false) {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
    layoutLabels(fast)
  }
  function zoomTo(id, size = 0.35) {
    const p = byId.get(id)
    if (!p) return Promise.resolve()
    const { w, h } = sizeNow()
    return flyTo([p.x, p.y, Math.max(BASE.w * size, (BASE.h * size * w) / (h || 1))])
  }
  function zoomReset() {
    return flyTo(baseCamera())
  }

  // ---------- Camera bay (flyTo) ----------
  // Camera = [tâm x, tâm y, bề rộng nhìn thấy] (đơn vị bản đồ).
  // Trong lúc camera CHUYỂN ĐỘNG (bay, zoom, cuộn, kéo) không đổi viewBox mỗi khung: đổi viewBox buộc trình duyệt tính lại
  // bố cục cả SVG (~2,5 ms/khung, giật trên máy yếu / màn Retina). Thay vào đó giữ nguyên viewBox lúc bắt đầu và dời / phóng
  // cả thẻ <svg> bằng CSS transform (chỉ vẽ lại, không tính bố cục; vẫn vẽ vector nên không nhoè). Nhãn, nón lá, mây vẫn
  // đặt lại mỗi khung để giữ cỡ trên màn hình. Dừng (setFlying(false)) mới đặt viewBox thật một lần + xếp nhãn đầy đủ.
  function camera() {
    if (live) return live
    // viewBox dùng "meet" nên bề rộng thật nhìn thấy là chiều lớn hơn sau khi quy về tỉ lệ khung
    const { w, h } = sizeNow()
    return [vb.x + vb.w / 2, vb.y + vb.h / 2, Math.max(vb.w, (vb.h * w) / (h || 1))]
  }
  function vbOf([cx, cy, width]) {
    const { w, h } = sizeNow()
    const height = (width * h) / (w || 1)
    return { x: cx - width / 2, y: cy - height / 2, w: width, h: height }
  }
  function setCamera(c, fast = false) {
    if (!fast) {
      live = null
      svg.style.transform = ''
      svg.classList.remove('moving', 'movers-off')
      vb = vbOf(c)
      return setVB()
    }
    if (!live) {
      // bắt đầu chuyển động: chuẩn hóa viewBox đúng tỉ lệ khung (bỏ phần "meet" thừa) rồi giữ nguyên nó
      vb = vbOf(camera())
      svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
      svg.classList.add('moving')
    }
    live = c
    const target = vbOf(c), s = sizeNow().w / target.w // pixel / đơn vị bản đồ của camera đích
    svg.style.transform = `translate(${(vb.x - target.x) * s}px, ${(vb.y - target.y) * s}px) scale(${vb.w / target.w})`
    // KHÔNG đặt lại nhãn / mây / nón lá ở đây: bất kỳ thay đổi nào bên trong SVG cũng buộc tính lại bố cục + vẽ lại cả bản đồ
    // (đo: ~240 → ~40 ms/giây luồng chính khi bay). Chúng co giãn theo bản đồ; zoom quá ~1,35 lần thì ẩn nhãn / mây
    // cho đỡ méo, dừng lại mới đặt đúng cỡ và hiện lại (setFlying(false))
    svg.classList.toggle('movers-off', Math.abs(Math.log(vb.w / target.w)) > 0.3)
  }
  // Kết thúc chuyển động: đặt viewBox thật theo camera đang sống, bỏ CSS transform
  function commitCamera() {
    if (!live) return
    const c = live
    live = null
    svg.style.transform = ''
    svg.classList.remove('moving')
    vb = vbOf(c)
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
  }

  // Bay tới camera đích. Bay mới / người dùng kéo-cuộn giữa chừng → dừng tại chỗ, bay tiếp từ vị trí hiện tại.
  let flight = null
  // Trong lúc bay: tắt bộ lọc bóng đổ của khối nổi + tạm dừng hiệu ứng chạy liên tục (class .flying);
  // bay xong mới xếp nhãn đầy đủ một lần
  function setFlying(on) {
    svg.classList.toggle('flying', on)
    if (!on) {
      commitCamera()
      layoutLabels()
      svg.classList.remove('movers-off')
    }
  }
  function stopFlight() {
    if (!flight) return
    cancelAnimationFrame(flight.raf)
    flight.resolve()
    flight = null
    setFlying(false)
  }
  // Chạy lần lượt các chặng camera [{ ms, at: t → camera }] trong một vòng requestAnimationFrame
  function runCamera(legs, target) {
    stopFlight()
    cancelWheel()
    if (reducedMotion || !measureSize().w) { // giảm chuyển động / khung chưa hiện: đặt thẳng
      setCamera(target)
      return Promise.resolve()
    }
    setFlying(true)
    return new Promise(resolve => {
      let i = 0, t0 = performance.now()
      const step = ts => {
        const leg = legs[i]
        const t = Math.min(1, (ts - t0) / leg.ms)
        setCamera(leg.at(t), true) // khung cuối: setFlying(false) xếp nhãn đầy đủ một lần
        if (t >= 1 && ++i < legs.length) t0 = ts
        if (i < legs.length) flight.raf = requestAnimationFrame(step)
        else { setCamera(target, true); flight = null; setFlying(false); resolve() }
      }
      flight = { resolve, raf: requestAnimationFrame(step) }
    })
  }
  // "Bay nảy" (PLAN 5.2, mockup/animations.html ô 15): lấy đà (lùi ra ~7%) → bay → phóng quá đích ~12% rồi bật lại như lò xo
  function flyTo(target, { minMs = 450, maxMs = 1050 } = {}) {
    measureSize() // đo một lần trước khi bay
    const from = camera()
    const [tx, ty, tw] = target
    const path = zoomPath([from[0], from[1], from[2] * 1.07], [tx, ty, tw * 0.88])
    const ms = Math.min(maxMs, Math.max(minMs, path.duration))
    return runCamera([
      { ms: 160, at: t => [from[0], from[1], from[2] * (1 + 0.07 * Math.sin(t * Math.PI / 2))] },
      { ms, at: t => path(easeInOut(t)) },
      { ms: 520, at: u => [tx, ty, tw * (1 - 0.12 * Math.exp(-5 * u) * Math.cos(9 * u))] },
    ], target)
  }
  // Nút + / −: zoom quanh tâm khung, giảm tốc dần (không vượt đích — nảy chỉ dùng khi bay tới tỉnh)
  function zoomAnimated(f) {
    measureSize()
    const [cx, cy, w0] = camera()
    const w1 = clampWidth(w0 * f)
    // nội suy theo thang logarit: phóng to / thu nhỏ trông đều tốc độ
    return runCamera([{ ms: 320, at: u => [cx, cy, w0 * (w1 / w0) ** (1 - (1 - u) ** 3)] }], [cx, cy, w1])
  }
  const clampWidth = w => Math.min(Math.max(w, BASE.w * 0.2), BASE.w * 1.5)
  const baseCamera = () => {
    const { w, h } = sizeNow()
    return [BASE.x + BASE.w / 2, BASE.y + BASE.h / 2, Math.max(BASE.w, (BASE.h * w) / (h || 1))]
  }

  // Làm nổi một tỉnh: các tỉnh khác mờ đi
  let focusId = null
  function setFocus(id) {
    if (focusId) {
      tileEls[focusId].classList.remove('is-focus')
      lblEls[focusId].classList.remove('is-focus')
    }
    focusId = id
    svg.classList.toggle('focusing', !!id)
    if (id) {
      tileEls[id].classList.add('is-focus')
      lblEls[id].classList.add('is-focus')
    }
  }

  // Bay tới tỉnh, đặt tỉnh giữa vùng còn trống bên trái (bên phải để khung câu hỏi trượt vào).
  // reserveRight: số pixel tính từ mép phải cửa sổ sẽ bị khung câu hỏi che.
  // reserveBottom: tương tự, số pixel tính từ mép dưới (điện thoại: khung câu hỏi trượt lên từ đáy).
  function focusOn(id, { reserveRight = 0, reserveBottom = 0 } = {}) {
    const p = byId.get(id)
    if (!p) return Promise.resolve()
    setFocus(id)
    const r = viewRect()
    const freeW = Math.max(200, Math.min(r.right, innerWidth - reserveRight) - r.left)
    const freeH = Math.max(140, Math.min(r.bottom, innerHeight - reserveBottom) - r.top)
    const pad = Math.min(70, freeW / 6, freeH / 6)
    const b = p.box
    // đơn vị bản đồ / pixel: vừa khít tỉnh trong vùng trống; không phóng quá ~10% bề rộng cả nước
    const k = Math.max(b.w / (freeW - pad * 2), b.h / (freeH - pad * 2), (BASE.w * 0.12) / r.width)
    const cx = b.x + b.w / 2 + (r.width / 2 - freeW / 2) * k
    const cy = b.y + b.h / 2 + (r.height / 2 - freeH / 2) * k - LIFT_PX * k * 0.5 // bù độ nổi khối để tỉnh nằm giữa theo mắt nhìn
    return flyTo([cx, cy, k * r.width])
  }

  // Bỏ làm nổi, bay về khung nhìn quanh tỉnh đang đứng
  function unfocus() {
    const id = view.current || focusId
    setFocus(null)
    const p = id && byId.get(id)
    if (!p) return Promise.resolve()
    const r = viewRect()
    return flyTo([p.x, p.y, Math.max(BASE.w * 0.35, (BASE.h * 0.35 * r.width) / (r.height || 1))], { maxMs: 800 })
  }
  zoomBtn('Phóng to', '+', () => zoomAnimated(1 / 1.3))
  zoomBtn('Thu nhỏ', '−', () => zoomAnimated(1.3))
  zoomBtn('Xem toàn bộ', '⟲', zoomReset)
  zoomBtn('Về vị trí của team', icon('hat'), () => view.current && zoomTo(view.current))

  // Cuộn chuột / vuốt trackpad / chụm hai ngón: hệ số zoom theo ĐỘ LỚN cú cuộn (trackpad macOS gửi rất nhiều sự kiện nhỏ —
  // trước đây mỗi sự kiện zoom cố định 15% nên nhảy giật), giữ điểm dưới con trỏ đứng yên, trượt mượt tới đích trong
  // vòng requestAnimationFrame ở chế độ nhẹ; ngừng cuộn 150ms mới xếp nhãn đầy đủ một lần.
  let wheel = null // { target: camera đích, rect, raf, idle }
  svg.addEventListener('wheel', e => {
    e.preventDefault()
    if (flight) stopFlight()
    if (!wheel) {
      measureSize()
      wheel = { target: camera(), rect: viewRect(), raf: 0, idle: 0 }
      setFlying(true)
    }
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
    const dy = Math.max(-240, Math.min(240, e.deltaY * unit))
    const f = Math.exp(dy * (e.ctrlKey ? 0.01 : 0.002)) // ctrlKey: chụm hai ngón trên trackpad (delta nhỏ hơn)
    const [tx, ty, tw] = wheel.target, w1 = clampWidth(tw * f), r = w1 / tw
    // điểm bản đồ dưới con trỏ (theo camera đích) giữ nguyên chỗ trên màn hình
    const { rect } = wheel, th = tw * rect.height / rect.width
    const ux = tx - tw / 2 + (e.clientX - rect.left) / rect.width * tw
    const uy = ty - th / 2 + (e.clientY - rect.top) / rect.height * th
    wheel.target = [ux + (tx - ux) * r, uy + (ty - uy) * r, w1]
    if (!wheel.raf) wheel.raf = requestAnimationFrame(wheelStep)
    clearTimeout(wheel.idle)
    wheel.idle = setTimeout(endWheel, 150)
  }, { passive: false })
  function wheelStep() {
    if (!wheel) return
    const [cx, cy, cw] = camera(), [tx, ty, tw] = wheel.target
    const k = 0.35 // mỗi khung đi 35% quãng còn lại → mượt, đuổi kịp nhanh
    const w = cw * (tw / cw) ** k
    setCamera([cx + (tx - cx) * k, cy + (ty - cy) * k, w], true)
    wheel.raf = Math.abs(w / tw - 1) > 0.002 || Math.hypot(tx - cx, ty - cy) > tw * 0.001 ? requestAnimationFrame(wheelStep) : 0
  }
  // Camera bay / kéo bản đồ bắt đầu giữa lúc đang cuộn: dừng phần trượt của cuộn, xếp nhãn theo chỗ đang đứng
  function cancelWheel() {
    if (!wheel) return
    cancelAnimationFrame(wheel.raf)
    clearTimeout(wheel.idle)
    wheel = null
    setFlying(false)
  }
  function endWheel() {
    if (!wheel) return
    if (wheel.raf) return (wheel.idle = setTimeout(endWheel, 60)) // còn đang trượt: chờ tới đích
    setCamera(wheel.target, true)
    wheel = null
    setFlying(false)
  }

  let pan = null
  let dragged = false
  // Điện thoại / máy tính bảng: chụm hai ngón để phóng to / thu nhỏ, giữ điểm giữa hai ngón đứng yên
  const touches = new Map()
  let pinch = null
  const midOf = () => {
    const [a, b] = [...touches.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }
  }
  svg.addEventListener('pointerdown', e => {
    stopFlight()
    cancelWheel()
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.size === 2) {
      // ngón thứ hai chạm: bỏ kéo, chuyển sang chụm
      if (pan && dragged) commitCamera()
      pan = null
      dragged = true
      measureSize()
      pinch = { ...midOf(), cam: camera(), rect: viewRect() }
      for (const id of touches.keys()) try { svg.setPointerCapture(id) } catch {}
      setFlying(true)
      return
    }
    if (touches.size > 2) return
    dragged = false
    pan = { x: e.clientX, y: e.clientY, cam: camera(), id: e.pointerId }
  })
  svg.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch && touches.size >= 2) {
      const m = midOf(), { rect, cam: [x0, y0, w0] } = pinch
      const w1 = clampWidth(w0 * pinch.d / m.d)
      const h0 = w0 * rect.height / rect.width, h1 = w1 * rect.height / rect.width
      // điểm bản đồ dưới tâm hai ngón lúc bắt đầu → nằm dưới tâm hai ngón hiện tại
      const ux = x0 - w0 / 2 + (pinch.x - rect.left) / rect.width * w0
      const uy = y0 - h0 / 2 + (pinch.y - rect.top) / rect.height * h0
      setCamera([ux - (m.x - rect.left) / rect.width * w1 + w1 / 2, uy - (m.y - rect.top) / rect.height * h1 + h1 / 2, w1], true)
      return
    }
    if (!pan) return
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y
    if (!dragged && Math.hypot(dx, dy) < 4) return
    if (!dragged) {
      dragged = true
      svg.setPointerCapture(pan.id)
      svg.classList.add('dragging')
      // Đang kéo: chế độ nhẹ như camera bay (CSS transform, chỉ dời nhãn); thả tay mới đặt viewBox + xếp nhãn đầy đủ
      pan.scale = pan.cam[2] / (sizeNow().w || 1) // đơn vị bản đồ / pixel
      setFlying(true)
    }
    const [cx, cy, w] = pan.cam
    setCamera([cx - dx * pan.scale, cy - dy * pan.scale, w], true)
  })
  const endPan = e => {
    touches.delete(e.pointerId)
    if (pinch) {
      if (touches.size >= 2) return
      pinch = null
      setFlying(false)
    }
    if (pan && dragged) setFlying(false)
    pan = null
    svg.classList.remove('dragging')
    setTimeout(() => { dragged = false }, 0)
  }
  svg.addEventListener('pointerup', endPan)
  svg.addEventListener('pointercancel', endPan)

  // ---------- Chọn tỉnh (chuột / bàn phím) ----------
  svg.addEventListener('click', e => {
    if (dragged) return
    const g = e.target.closest('.prov.is-neighbor')
    if (g) { tap(g.dataset.id); onSelect(g.dataset.id) }
  })
  svg.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const g = e.target.closest('.prov.is-neighbor')
    if (g) {
      e.preventDefault()
      onSelect(g.dataset.id)
    }
  })

  attachTooltip({ svg, wrap, tip, byId, tileOf, tipExtra, isDragging: () => dragged })

  setVB()
  return { byId, adjacency, render, zoomTo, zoomReset, focusOn, unfocus, burst, pop, shake, capture, lose, arrive, spot, svg, wrap }
}

// Phòng đơn: bản đồ nhiệt "cả phòng đang đi đâu" — tỉnh càng nhiều người có tem càng xanh đậm (không lộ là ai).
// heat: { tỉnh: số người } → tiles cho render()
export function heatTiles(heat) {
  const max = Math.max(1, ...Object.values(heat ?? {}))
  return Object.fromEntries(Object.entries(heat ?? {}).filter(([, n]) => n > 0)
    .map(([id, n]) => [id, { owner: 'owned', color: `hsl(100 55% ${Math.round(82 - 42 * (n / max))}%)` }]))
}

// Số người có tem ghi dưới tên tỉnh (render({ notes })) — tỉnh chưa ai tới vẫn ghi điểm
export const heatNotes = heat => Object.fromEntries(Object.entries(heat ?? {}).filter(([, n]) => n > 0).map(([id, n]) => [id, `${n} người`]))
