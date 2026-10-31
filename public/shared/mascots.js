// Icon linh vật 8 team — tự vẽ SVG (không thư viện, không emoji). Huy hiệu tròn màu team + hình trắng,
// để người mù màu vẫn phân biệt team bằng hình (mục 5.7). viewBox 0 0 24 24, nét trắng bo tròn.

const NS = 'http://www.w3.org/2000/svg'

// Bờm lân: hình tròn viền gợn sóng (n múi)
function scallop(cx, cy, r, n, bump) {
  let d = ''
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
    if (i === 0) { d += `M${x.toFixed(2)} ${y.toFixed(2)}`; continue }
    const am = a - Math.PI / n
    const qx = cx + (r + bump) * Math.cos(am), qy = cy + (r + bump) * Math.sin(am)
    d += `Q${qx.toFixed(2)} ${qy.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return `${d}Z`
}

// Mỗi linh vật: danh sách [thẻ, thuộc tính]. Mặc định: nét trắng, không tô.
// fill/stroke = 'w' (trắng) hoặc 'bg' (màu team — dùng để khoét chi tiết lên hình trắng).
const GLYPHS = {
  // Rồng: thân uốn lượn có vây lưng, đầu há miệng, hai sừng
  'Rồng': [
    ['path', { d: 'M3 17.4c2.4-4.6 5-5 6.6-2.2s4.4 2.8 5.8-1.6', 'stroke-width': 2.6 }],
    ['path', { d: 'M5 13.8l.4-2.8 1.8 1.6zM8.2 12.2l1-2.6 1.2 2.2zM13.4 15l1.6-2 .4 2.4z', fill: 'w' }],
    ['path', { d: 'M14.2 13.2c-.4-2.4 1.2-4.2 3.4-4.2l3.6 1.4-2.4.8 2.6 1.4-3.2.6c-1.2.6-3.6 1-4 0z', fill: 'w' }],
    ['path', { d: 'M15.8 9.6l-1-2.8M17.4 9.2l.4-2.8' }],
    ['circle', { cx: 16.6, cy: 11.2, r: 0.7, fill: 'bg' }],
  ],
  // Lân: đầu lân nhìn thẳng — bờm gợn sóng, mắt to, miệng rộng, sừng trên trán
  'Lân': [
    ['path', { d: scallop(12, 12.8, 8, 11, 1.6), fill: 'w' }],
    ['circle', { cx: 12, cy: 13, r: 5.4, fill: 'bg' }],
    ['path', { d: 'M12 1.6l1.4 3.4h-2.8z', fill: 'w' }],
    ['circle', { cx: 9.8, cy: 11.8, r: 1.6, fill: 'w' }],
    ['circle', { cx: 14.2, cy: 11.8, r: 1.6, fill: 'w' }],
    ['path', { d: 'M9 15.2q3 2.8 6 0', 'stroke-width': 1.8 }],
  ],
  // Rùa: nhìn nghiêng — mai tròn có vân, đầu, chân
  'Rùa': [
    ['path', { d: 'M4.4 15c0-4 3.2-6.8 7.2-6.8s7.2 2.8 7.2 6.8z', fill: 'w' }],
    ['path', { d: 'M9.2 9.2l-1 5.8M14 9.2l1 5.8M5 12.4h13.2', stroke: 'bg', 'stroke-width': 1.2 }],
    ['circle', { cx: 20.4, cy: 13.4, r: 1.9, fill: 'w' }],
    ['circle', { cx: 21, cy: 13, r: 0.5, fill: 'bg' }],
    ['path', { d: 'M6.8 15.4l-.8 2.8M16.4 15.4l.8 2.8', 'stroke-width': 2.2 }],
  ],
  // Phượng: chim đang bay — cánh vút lên, mào, đuôi dài cong
  'Phượng': [
    ['path', { d: 'M8.6 11C8 7.6 10 4.8 13.6 4c-.6 2.6 0 4.8 1.6 6.4z', fill: 'w' }],
    ['path', { d: 'M6.4 11.6c2.6-1.6 6.6-1.6 10-1 1.2.2 2.2-.2 3-1l2 .6-1.8 1c-1.6 1.8-5.6 2.6-9 2-1.6-.2-3-.6-4.2-1.6z', fill: 'w' }],
    ['path', { d: 'M9.6 13c-1.2 2.8-3.2 4.8-6.2 5.6M11.6 13.4c-.6 3.2-2.2 5.6-4.8 7M13.4 13.4c.2 3-.6 5.6-2.4 7.4' }],
    ['path', { d: 'M19 9.4l.4-2M19.8 9.6l1.2-1.6' }],
    ['circle', { cx: 19.2, cy: 10.4, r: 0.5, fill: 'bg' }],
  ],
  // Hạc: đứng nghiêng — thân, cổ dài cong, mỏ dài, chân cao
  'Hạc': [
    ['path', { d: 'M9 13c0-2.4 2-3.4 4.4-3 2.6.4 5.2 2 6.2 4.2-2.6.4-4.6.8-6.6.6-2.4-.2-4-.4-4-1.8z', fill: 'w' }],
    ['path', { d: 'M10 11.6C8.6 9.6 8.4 7 10 5.2', 'stroke-width': 1.8 }],
    ['circle', { cx: 10.6, cy: 4.8, r: 1.4, fill: 'w' }],
    ['path', { d: 'M11.6 4.6l3.8.8' }],
    ['path', { d: 'M13.2 14.8l-.4 5.6M15 14.8l.8 5.6' }],
  ],
  // Trâu: đầu trâu với cặp sừng cong lớn
  'Trâu': [
    ['path', { d: 'M8.4 10.6h7.2v4.6c0 2-1.6 3.6-3.6 3.6s-3.6-1.6-3.6-3.6z', fill: 'w' }],
    ['path', { d: 'M8.4 10.8C5.4 10.6 3.6 8.6 3.8 5.8M15.6 10.8c3-.2 4.8-2.2 4.6-5', 'stroke-width': 2 }],
    ['circle', { cx: 10.4, cy: 13, r: 0.8, fill: 'bg' }],
    ['circle', { cx: 13.6, cy: 13, r: 0.8, fill: 'bg' }],
    ['path', { d: 'M10.6 16.4h2.8', stroke: 'bg', 'stroke-width': 1.2 }],
  ],
  // Voi: nhìn nghiêng — thân, tai lớn, vòi cong
  'Voi': [
    ['path', { d: 'M4.6 17.8v-5.6C4.6 9 7 6.8 10.4 6.8h3c3.2 0 5.4 2.2 5.4 5.2v1.6c0 1.4.8 2.2 2 2.2v1.6c-2.4.2-4-1.4-4-3v3.4h-3.2v-2.4H9.2v2.4z', fill: 'w' }],
    ['path', { d: 'M12.8 8c-2 .4-2.8 2-2.6 3.8.2 1.4 1.4 2.2 3 2', stroke: 'bg', 'stroke-width': 1.4 }],
    ['circle', { cx: 15.8, cy: 10.2, r: 0.7, fill: 'bg' }],
  ],
  // Hổ: mặt hổ nhìn thẳng — tai tròn, vằn trán và má, mũi
  'Hổ': [
    ['circle', { cx: 7, cy: 7.4, r: 2.2, fill: 'w' }],
    ['circle', { cx: 17, cy: 7.4, r: 2.2, fill: 'w' }],
    ['path', { d: 'M5.2 13c0-4.2 3-6.4 6.8-6.4s6.8 2.2 6.8 6.4c0 3.8-3 6.4-6.8 6.4s-6.8-2.6-6.8-6.4z', fill: 'w' }],
    ['path', { d: 'M12 7.2v2.4M9.6 7.6l.8 1.8M14.4 7.6l-.8 1.8M5.6 12.2h2.2M5.8 14.8h2M18.4 12.2h-2.2M18.2 14.8h-2', stroke: 'bg', 'stroke-width': 1.2 }],
    ['circle', { cx: 9.6, cy: 12, r: 1, fill: 'bg' }],
    ['circle', { cx: 14.4, cy: 12, r: 1, fill: 'bg' }],
    ['path', { d: 'M10.8 14.6h2.4L12 16z', fill: 'bg' }],
    ['path', { d: 'M12 16v1M10.6 17.6c.8.6 2 .6 2.8 0', stroke: 'bg', 'stroke-width': 1 }],
  ],
}

// Màu thật của một giá trị 'w' / 'bg'
const paint = (v, color) => (v === 'w' ? '#fff' : v === 'bg' ? color : v)

/** Huy hiệu linh vật: vòng tròn màu team + hình trắng. size: pixel. */
export function mascotIcon(mascot, color, size = 22) {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', size)
  svg.setAttribute('height', size)
  svg.setAttribute('class', 'mascot-icon')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', mascot)
  const bg = document.createElementNS(NS, 'circle')
  bg.setAttribute('cx', 12)
  bg.setAttribute('cy', 12)
  bg.setAttribute('r', 12)
  bg.setAttribute('fill', color)
  svg.append(bg)
  const g = document.createElementNS(NS, 'g')
  g.setAttribute('fill', 'none')
  g.setAttribute('stroke', '#fff')
  g.setAttribute('stroke-width', '1.6')
  g.setAttribute('stroke-linecap', 'round')
  g.setAttribute('stroke-linejoin', 'round')
  // Phòng đơn: không có linh vật — mascot là chữ cái đầu của tên (avatar chữ)
  if (!GLYPHS[mascot] && mascot) {
    const t = document.createElementNS(NS, 'text')
    for (const [k, v] of Object.entries({ x: 12, y: 16.5, 'text-anchor': 'middle', fill: '#fff', 'font-size': 13, 'font-weight': 900 })) t.setAttribute(k, v)
    t.textContent = mascot
    svg.append(t)
    return svg
  }
  for (const [tag, attrs] of GLYPHS[mascot] ?? []) {
    const e = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, k === 'fill' || k === 'stroke' ? paint(v, color) : v)
    if (attrs.fill && !attrs.stroke) e.setAttribute('stroke', 'none') // hình tô đặc thì không viền
    g.append(e)
  }
  svg.append(g)
  return svg
}

export const MASCOTS = Object.keys(GLYPHS)
