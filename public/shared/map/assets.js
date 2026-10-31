// Bản đồ: dữ liệu tĩnh — tên miền, tên biển, đảo, quần đảo, hằng số độ nổi / nhãn, <defs> SVG, hình đám mây.

export const REGION_NAME = { north: 'Miền Bắc', central: 'Miền Trung', south: 'Miền Nam' }

// Tên vùng biển (không vẽ nước láng giềng, không vẽ nền biển)
export const SEA_TEXT = [
  { text: 'Vịnh Bắc Bộ', lon: 107.4, lat: 19.5, small: true },
  { text: 'BIỂN ĐÔNG', lon: 113.0, lat: 13.2 },
  { text: 'Vịnh Thái Lan', lon: 102.6, lat: 8.2, small: true },
]
// Vị trí nhãn các đảo ven bờ (hình đảo lấy từ dữ liệu; đảo không có hình thì không ghi tên)
export const ISLANDS = [
  { name: 'Cô Tô', owner: 'TP. Quảng Ninh', lon: 107.77, lat: 20.98 },
  { name: 'Vân Đồn', owner: 'TP. Quảng Ninh', lon: 107.47, lat: 21.02 },
  { name: 'Cát Bà', owner: 'TP. Hải Phòng', lon: 107.05, lat: 20.76 },
  { name: 'Bạch Long Vĩ', owner: 'TP. Hải Phòng', lon: 107.73, lat: 20.13 },
  { name: 'Hòn Mê', owner: 'tỉnh Thanh Hóa', lon: 105.93, lat: 19.37 },
  { name: 'Cồn Cỏ', owner: 'tỉnh Quảng Trị', lon: 107.34, lat: 17.16 },
  { name: 'Cù Lao Chàm', owner: 'TP. Đà Nẵng', lon: 108.53, lat: 15.95 },
  { name: 'Lý Sơn', owner: 'tỉnh Quảng Ngãi', lon: 109.12, lat: 15.38 },
  { name: 'Phú Quý', owner: 'tỉnh Lâm Đồng', lon: 108.93, lat: 10.52 },
  { name: 'Côn Đảo', owner: 'TP. Hồ Chí Minh', lon: 106.6, lat: 8.69 },
  { name: 'Phú Quốc', owner: 'tỉnh An Giang', lon: 103.97, lat: 10.23 },
  { name: 'Nam Du', owner: 'tỉnh An Giang', lon: 104.35, lat: 9.68 },
  { name: 'Thổ Chu', owner: 'tỉnh An Giang', lon: 103.47, lat: 9.3 },
  { name: 'Hòn Khoai', owner: 'tỉnh Cà Mau', lon: 104.83, lat: 8.43 },
]
// Đảo có ý nghĩa nhưng quá nhỏ để vẽ đúng hình: hình cách điệu, cỡ cố định trên màn hình
export const STYLIZED_ISLANDS = [{ name: 'Bạch Long Vĩ', province: 'hai-phong', lon: 107.73, lat: 20.13 }]
export const STYLIZED_ISLAND_D = 'M-6,-2 Q-3,-7 3,-5 Q7,-3 6,1 Q5,5 0,5 Q-4,5 -6,2 Q-7,0 -6,-2 Z'
// Hoàng Sa, Trường Sa: bắt buộc thể hiện (chấm tượng trưng + khung + nhãn)
export const ARCHIPELAGOS = [
  { name: 'QĐ. Hoàng Sa', full: 'Quần đảo Hoàng Sa', owner: 'TP. Đà Nẵng', province: 'da-nang', minLon: 110.5 },
  { name: 'QĐ. Trường Sa', full: 'Quần đảo Trường Sa', owner: 'tỉnh Khánh Hòa', province: 'khanh-hoa', minLon: 109.6 },
]

export const LIFT_PX = 18       // độ nổi của tỉnh đang đứng (pixel màn hình)
export const LIFT_STEPS = 10    // số lớp xếp chồng tạo thành khối
export const LABEL_GROW_MAX = 2.4

// defs: nội dung tĩnh, không chứa dữ liệu động
export const DEFS = `
  <defs>
    <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="7" stroke="#3C3C3C" stroke-width="2" opacity=".35"/>
    </pattern>
    <linearGradient id="liftShine" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".5"/>
      <stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <symbol id="i-flag" viewBox="0 0 16 16">
      <rect x="2" y="1" width="1.6" height="14" fill="#2B2420"/>
      <path d="M3.6 1.5 L14 4.5 L3.6 7.5 Z" fill="currentColor" stroke="#fff" stroke-width=".8"/>
    </symbol>
    <symbol id="i-flag-q" viewBox="0 0 16 16">
      <rect x="2" y="1" width="1.6" height="14" fill="#2B2420"/>
      <path d="M3.6 1.5 L14 4.5 L3.6 7.5 Z" fill="#2B2420" stroke="#fff" stroke-width=".8"/>
      <text x="8.2" y="6.4" font-size="5" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial">?</text>
    </symbol>
    <symbol id="i-shield" viewBox="0 0 16 16">
      <path d="M8 1 L14 3.5 V8 C14 11.5 11 14 8 15 C5 14 2 11.5 2 8 V3.5 Z" fill="#F4F6F8" stroke="#2B2420" stroke-width="1.2"/>
      <path d="M8 4 V12 M5 7.5 H11" stroke="#2B2420" stroke-width="1.2"/>
    </symbol>
    <symbol id="i-swirl" viewBox="0 0 16 16">
      <path d="M8 8 m-5 0 a5 5 0 1 1 5 5 a3 3 0 1 1 -3 -3 a1.5 1.5 0 1 1 1.5 1.5" fill="none" stroke="#2B2420" stroke-width="1.6"/>
    </symbol>
    <symbol id="i-lantern" viewBox="0 0 16 16">
      <rect x="6.5" y="1" width="3" height="1.5" fill="#2B2420"/>
      <ellipse cx="8" cy="8" rx="5" ry="5.5" fill="#E74C3C" stroke="#8E1B10" stroke-width=".8"/>
      <path d="M8 2.5 V13.5 M4.5 5 Q8 8 4.5 11 M11.5 5 Q8 8 11.5 11" stroke="#F7C948" stroke-width=".7" fill="none"/>
      <rect x="6.5" y="13.3" width="3" height="1.5" fill="#F7C948"/>
    </symbol>
  </defs>`

// Mây sticker che tỉnh sương mù (PLAN 5.2, mockup/fog-clouds.html bản A): các hình tròn + đáy bo, đơn vị pixel,
// tâm (0, -8) để tên tỉnh nằm đè lên phần dưới đám mây. Lớp: bóng giấy → mép trắng → bụng xanh xám → mặt trên sáng.
export const CLOUD_PARTS = [[-0.55, 0.1, 0.38], [-0.15, -0.2, 0.5], [0.35, -0.05, 0.43], [0.7, 0.17, 0.3], [0, 0.2, 0.36]]
// Cả đám mây (các hình tròn + đáy bo) gộp thành MỘT đường path: mỗi lớp mây chỉ 1 phần tử thay vì 6.
// Camera bay đổi viewBox → trình duyệt tính lại mọi phần tử SVG mỗi khung hình, nên số phần tử quyết định độ mượt.
// Mọi hình vẽ cùng chiều kim đồng hồ → tô nonzero ra đúng phần hợp, không thủng lỗ chỗ chồng nhau.
const f = v => v.toFixed(1)
const circleD = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0Z`
const roundRectD = (x, y, w, h, r) => `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}`
  + `h${f(2 * r - w)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}v${f(2 * r - h)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}Z`
export const cloudPath = (s, dy = 0, k = 1) => CLOUD_PARTS.map(([x, y, r]) => circleD(x * s * k, y * s * k + dy, r * s * k)).join('')
  + roundRectD(-0.9 * s * k, 0.02 * s * k + dy, 1.85 * s * k, 0.5 * s * k, 0.25 * s * k)
export const CLOUD_SVG = (s => `<g class="bob">`
  + `<path class="cloud-shadow" transform="translate(${s * 0.06} ${s * 0.16 - 8})" d="${cloudPath(s)}"/>`
  + `<path class="cloud-rim" transform="translate(0 -8)" d="${cloudPath(s)}"/>`
  + `<path class="cloud-body" transform="translate(0 -8)" d="${cloudPath(s)}"/>`
  + `<path class="cloud-top" transform="translate(0 -8)" d="${cloudPath(s, -s * 0.1, 0.9)}"/></g>`)(22)
