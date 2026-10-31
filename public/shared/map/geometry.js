// Bản đồ: hàm hình học + tạo phần tử SVG (không phụ thuộc trạng thái bản đồ).

export const NS = 'http://www.w3.org/2000/svg'

export function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  if (parent) parent.appendChild(el)
  return el
}
export function svgText(parent, x, y, text, cls) {
  const t = svgEl('text', { x, y, class: cls }, parent)
  t.textContent = text
  return t
}
export function starPoints(cx, cy, outer, inner) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer
    const a = Math.PI / 5 * i - Math.PI / 2
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
}
// "M…Z" → danh sách vòng, mỗi vòng là mảng [x, y]
export const rings = d => d.split('M').filter(Boolean)
  .map(seg => seg.replace('Z', '').split('L').map(xy => xy.split(',').map(Number)))
// Điểm (x, y) có nằm trong vòng đa giác pts không (tia ngang)
export function inRing(pts, x, y) {
  let c = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
export const ringSize = pts => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}
// Nét vẽ tay: viền tỉnh hơi run, tính MỘT lần lúc tạo bản đồ (không dùng bộ lọc → camera bay không bị ảnh hưởng).
// Độ lệch là hàm mượt theo vị trí → điểm chung của hai tỉnh lệch như nhau, ranh giới vẫn khít. Bản tham chiếu: mockup/hand-drawn.html (A+B ②).
export const WOBBLE = 1.3
export const noise = (x, y, s) => Math.sin(x * .11 + s) * Math.cos(y * .13 + s * 1.7) + .6 * Math.sin((x - y) * .23 + s * 2.3) + .25 * Math.sin(x * 1.3 + y * .9 + s)
export const wobble = (d, seed = 1) => rings(d).map(pts => {
  const amp = Math.min(WOBBLE, ringSize(pts) * .06)  // đảo nhỏ run ít để không méo
  return 'M' + pts.map(([x, y]) => `${(x + amp * noise(x, y, seed)).toFixed(1)},${(y + amp * noise(y + 7, x - 3, seed + 4)).toFixed(1)}`).join('L') + 'Z'
}).join('')
// Đường biên mềm như nét bút: nối các điểm bằng đường cong Catmull-Rom (đi qua đúng từng điểm) thay cho đoạn thẳng gãy góc.
// Đoạn cong giữa hai điểm chỉ phụ thuộc 4 điểm liền nhau và đối xứng khi đi ngược chiều → hai tỉnh chung ranh giới
// vẽ ra cùng một đường cong (khít, không hở), chỉ lệch rất nhỏ ở đoạn sát ngã ba ranh giới. Tính một lần lúc tạo bản đồ.
export function smoothRings(rs) {
  const k = 1 / 6, f = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`
  return rs.map(pts => {
    const n = pts.length
    if (n < 4) return `M${pts.map(f).join('L')}Z` // đảo tí hon: giữ đa giác
    const P = i => pts[(i + n) % n]
    let d = `M${f(P(0))}`
    for (let i = 0; i < n; i++) {
      const [a, b, c, e] = [P(i - 1), P(i), P(i + 1), P(i + 2)]
      d += `C${f([b[0] + (c[0] - a[0]) * k, b[1] + (c[1] - a[1]) * k])} ${f([c[0] - (e[0] - b[0]) * k, c[1] - (e[1] - b[1]) * k])} ${f(c)}`
    }
    return `${d}Z`
  }).join('')
}
// Tên viết tắt khi thiếu chỗ (D4): chữ cái đầu mỗi từ — "Hưng Yên" → "HY", "TP. Hồ Chí Minh" → "HCM";
// tên một từ ("Huế") giữ nguyên. Rê chuột vẫn xem được tên đầy đủ.
export const abbrOf = name => {
  const words = name.replace(/^TP\.\s*/, '').split(/\s+/)
  return words.length > 1 ? words.map(w => w[0].toUpperCase()).join('') : words[0]
}

export const unionBox = (a, b) => {
  if (!b.width && !b.height) return a
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}

/**
 * Tạo bản đồ trong phần tử `wrap`.
 * provinces: danh sách từ /api/provinces. onSelect(id): bấm/Enter vào tỉnh có thể đi.
 * tipExtra(id): thêm dòng vào tooltip (tùy màn hình).
 */
