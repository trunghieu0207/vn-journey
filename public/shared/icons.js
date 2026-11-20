// Bộ icon tự vẽ SVG thay cho emoji (không thư viện) — cùng phong cách với mascots.js: khối màu phẳng,
// mảng tối tạo khối, không viền đen. viewBox 0 0 32 32.
// Icon nút điều khiển (play, pause, stop, skip, retreat, sound-*) tô bằng currentColor → theo màu chữ của nút.
// Icon cờ tô bằng biến --ic (màu team), mặc định đỏ.
// Chất "sticker run nét" (PLAN 5.2, mockup/icons-hand.html bản B): mép trắng + bóng giấy sinh tự động từ hình icon,
// cả icon run nhẹ qua bộ lọc #hand-ic-wob (khai báo trong <svg class="hand-defs"> ở mỗi trang).

const NS = 'http://www.w3.org/2000/svg'

const C = {
  green: '#58CC02', greenDark: '#58A700', greenLight: '#D7FFB8',
  blue: '#1CB0F6', blueDark: '#1899D6', blueLight: '#DDF4FF', blueMid: '#8BD3F7',
  yellow: '#FFC800', yellowDark: '#E8A200',
  orange: '#FF9600', orangeDark: '#E07B00',
  red: '#FF4B4B', redDark: '#D93636',
  purple: '#CE82FF', purpleDark: '#A568E0',
  gray: '#E5E5E5', grayDark: '#AFAFAF', ink: '#4B4B4B',
  cream: '#FFE2A8', wood: '#B5793A', gold: '#E8B860', goldDark: '#C8992F',
}

const pt = (x, y) => `${x.toFixed(2)} ${y.toFixed(2)}`

// Ngôi sao 5 cánh tâm (cx, cy), bán kính ngoài R, trong r
function star(cx, cy, R, r) {
  let d = ''
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r : R
    d += `${i ? 'L' : 'M'}${pt(cx + k * Math.cos(a), cy + k * Math.sin(a))}`
  }
  return `${d}Z`
}

// Bông tuyết 6 nhánh, mỗi nhánh có 2 nhánh con
function snowflake() {
  let d = ''
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2
    const bx = 16 + 7.5 * Math.cos(a), by = 16 + 7.5 * Math.sin(a)
    d += `M16 16L${pt(16 + 12.5 * Math.cos(a), 16 + 12.5 * Math.sin(a))}`
    for (const s of [-1, 1]) d += `M${pt(bx, by)}L${pt(bx + 4 * Math.cos(a + s * 0.8), by + 4 * Math.sin(a + s * 0.8))}`
  }
  return d
}

// Vệt sáng trắng mờ (ánh bóng)
const shine = d => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>`

const FLAG = 'M8 5.5c4-2 7 1 10.5 0S24 4 27 5v12c-3-1-5 .5-8.5 1.5S12 16 8 18z'
const FLAG_LOW = 'M8 13.5c4-2 7 1 10.5 0S24 12 27 13v4c-3-1-5 .5-8.5 1.5S12 16 8 18z'
const POLE = `<rect x="5" y="3" width="3" height="27" rx="1.5" fill="${C.grayDark}"/><circle cx="6.5" cy="3.5" r="2.2" fill="${C.yellow}"/>`
const CLOUD = 'M9 22a5 5 0 0 1-.6-10 7 7 0 0 1 13.4-1.4A5.5 5.5 0 0 1 23.5 22z'
const CHECKER = Array.from({ length: 12 }, (_, i) => {
  const c = i % 4, r = Math.floor(i / 4)
  return (c + r) % 2 ? '' : `<rect x="${8 + c * 4.75}" y="${3 + r * 5.2}" width="4.75" height="5.2"/>`
}).join('')

function medal(n, main, dark, text) {
  return `<path d="M8.5 3H14l4 10h-5.5z" fill="${C.blue}"/><path d="M23.5 3H18l-4 10h5.5z" fill="${C.red}"/>`
    + `<circle cx="16" cy="21" r="9" fill="${dark}"/><circle cx="16" cy="20" r="9" fill="${main}"/>`
    + `<circle cx="16" cy="20" r="6.2" fill="none" stroke="${dark}" stroke-width="1.4"/>`
    + `<text x="16" y="24" text-anchor="middle" font-size="11" font-weight="900" fill="${text}">${n}</text>`
}

const ICONS = {
  // ---- Trạng thái, số liệu ----
  timer: `<rect x="12.5" y="2" width="7" height="4.5" rx="1.6" fill="${C.blueDark}"/><rect x="14.5" y="5" width="3" height="3" fill="${C.blueDark}"/>`
    + `<rect x="22.6" y="5.6" width="4.6" height="3.4" rx="1.4" fill="${C.blueDark}" transform="rotate(45 24.9 7.3)"/>`
    + `<circle cx="16" cy="19" r="11.5" fill="${C.blueDark}"/><circle cx="16" cy="18" r="11.5" fill="${C.blue}"/>`
    + `<circle cx="16" cy="18" r="8" fill="#fff"/>`
    + `<path d="M16 18v-5M16 18l3.4 2.2" fill="none" stroke="${C.blueDark}" stroke-width="2.4"/><circle cx="16" cy="18" r="1.6" fill="${C.blueDark}"/>`
    + shine('M9.07 11.07A9.8 9.8 0 0 1 13.46 8.53'),
  lock: `<path d="M10 14v-4a6 6 0 0 1 12 0v4" fill="none" stroke="${C.grayDark}" stroke-width="3.2"/>`
    + `<rect x="6" y="14.5" width="20" height="15" rx="4" fill="${C.yellowDark}"/><rect x="6" y="13" width="20" height="15" rx="4" fill="${C.yellow}"/>`
    + `<circle cx="16" cy="19.5" r="2.3" fill="${C.goldDark}"/><rect x="15" y="20" width="2" height="4.5" rx="1" fill="${C.goldDark}"/>`,
  question: `<circle cx="16" cy="17" r="12.5" fill="${C.purpleDark}"/><circle cx="16" cy="16" r="12.5" fill="${C.purple}"/>`
    + `<path d="M12.2 12.6a3.9 3.9 0 1 1 5.6 3.5c-1.2.6-1.8 1.4-1.8 2.7v.4" fill="none" stroke="#fff" stroke-width="3.4"/><circle cx="16" cy="23.2" r="1.9" fill="#fff"/>`,
  star: `<path d="${star(16, 17.7, 13, 5.6)}" fill="${C.orange}" stroke="${C.orange}" stroke-width="2"/>`
    + `<path d="${star(16, 16.5, 13, 5.6)}" fill="${C.yellow}" stroke="${C.yellow}" stroke-width="2"/>`
    + shine('M11.5 13.5l1.6-.3'),
  stats: `<rect x="4" y="16" width="6.5" height="11" rx="2" fill="${C.blue}"/><rect x="12.75" y="9" width="6.5" height="18" rx="2" fill="${C.green}"/>`
    + `<rect x="21.5" y="4" width="6.5" height="23" rx="2" fill="${C.orange}"/><rect x="2.5" y="26.5" width="27" height="3" rx="1.5" fill="${C.grayDark}"/>`,
  copy: `<rect x="10" y="3" width="17" height="21" rx="3.5" fill="${C.blueMid}"/><rect x="5" y="8" width="17" height="21" rx="3.5" fill="${C.blue}"/>`
    + `<path d="M9.5 15h8M9.5 19.5h8M9.5 24h5" stroke="#fff" stroke-width="2.2"/>`,
  screen: `<rect x="2.5" y="5" width="27" height="19" rx="4" fill="${C.blueDark}"/><rect x="2.5" y="4" width="27" height="19" rx="4" fill="${C.blue}"/>`
    + `<rect x="5.5" y="7" width="21" height="13" rx="2" fill="${C.blueLight}"/>`
    + `<path d="M5.5 17l5.5-5 4.5 4.5 3-2.5 8 4a2 2 0 0 1-2 2h-17a2 2 0 0 1-2-2z" fill="${C.green}"/><circle cx="21.5" cy="11" r="2" fill="${C.yellow}"/>`
    + `<path d="M13 24h6l1.5 4h-9z" fill="${C.blueDark}"/><rect x="9" y="27.5" width="14" height="2.5" rx="1.25" fill="${C.blueDark}"/>`,
  map: `<g stroke-width="2"><path d="M4 7l8-3v21l-8 3z" fill="${C.cream}" stroke="${C.cream}"/><path d="M12 4l8 3v21l-8-3z" fill="${C.gold}" stroke="${C.gold}"/>`
    + `<path d="M20 7l8-3v21l-8 3z" fill="${C.cream}" stroke="${C.cream}"/></g>`
    + `<path d="M7 21c3-4 6 0 9-3s4-5 6-5" fill="none" stroke="${C.orangeDark}" stroke-width="1.8" stroke-dasharray=".1 3.2"/>`
    + `<path d="M24 16.5s-3.8-3.8-3.8-6.4a3.8 3.8 0 0 1 7.6 0c0 2.6-3.8 6.4-3.8 6.4z" fill="${C.red}"/><circle cx="24" cy="10" r="1.3" fill="#fff"/>`,
  // Nón lá = vị trí của team (giống trên bản đồ)
  hat: `<path d="M16 4L29.5 21.5C25 24 7 24 2.5 21.5z" fill="${C.yellow}"/><path d="M16 4l13.5 17.5c-3 1.7-8.5 2.3-13.5 2.3z" fill="#F2B700"/>`
    + `<path d="M16 4L9.5 22.8M16 4l6.5 18.8M11.6 12h8.8M8.3 16.5h15.4" fill="none" stroke="${C.yellowDark}" stroke-width="1" stroke-opacity=".8"/>`
    + `<path d="M2.5 21.5C7 24 25 24 29.5 21.5c.5 1.5-.5 2.5-2 3-6 2-17 2-23 0-1.5-.5-2.5-1.5-2-3z" fill="${C.goldDark}"/>`
    + `<path d="M9 25q7 5.5 14 0" fill="none" stroke="${C.red}" stroke-width="1.8"/>`,
  fog: `<path d="${CLOUD}" fill="#AFBDC9" transform="translate(0 1.5)"/><path d="${CLOUD}" fill="#D5DEE6"/>` + shine('M8 15.5a3 3 0 0 1 2-1.8'),
  snowflake: `<path d="${snowflake()}" fill="none" stroke="${C.blue}" stroke-width="2.4"/><circle cx="16" cy="16" r="2.4" fill="${C.blue}"/>`,

  // ---- Cờ ----
  flag: `${POLE}<path d="${FLAG}" fill="var(--ic, ${C.red})"/><path d="${FLAG_LOW}" fill="#000" fill-opacity=".14"/>`,
  'flag-unknown': `${POLE}<path d="${FLAG}" fill="${C.ink}"/><text x="17.5" y="15.6" text-anchor="middle" font-size="11" font-weight="900" fill="#fff">?</text>`,
  finish: `${POLE}<clipPath id="{id}"><path d="${FLAG}"/></clipPath><path d="${FLAG}" fill="${C.greenLight}"/>`
    + `<g clip-path="url(#{id})" fill="${C.green}">${CHECKER}</g>`,

  // ---- Sự kiện ----
  // Lễ hội: đèn lồng
  festival: `<path d="M16 1.5v3" stroke="${C.yellowDark}" stroke-width="1.8"/>`
    + `<ellipse cx="16" cy="16" rx="11" ry="9.5" fill="${C.red}"/>`
    + `<path d="M16 6.5v19M10.5 7.5c-3 5-3 12 0 17M21.5 7.5c3 5 3 12 0 17" fill="none" stroke="${C.redDark}" stroke-width="1.6"/>`
    + shine('M8.4 12.5a8.5 8.5 0 0 1 2.4-3.6')
    + `<rect x="11" y="4" width="10" height="3.5" rx="1.5" fill="${C.yellow}"/><rect x="11" y="24.5" width="10" height="3.5" rx="1.5" fill="${C.yellow}"/>`
    + `<path d="M14.2 28h3.6l-.5 3h-2.6z" fill="${C.yellowDark}"/>`,
  // Bão: mây đen + mưa xiên
  storm: `<g transform="translate(0 -4)"><path d="${CLOUD}" fill="#62778C" transform="translate(0 1.5)"/><path d="${CLOUD}" fill="#7E93A8"/></g>`
    + `<path d="M10.5 23l-1.8 4M16 23l-1.8 4M21.5 23l-1.8 4M13.2 27.5l-.9 2M18.7 27.5l-.9 2" stroke="${C.blue}" stroke-width="2.2"/>`,
  // Câu hỏi vàng: đồng xu vàng có dấu "?"
  golden: `<circle cx="16" cy="17.4" r="12.5" fill="${C.yellowDark}"/><circle cx="16" cy="16" r="12.5" fill="${C.yellow}"/>`
    + `<circle cx="16" cy="16" r="9" fill="none" stroke="${C.yellowDark}" stroke-width="1.6"/>`
    + `<text x="16" y="21.2" text-anchor="middle" font-size="14" font-weight="900" fill="#A86F00">?</text>`
    + shine('M8.6 12.4a8.6 8.6 0 0 1 3.4-4.2'),
  // Tin đồn: cái loa
  rumor: `<path d="M8 21l1.6 6.5h3.6l-1-6.5z" fill="${C.orangeDark}"/>`
    + `<path d="M4 12.5a2 2 0 0 1 2-2h4L21 4.5a1 1 0 0 1 1.5.9v21.2a1 1 0 0 1-1.5.9L10 21.5H6a2 2 0 0 1-2-2z" fill="${C.orange}"/>`
    + `<rect x="9" y="10.5" width="2" height="11" fill="${C.orangeDark}"/>`
    + `<path d="M25.5 12.5a4.5 4.5 0 0 1 0 7M27.6 9a9 9 0 0 1 0 14" fill="none" stroke="${C.orange}" stroke-width="2.2"/>`,

  // ---- Thẻ bài ----
  card: `<rect x="10" y="4" width="15" height="21" rx="3" fill="${C.purpleDark}" transform="rotate(12 17.5 14.5)"/>`
    + `<g transform="rotate(-8 13.5 17.5)"><rect x="6" y="7" width="15" height="21" rx="3" fill="${C.purple}"/>`
    + `<rect x="8.5" y="9.5" width="10" height="16" rx="1.8" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.2"/>`
    + `<path d="${star(13.5, 17.8, 4.5, 2)}" fill="#fff"/></g>`,
  // Trinh sát: kính viễn vọng
  // Thẻ trợ giúp 50:50: tấm thẻ chia đôi, chữ 50
  fifty: `<rect x="5" y="6.5" width="22" height="21" rx="4" fill="${C.blueDark}"/><rect x="5" y="5" width="22" height="21" rx="4" fill="${C.blue}"/>`
    + `<path d="M16 5h7a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4h-7z" fill="${C.blueMid}"/>`
    + `<text x="16" y="20" text-anchor="middle" font-size="11" font-weight="900" fill="#fff">50</text>`,
  // Thẻ Thêm giờ: đồng hồ bấm giờ xanh lá, dấu cộng
  time: `<rect x="12.5" y="2" width="7" height="4.5" rx="1.6" fill="${C.greenDark}"/><rect x="14.5" y="5" width="3" height="3" fill="${C.greenDark}"/>`
    + `<circle cx="16" cy="19" r="11.5" fill="${C.greenDark}"/><circle cx="16" cy="18" r="11.5" fill="${C.green}"/>`
    + `<circle cx="16" cy="18" r="8" fill="#fff"/><path d="M16 13.5v9M11.5 18h9" stroke="${C.green}" stroke-width="3"/>`,
  // Đặt cược "Liều": đồng chip đỏ
  bet: `<circle cx="16" cy="17.4" r="12.5" fill="${C.redDark}"/><circle cx="16" cy="16" r="12.5" fill="${C.red}"/>`
    + `<path d="M16 3.5v4.5M16 24v4.5M3.5 16H8M24 16h4.5M7.2 7.2l3.2 3.2M21.6 21.6l3.2 3.2M24.8 7.2l-3.2 3.2M10.4 21.6l-3.2 3.2" stroke="#fff" stroke-width="2.6"/>`
    + `<circle cx="16" cy="16" r="6.5" fill="#fff"/><circle cx="16" cy="16" r="4" fill="none" stroke="${C.red}" stroke-width="1.6"/>`,
  // Chuỗi đúng: ngọn lửa
  // Về quê: dấu ghim hồng (tỉnh quê của đồng đội) — khác icon ngôi nhà (ghé thăm thử tài)
  home: `<path d="M16 30C12 25 6 19.5 6 13a10 10 0 0 1 20 0c0 6.5-6 12-10 17z" fill="#E8457A"/><path d="M16 30c4-5 10-10.5 10-17A10 10 0 0 0 16 3z" fill="#C7305F"/><circle cx="16" cy="13" r="4.2" fill="#fff"/>`,
  streak: `<path d="M16 2.5c1.5 5 7.5 7.5 7.5 15a7.5 7.5 0 0 1-15 0c0-3.5 2-5.5 3.5-7 .3 2.5 1.5 3.5 2.5 3.5C14.5 10.5 13.5 6.5 16 2.5z" fill="${C.orange}"/>`
    + `<path d="M16 15c.8 2.6 3.8 3.6 3.8 7.3a3.8 3.8 0 0 1-7.6 0c0-2 1.2-3.3 2-4 .2 1.2.8 1.7 1.3 1.7-.3-1.7-.2-3.3.5-5z" fill="${C.yellow}"/>`,
  scout: `<path d="M16 16l-6 13M16 16l6 13M16 16v13" fill="none" stroke="${C.grayDark}" stroke-width="2.4"/>`
    + `<g transform="rotate(-28 16 13)"><rect x="4" y="10.5" width="6" height="5" rx="1.5" fill="${C.purpleDark}"/>`
    + `<rect x="9" y="9" width="12" height="8" rx="2" fill="${C.purple}"/><rect x="20" y="7.5" width="8" height="11" rx="2" fill="${C.purple}"/>`
    + `<rect x="26.5" y="7.5" width="2.5" height="11" rx="1.2" fill="${C.purpleDark}"/><rect x="10.5" y="10.4" width="8" height="1.6" rx=".8" fill="#fff" fill-opacity=".55"/></g>`
    + `<circle cx="16" cy="16" r="2.4" fill="${C.grayDark}"/>`,
  // Phòng thủ: khiên
  shield: `<path d="M16 3l11 4v8c0 7-4.8 12-11 14.5C9.8 27 5 22 5 15V7z" fill="${C.blue}"/><path d="M16 3l11 4v8c0 7-4.8 12-11 14.5z" fill="${C.blueDark}"/>`
    + `<path d="${star(16, 15.5, 6, 2.6)}" fill="#fff" stroke="#fff" stroke-width="1"/>`,
  // Hành quân gấp: tia sét
  march: `<path d="M18.5 2.5L6.5 18h8l-2 11.5L25.5 13h-8.5z" fill="${C.orange}" stroke="${C.orange}" stroke-width="1.5" transform="translate(1.2 1.2)"/>`
    + `<path d="M18.5 2.5L6.5 18h8l-2 11.5L25.5 13h-8.5z" fill="${C.yellow}" stroke="${C.yellow}" stroke-width="1.5"/>`,
  // Ghé thăm thử tài (luật "công thành"): ngôi nhà nhỏ của chủ nhà — mái đỏ, cửa gỗ, cửa sổ vàng
  siege: `<path d="M16 4L3.5 15h3.3v12.5h18.4V15h3.3z" fill="${C.cream}"/>`
    + `<path d="M16 3.2L2.6 15.1a1.4 1.4 0 0 0 .9 2.4h1.2L16 7.6l11.3 9.9h1.2a1.4 1.4 0 0 0 .9-2.4z" fill="${C.red}"/>`
    + `<rect x="12.8" y="18.5" width="6.4" height="9" rx="1.4" fill="${C.wood}"/><circle cx="17.6" cy="23.2" r=".9" fill="${C.yellow}"/>`
    + `<rect x="21" y="17.5" width="3" height="3" rx=".6" fill="${C.yellow}"/>`,

  // ---- Kết quả ----
  trophy: `<path d="M9 8H5.5A1.5 1.5 0 0 0 4 9.5c0 4 2.5 6.5 6 7M23 8h3.5A1.5 1.5 0 0 1 28 9.5c0 4-2.5 6.5-6 7" fill="none" stroke="${C.yellowDark}" stroke-width="2.4"/>`
    + `<path d="M8.5 4.5h15V12a7.5 7.5 0 0 1-15 0z" fill="${C.yellow}"/><path d="M16 4.5h7.5V12a7.5 7.5 0 0 1-7.5 7.5z" fill="${C.yellowDark}"/>`
    + `<rect x="14" y="19" width="4" height="4.5" fill="${C.yellowDark}"/><rect x="9.5" y="23" width="13" height="5.5" rx="1.5" fill="${C.wood}"/>`
    + `<rect x="13" y="24.8" width="6" height="2" rx=".8" fill="${C.yellow}"/><path d="${star(16, 11.5, 3.8, 1.7)}" fill="#fff"/>`,
  medal1: medal(1, C.yellow, C.yellowDark, '#A86F00'),
  medal2: medal(2, '#CFD8DC', '#A7B4BB', '#5F6E76'),
  medal3: medal(3, '#E59A5A', '#C47A3C', '#7E4719'),
  target: `<circle cx="16" cy="17.5" r="12.5" fill="${C.redDark}"/><circle cx="16" cy="16.5" r="12.5" fill="${C.red}"/>`
    + `<circle cx="16" cy="16.5" r="8.6" fill="#fff"/><circle cx="16" cy="16.5" r="4.8" fill="${C.red}"/>`
    + `<path d="M16 16.5L27.5 5" stroke="${C.greenDark}" stroke-width="2.4"/><path d="M25.5 7l.1-4.4 4 .3.3 4z" fill="${C.green}"/>`,
  dice: `<g transform="rotate(-8 16 16)"><rect x="5" y="6.5" width="22" height="22" rx="5" fill="${C.purpleDark}"/><rect x="5" y="5" width="22" height="22" rx="5" fill="${C.purple}"/>`
    + `<g fill="#fff"><circle cx="11" cy="11" r="2.2"/><circle cx="21" cy="11" r="2.2"/><circle cx="16" cy="16" r="2.2"/><circle cx="11" cy="21" r="2.2"/><circle cx="21" cy="21" r="2.2"/></g></g>`,

  // ---- Chủ đề câu hỏi ----
  'topic-am-thuc': `<path d="M20 3l-3.5 11M26 4.5l-6.5 10" stroke="${C.wood}" stroke-width="2"/>`
    + `<path d="M3.5 15h25a12.5 10 0 0 1-25 0z" fill="${C.blue}"/><path d="M6.5 20h19" stroke="#fff" stroke-width="1.8"/>`
    + `<rect x="11" y="24" width="10" height="3.5" rx="1.5" fill="${C.blueDark}"/>`
    + `<ellipse cx="16" cy="15" rx="12.5" ry="2.8" fill="${C.cream}"/><circle cx="11" cy="14.6" r="1.2" fill="${C.green}"/><circle cx="20.5" cy="15.3" r="1.2" fill="${C.green}"/>`,
  'topic-doi-song': `<rect x="20.5" y="5" width="3.2" height="7" fill="${C.wood}"/><rect x="7" y="15" width="18" height="13.5" rx="2" fill="${C.cream}"/>`
    + `<path d="M16 3.5L29 15a1.5 1.5 0 0 1-1 2.6H4a1.5 1.5 0 0 1-1-2.6z" fill="${C.orange}"/><path d="M16 3.5L29 15a1.5 1.5 0 0 1-1 2.6H16z" fill="${C.orangeDark}"/>`
    + `<path d="M13.5 28.5v-6a2.5 2.5 0 0 1 5 0v6z" fill="${C.wood}"/><rect x="8.8" y="20" width="3.4" height="3.4" rx=".8" fill="${C.blue}"/><rect x="19.8" y="20" width="3.4" height="3.4" rx=".8" fill="${C.blue}"/>`,
  // Văn hóa: trống có hoa văn ngôi sao kiểu trống đồng
  'topic-van-hoa': `<path d="M5 13v10c0 2.8 4.9 5 11 5s11-2.2 11-5V13z" fill="${C.red}"/><path d="M16 17.6V28c6.1 0 11-2.2 11-5V13z" fill="${C.redDark}"/>`
    + `<g fill="${C.yellow}"><circle cx="8" cy="20" r="1.1"/><circle cx="12" cy="21.4" r="1.1"/><circle cx="16" cy="21.8" r="1.1"/><circle cx="20" cy="21.4" r="1.1"/><circle cx="24" cy="20" r="1.1"/></g>`
    + `<ellipse cx="16" cy="13" rx="11" ry="4.6" fill="${C.cream}"/><ellipse cx="16" cy="13" rx="6.5" ry="2.6" fill="none" stroke="${C.gold}" stroke-width="1"/>`
    + `<path d="${star(16, 13, 3, 1.2)}" fill="${C.gold}" transform="matrix(1 0 0 .42 0 7.54)"/>`
    + `<path d="M5 3.5l7.5 7.5M27 3.5L19.5 11" stroke="${C.wood}" stroke-width="2.2"/><circle cx="5" cy="3.5" r="2" fill="${C.red}"/><circle cx="27" cy="3.5" r="2" fill="${C.red}"/>`,
  // Di sản: chùa mái cong
  'topic-di-san': `<path d="M16 3v5.5" stroke="${C.yellow}" stroke-width="2"/><circle cx="16" cy="3.5" r="1.6" fill="${C.yellow}"/>`
    + `<rect x="12" y="12" width="8" height="4" fill="${C.cream}"/><rect x="9.5" y="20" width="13" height="6.5" fill="${C.cream}"/>`
    + `<path d="M14 26.5v-3.5a2 2 0 0 1 4 0v3.5z" fill="${C.wood}"/><rect x="7" y="26" width="18" height="3" rx="1" fill="${C.grayDark}"/>`
    + `<path d="M3 18.5c3 .5 5-.5 6.5-3h13c1.5 2.5 3.5 3.5 6.5 3-1 1.5-3 2-4.5 2h-17C6 20.5 4 20 3 18.5z" fill="${C.red}"/>`
    + `<path d="M6 11c2.5.4 4.2-.5 5.5-2.5h9c1.3 2 3 2.9 5.5 2.5-.8 1.3-2.5 1.8-3.8 1.8H9.8C8.5 12.8 6.8 12.3 6 11z" fill="${C.red}"/>`,
  // Lịch sử: cuộn giấy
  'topic-lich-su': `<rect x="7" y="5" width="18" height="22" fill="${C.cream}"/><path d="M11 12h10M11 16h10M11 20h6" stroke="${C.goldDark}" stroke-width="1.8"/>`
    + `<rect x="4.5" y="3" width="23" height="5" rx="2.5" fill="${C.gold}"/><rect x="4.5" y="24" width="23" height="5" rx="2.5" fill="${C.gold}"/>`,
  // Sáp nhập: tòa nhà cột
  'topic-sap-nhap': `<path d="M16 3L29 10H3z" fill="${C.blue}" stroke="${C.blue}" stroke-width="2"/><rect x="4.5" y="10" width="23" height="3" fill="${C.blueDark}"/>`
    + `<g fill="${C.blueMid}"><rect x="6.5" y="13" width="3" height="11"/><rect x="11.8" y="13" width="3" height="11"/><rect x="17.2" y="13" width="3" height="11"/><rect x="22.5" y="13" width="3" height="11"/></g>`
    + `<rect x="3.5" y="24" width="25" height="3" rx="1" fill="${C.blueDark}"/><rect x="2" y="27" width="28" height="2.5" rx="1" fill="${C.blue}"/>`,

  // ---- Chạy trạm ----
  // Chìa khóa vàng nằm chéo: thân + răng, vành tròn có lỗ
  key: `<g transform="rotate(45 16 16)"><rect x="12" y="15.7" width="17" height="3.4" rx="1.4" fill="${C.goldDark}"/><rect x="22" y="18.7" width="3" height="5.4" rx="1" fill="${C.goldDark}"/><rect x="26.8" y="18.7" width="2.6" height="4.2" rx="1" fill="${C.goldDark}"/><circle cx="7.5" cy="17.2" r="6.6" fill="${C.goldDark}"/>`
    + `<rect x="12" y="14.5" width="17" height="3.4" rx="1.4" fill="${C.yellow}"/><rect x="22" y="17.5" width="3" height="5.4" rx="1" fill="${C.yellow}"/><rect x="26.8" y="17.5" width="2.6" height="4.2" rx="1" fill="${C.yellow}"/><circle cx="7.5" cy="16" r="6.6" fill="${C.yellow}"/>`
    + `<circle cx="7.5" cy="16" r="2.6" fill="#fff"/></g>`,
  // Ngôi sao hy vọng: sao vàng to có tia sáng xanh nhỏ
  'star-hope': `<path d="${star(15, 18, 12.5, 5.4)}" fill="${C.orange}" stroke="${C.orange}" stroke-width="2"/>`
    + `<path d="${star(15, 16.8, 12.5, 5.4)}" fill="${C.yellow}" stroke="${C.yellow}" stroke-width="2"/>`
    + `<path d="M25.5 3l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="${C.blue}"/>`
    + shine('M10.6 13.8l1.6-.3'),
  // Cuộn giấy: nhật ký hành trình / câu đố
  scroll: `<rect x="7" y="7" width="18" height="21" rx="1.5" fill="${C.gold}"/><rect x="7" y="5.5" width="18" height="21" rx="1.5" fill="${C.cream}"/>`
    + `<rect x="4" y="3.5" width="24" height="6" rx="3" fill="${C.goldDark}"/><rect x="4" y="2.5" width="24" height="6" rx="3" fill="${C.gold}"/>`
    + `<rect x="4" y="23.5" width="24" height="6" rx="3" fill="${C.goldDark}"/><rect x="4" y="22.5" width="24" height="6" rx="3" fill="${C.gold}"/>`
    + `<path d="M11 13h10M11 17h10M11 21h6" stroke="${C.wood}" stroke-width="1.8"/>`,

  // Khung cảnh thời kỳ (data/periods.json → scene.icons). Thiếu tên thì tram-map.js thay bằng scroll; data:check báo lỗi.
  // Văn Lang: trống đồng, nhà sàn, chim Lạc
  'trong-dong': `<path d="M4 12c0 4 1.5 7 3 9l-1.5 7h21L25 21c1.5-2 3-5 3-9z" fill="${C.wood}"/><path d="M4 12c0 4 1.5 7 3 9l-1.5 7H16V12z" fill="${C.goldDark}"/>`
    + `<path d="M6.5 19h19M6 23.5h20" stroke="${C.gold}" stroke-width="1.4" fill="none"/>`
    + `<ellipse cx="16" cy="13" rx="12" ry="5" fill="${C.goldDark}"/><ellipse cx="16" cy="12" rx="12" ry="5" fill="${C.gold}"/>`
    + `<ellipse cx="16" cy="12" rx="8.5" ry="3.4" fill="none" stroke="${C.goldDark}" stroke-width="1.2"/>`
    + `<path d="${star(16, 12, 3.6, 1.3)}" fill="${C.yellow}" transform="translate(0 6.6) scale(1 .45)"/>`,
  'nha-san': `<path d="M6 20h2v9H6zM10.5 20h2v9h-2zM19.5 20h2v9h-2zM24 20h2v9h-2z" fill="#8B5A2B"/>`
    + `<rect x="8" y="12.5" width="16" height="8" fill="${C.cream}"/><rect x="14" y="14.5" width="4" height="6" rx=".8" fill="${C.wood}"/>`
    + `<rect x="4.5" y="19.5" width="23" height="2.6" rx="1" fill="${C.wood}"/>`
    + `<path d="M1.5 15L9 3.5h14L30.5 15c-5 .8-24 .8-29 0z" fill="${C.yellowDark}"/><path d="M9 3.5h14l3 4.5H6z" fill="${C.yellow}"/>`
    + `<path d="M8 8.5l-3 5M12 8.5l-1.5 5.5M20 8.5l1.5 5.5M24 8.5l3 5" stroke="#C88A00" stroke-width="1" fill="none"/>`,
  'chim-lac': `<path d="M18 16c5-1 9 2 12.5 7.5-4-2.5-8-3.5-12.5-3.5z" fill="${C.orangeDark}"/><path d="M17.5 18c6 1.5 9 5.5 10 10.5-3-3.5-6.5-5.5-10.5-6.5z" fill="${C.orange}"/>`
    + `<path d="M7.5 15c2-4.5 9.5-5 13-.5 1 3.5-3 6.5-8.5 5.5-3-.5-5-2.5-4.5-5z" fill="${C.orange}"/>`
    + `<path d="M11.5 15c2-7 7-10 14-11-3 4-6 8.5-8.5 12z" fill="${C.orangeDark}"/>`
    + `<circle cx="8" cy="13" r="3.2" fill="${C.orange}"/><path d="M5.3 12.2L.5 15.8l5.5-1.4z" fill="${C.yellowDark}"/>`
    + `<path d="M7.6 10.2C6.8 7 8 5 10.2 3.5c-.6 2.4-.1 4.6.2 7z" fill="${C.red}"/><circle cx="7.6" cy="12.5" r=".9" fill="${C.ink}"/>`,
  // Nhà Lý: Văn Miếu (Khuê Văn Các), hoa sen (chùa Một Cột), rồng thời Lý (thân rắn uốn khúc, ngậm ngọc)
  'van-mieu': `<rect x="6.5" y="21" width="4.5" height="8" fill="#D8CDB8"/><rect x="21" y="21" width="4.5" height="8" fill="#D8CDB8"/><rect x="6" y="20" width="20" height="2" fill="#B8A68A"/>`
    + `<path d="M2 21.5c2 0 3-.5 4-1.5h20c1 1 2 1.5 4 1.5-2 1.5-4 2-6 2H8c-2 0-4-.5-6-2z" fill="#9C3D29"/><path d="M6 20l2-3h16l2 3z" fill="#C0533A"/>`
    + `<rect x="9" y="10" width="14" height="7.5" fill="${C.wood}"/><circle cx="16" cy="13.8" r="3" fill="${C.yellow}"/>`
    + `<path d="M16 10.8v6M13 13.8h6M13.9 11.7l4.2 4.2M18.1 11.7l-4.2 4.2" stroke="${C.wood}" stroke-width=".9" fill="none"/>`
    + `<path d="M3.5 11c2 0 3-.5 4-1.5h17c1 1 2 1.5 4 1.5-2 1.5-4 2-6 2h-13c-2 0-4-.5-6-2z" fill="#9C3D29"/><path d="M7.5 9.5L11 5.5h10l3.5 4z" fill="#C0533A"/>`
    + `<circle cx="16" cy="4.5" r="1.6" fill="${C.yellow}"/>`,
  'hoa-sen': `<ellipse cx="16" cy="26.5" rx="13" ry="3.5" fill="${C.greenDark}"/><ellipse cx="16" cy="25.5" rx="13" ry="3.5" fill="${C.green}"/>`
    + `<path d="M16 24C8 24 4 18 3 13c5 1 9 4 13 11zM16 24c8 0 12-6 13-11-5 1-9 4-13 11z" fill="#E5658F"/>`
    + `<path d="M16 24c-6-3-8-10-6-16 4 3 6 9 6 16zM16 24c6-3 8-10 6-16-4 3-6 9-6 16z" fill="#FF8FB1"/>`
    + `<path d="M16 24c-3.5-5-3.5-14 0-20 3.5 6 3.5 15 0 20z" fill="#FFC2D4"/>` + shine('M14.6 16c-.3-3 .2-6 1.4-8.5'),
  'rong-ly': `<circle cx="21" cy="8.5" r="2.8" fill="${C.blueMid}"/>` + shine('M19.6 7.4a1.6 1.6 0 0 1 1.2-.9')
    + `<path d="M7 9c5-5 10 1 7 6s-4 9.5 3 10 10-6 11 1" fill="none" stroke="${C.goldDark}" stroke-width="5"/>`
    + `<path d="M7 9c5-5 10 1 7 6s-4 9.5 3 10 10-6 11 1" fill="none" stroke="${C.yellow}" stroke-width="2.6"/>`
    + `<path d="M11.5 8.5l2-3M14 17l2.5-1M15 25.5l.5 2.5M23 21.5l1-2.5" stroke="${C.red}" stroke-width="1.6" fill="none"/>`
    + `<path d="M28 26l3-2.5-1 4.5z" fill="${C.red}"/>`
    + `<circle cx="6" cy="9.5" r="3.4" fill="${C.yellow}"/><path d="M3 9L.5 10.6 3.4 11.4z" fill="${C.goldDark}"/>`
    + `<path d="M6 6.3C5 3.8 6.8 2 9 2.3c-1 1.3-.6 2.6 0 4z" fill="${C.red}"/><circle cx="6.4" cy="8.8" r=".9" fill="${C.ink}"/>`
    + `<path d="M3.2 10.8c-2 1.8-1.6 3.6-.2 4.8" fill="none" stroke="${C.red}" stroke-width="1"/>`,
  // Nhà Nguyễn: Ngọ Môn, Cửu Đỉnh, Nhã nhạc cung đình (đàn nguyệt)
  'ngo-mon': `<rect x="2" y="18" width="28" height="11.5" rx="1" fill="#B8A68A"/><rect x="2" y="17" width="28" height="11.5" rx="1" fill="#D8CDB8"/>`
    + `<path d="M13.5 28.5V23a2.5 2.5 0 0 1 5 0v5.5zM5.8 28.5v-4a1.7 1.7 0 0 1 3.4 0v4zM22.8 28.5v-4a1.7 1.7 0 0 1 3.4 0v4z" fill="#6B4A2E"/>`
    + `<rect x="7" y="12" width="18" height="5" fill="#C0533A"/><path d="M11 12.5v4.5M16 12.5v4.5M21 12.5v4.5" stroke="#9C3D29" stroke-width="1.2"/>`
    + `<path d="M3.5 12.5c2 0 3-.5 4-1.5h17c1 1 2 1.5 4 1.5-2 1.5-4 2-6 2h-13c-2 0-4-.5-6-2z" fill="${C.yellowDark}"/><path d="M7.5 11L10.5 7.5h11l3 3.5z" fill="${C.yellow}"/>`
    + `<path d="M9 7.8c1.5 0 2.3-.4 3-1.3h8c.7.9 1.5 1.3 3 1.3-1.5 1-3 1.2-4.5 1.2h-5C12 9 10.5 8.8 9 7.8z" fill="${C.yellowDark}"/><path d="M12.5 6.5L14 4h4l1.5 2.5z" fill="${C.yellow}"/>`,
  'cuu-dinh': `<path d="M8.5 11V5h3.5v6M20 11V5h3.5v6" fill="none" stroke="${C.goldDark}" stroke-width="2.2"/>`
    + `<path d="M9.5 19.5L7.5 29h3l2.5-7.5zM22.5 19.5l2 9.5h-3L19 21.5zM14.8 22h2.4v7h-2.4z" fill="${C.goldDark}"/>`
    + `<path d="M6.5 12h19c0 7-4 11.5-9.5 11.5S6.5 19 6.5 12z" fill="${C.gold}"/><path d="M16 23.5c5.5 0 9.5-4.5 9.5-11.5H21c0 6-2 10.5-5 11.5z" fill="#D9A845"/>`
    + `<rect x="5" y="9.5" width="22" height="3.2" rx="1.6" fill="${C.goldDark}"/>`
    + `<path d="M8.2 16h15.6" stroke="${C.wood}" stroke-width="1.3"/><circle cx="12" cy="19" r="1" fill="${C.wood}"/><circle cx="16" cy="19.8" r="1" fill="${C.wood}"/><circle cx="20" cy="19" r="1" fill="${C.wood}"/>`
    + shine('M9 13.8c.3 2 1 3.5 2.2 4.8'),
  'nha-nhac': `<path d="M13 19L27 5" stroke="#8B5A2B" stroke-width="3.2"/><path d="M15.9 13.9l2.2 2.2M17.9 11.9l2.2 2.2M19.9 9.9l2.2 2.2M21.9 7.9l2.2 2.2" stroke="${C.cream}" stroke-width="1"/>`
    + `<path d="M24 6l-1.8-1.8M26 8l1.8 1.8M26.2 3.8l-1.6-1.6M28.2 5.8l1.6 1.6" stroke="${C.ink}" stroke-width="1.6"/>`
    + `<circle cx="11" cy="22" r="8" fill="${C.wood}"/><circle cx="11" cy="21" r="8" fill="#D9A066"/>`
    + `<path d="M6.6 24.6L25.6 5.6M8.2 26.2L27.2 7.2" stroke="${C.ink}" stroke-width=".6" stroke-opacity=".7"/><path d="M6.8 22.8l2.4 2.4" stroke="${C.ink}" stroke-width="1.6"/>`
    + `<circle cx="5" cy="8.5" r="2.3" fill="${C.red}"/><path d="M7.2 8.5V2.5l4 1.6v2.2l-4-1.4" fill="${C.red}" stroke="${C.red}" stroke-width="1.2"/>`
    + shine('M6 17.5a6 6 0 0 1 3-2.8'),

  // ---- Nút điều khiển (currentColor) ----
  play: '<path d="M9 6v20l17-10z" fill="currentColor" stroke="currentColor" stroke-width="3"/>',
  pause: '<rect x="7.5" y="6" width="6" height="20" rx="2" fill="currentColor"/><rect x="18.5" y="6" width="6" height="20" rx="2" fill="currentColor"/>',
  stop: '<rect x="7" y="7" width="18" height="18" rx="4" fill="currentColor"/>',
  chevron: '<path d="M8 12.5l8 8 8-8" fill="none" stroke="currentColor" stroke-width="4"/>', // mũi tên mở ô chọn (shared/select.js)
  skip: '<path d="M5 8v16l9.5-8zM15 8v16l9.5-8z" fill="currentColor" stroke="currentColor" stroke-width="2.5"/><rect x="25.5" y="7" width="3" height="18" rx="1.5" fill="currentColor"/>',
  retreat: '<path d="M11 7l-6 6 6 6M5 13h14.5a6.5 6.5 0 0 1 0 13H14" fill="none" stroke="currentColor" stroke-width="3.2"/>',
  'sound-on': '<path d="M4 12.5h4.5L15 7v18l-6.5-5.5H4z" fill="currentColor" stroke="currentColor" stroke-width="1.5"/>'
    + '<path d="M19.5 12a5.5 5.5 0 0 1 0 8M23 8.5a10.5 10.5 0 0 1 0 15" fill="none" stroke="currentColor" stroke-width="2.6"/>',
  'sound-off': '<path d="M4 12.5h4.5L15 7v18l-6.5-5.5H4z" fill="currentColor" stroke="currentColor" stroke-width="1.5"/>'
    + '<path d="M20 12l8 8M28 12l-8 8" fill="none" stroke="currentColor" stroke-width="2.6"/>',
  'music-on': '<path d="M12 23V8l14-3v15" fill="none" stroke="currentColor" stroke-width="2.8"/>'
    + '<ellipse cx="8.5" cy="23.5" rx="4" ry="3.2" fill="currentColor"/><ellipse cx="22.5" cy="20.5" rx="4" ry="3.2" fill="currentColor"/>',
  'music-off': '<path d="M12 23V8l14-3v15" fill="none" stroke="currentColor" stroke-width="2.8" opacity=".45"/>'
    + '<ellipse cx="8.5" cy="23.5" rx="4" ry="3.2" fill="currentColor" opacity=".45"/><ellipse cx="22.5" cy="20.5" rx="4" ry="3.2" fill="currentColor" opacity=".45"/>'
    + '<path d="M4 4l24 24" fill="none" stroke="currentColor" stroke-width="2.8"/>',
}

// Bóng (silhouette) của icon: mọi hình tô một màu, nét dày thêm `grow` → làm mép sticker bao quanh
function silhouette(body, color, grow) {
  const s = body
    .replace(/<clipPath[\s\S]*?<\/clipPath>/g, '')
    .replace(/ clip-path="[^"]*"/g, '')
    .replace(/ (?:fill|stroke)-opacity="[^"]*"/g, '')
    .replace(/ stroke-dasharray="[^"]*"/g, '')
    .replace(/ fill="[^"]*"/g, ` fill="${color}"`)
    .replace(/ stroke="[^"]*"/g, ` stroke="${color}"`)
    .replace(/ stroke-width="([\d.]+)"/g, (m, w) => ` stroke-width="${+w + grow}"`)
  return `<g fill="${color}" stroke="${color}" stroke-width="${grow}">${s}</g>`
}

// Icon nút điều khiển (currentColor) chỉ run nhẹ, không dán mép — chúng là ký hiệu theo màu chữ
const STICKER = Object.fromEntries(Object.entries(ICONS).map(([name, body]) => [name,
  `<g filter="url(#hand-ic-wob)">${body.includes('currentColor') ? body
    : `<g opacity=".13" transform="translate(.4 1.6)">${silhouette(body, '#000', 4)}</g>${silhouette(body, '#fff', 4)}${body}`}</g>`]))

let uid = 0

/** Chuỗi <svg> của icon (dùng cho trang xem trước). */
export function iconMarkup(name, size = 20) {
  return `<svg xmlns="${NS}" viewBox="0 0 32 32" width="${size}" height="${size}" class="icon" overflow="visible" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">`
    + `${STICKER[name].replaceAll('{id}', `ic${++uid}`)}</svg>`
}

/** Icon dạng phần tử SVG. size mặc định theo cỡ chữ. label: chữ cho trình đọc màn hình (bỏ trống = chỉ trang trí). color: màu cờ. */
export function icon(name, { size = '1.25em', label = '', color = '' } = {}) {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 32 32')
  svg.setAttribute('width', size)
  svg.setAttribute('height', size)
  svg.setAttribute('class', 'icon')
  svg.setAttribute('overflow', 'visible') // mép sticker ló ra ngoài khung 32
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label) } else svg.setAttribute('aria-hidden', 'true')
  if (color) svg.style.setProperty('--ic', color)
  // Chuỗi hằng định nghĩa ngay trong file này — không chứa dữ liệu người dùng
  svg.innerHTML = STICKER[name].replaceAll('{id}', `ic${++uid}`)
  return svg
}

/** Icon + chữ trong một khối (dùng trong nút, toast, tiêu đề, ô bảng). */
export function labeled(name, text, opts) {
  const s = document.createElement('span')
  s.className = 'with-icon'
  s.append(icon(name, opts), text)
  return s
}

/** Thay mọi <span data-icon="tên"> trong HTML tĩnh bằng icon. */
export function fillIcons(root = document) {
  for (const s of root.querySelectorAll('[data-icon]')) s.replaceWith(icon(s.dataset.icon))
}

export const ICON_NAMES = Object.keys(ICONS)
