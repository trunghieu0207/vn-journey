// Trang luật chơi: mỗi mục có một khung hoạt cảnh minh họa (dựng bằng DOM ở đây, chuyển động bằng CSS — css/rules.css).
// Hoạt cảnh chỉ chạy khi khung đang nằm trong màn hình (IntersectionObserver thêm .on); máy bật "giảm chuyển động"
// thì đứng yên ở trạng thái cuối. Nội dung luật lấy từ PLAN.md mục 3 — đổi luật thì sửa cả rules.html.

import { icon, fillIcons } from '/shared/icons.js'
import { mascotIcon } from '/shared/mascots.js'

const NS = 'http://www.w3.org/2000/svg'
const ME = { mascot: 'Lân', color: '#E67E22' } // team ví dụ

function h(tag, cls = '', ...children) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  for (const c of children) e.append(c)
  return e
}
function s(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  parent?.append(e)
  return e
}
const ic = (name, size = 22) => icon(name, { size: `${size}px` })
const badge = (me = true, size = 34) => h('span', `rb-badge${me ? '' : ' foe'}`, me ? mascotIcon(ME.mascot, ME.color, size) : '?')

// ---------- Bản đồ thu nhỏ: mảnh tỉnh lục giác run nét (kiểu sticker), viền trắng ----------
// Số giả ngẫu nhiên có hạt giống → hình giống nhau mỗi lần tải
function rng(seed) {
  let x = seed
  return () => ((x = (x * 9301 + 49297) % 233280) / 233280)
}
function blob(cx, cy, r, seed) {
  const rand = rng(seed), pts = []
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i + Math.PI / 6, k = r * (0.9 + rand() * 0.16)
    pts.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k])
  }
  // Nối trung điểm các cạnh bằng đường cong bậc hai → góc mềm như vẽ tay
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  let d = `M${mid(pts[5], pts[0]).map(v => v.toFixed(1)).join(' ')}`
  for (let i = 0; i < 6; i++) {
    const p = pts[i], m = mid(p, pts[(i + 1) % 6])
    d += `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`
  }
  return `${d}Z`
}
// tiles: [{ id, x, y, cls, label }] — trả về { svg, tile(id) }
function miniMap(tiles, { w = 300, h: ht = 200 } = {}) {
  const svg = s('svg', { class: 'mini-map', viewBox: `0 0 ${w} ${ht}`, preserveAspectRatio: 'none' })
  const els = {}
  tiles.forEach((t, i) => {
    const g = s('g', { class: `mt ${t.cls ?? ''}`, 'data-id': t.id }, svg)
    s('path', { d: blob(t.x, t.y, t.r ?? 36, i * 7 + 3) }, g)
    if (t.label) {
      const tx = s('text', { x: t.x, y: t.y + 4 }, g)
      tx.textContent = t.label
    }
    els[t.id] = g
  })
  return { svg, tile: id => els[id] }
}
// Đặt phần tử HTML lên khung theo toạ độ bản đồ (đơn vị viewBox → %)
function pin(node, x, y, w = 300, ht = 200) {
  node.style.left = `${(x / w) * 100}%`
  node.style.top = `${(y / ht) * 100}%`
  return node
}
const hat = () => h('span', 'r-hat', ic('hat', 30))

// ---------- Các hoạt cảnh ----------
const SCENES = {
  // 1. Mục tiêu: tỉnh lần lượt cắm cờ màu team, điểm cộng dồn
  goal(st) {
    const tiles = [
      { id: 'a', x: 70, y: 60, label: '100' }, { id: 'b', x: 130, y: 95, label: '150' }, { id: 'c', x: 70, y: 130, label: '100' },
      { id: 'd', x: 190, y: 60, label: '300' }, { id: 'e', x: 190, y: 130, label: '200' }, { id: 'f', x: 250, y: 95, label: '100' },
    ]
    const m = miniMap(tiles)
    st.append(m.svg)
    ;['a', 'b', 'd', 'e'].forEach((id, i) => {
      m.tile(id).classList.add('claim', `c${i + 1}`)
      const f = pin(h('span', `r-flag f${i + 1}`, ic('flag', 22)), tiles.find(t => t.id === id).x, tiles.find(t => t.id === id).y - 22)
      st.append(f)
    })
    st.append(h('div', 'r-score', h('span', 'muted', 'Điểm team'), h('b', 'goal-pts')))
  },

  // 2. Bắt đầu: đếm ngược 3·2·1 → nón lá rơi xuống tỉnh xuất phát bí mật
  start(st) {
    const tiles = [
      { id: 'a', x: 70, y: 60 }, { id: 'b', x: 130, y: 95 }, { id: 'c', x: 70, y: 130 },
      { id: 'd', x: 190, y: 60 }, { id: 'e', x: 190, y: 130 }, { id: 'f', x: 250, y: 95 },
    ]
    const m = miniMap(tiles.map(t => ({ ...t, cls: 'fog' })))
    m.tile('b').classList.add('home')
    st.append(m.svg)
    for (const [n, cls] of [['3', 'n3'], ['2', 'n2'], ['1', 'n1']]) st.append(h('span', `r-count ${cls}`, n))
    st.append(h('span', 'r-go pill', 'Bắt đầu!'))
    st.append(pin(h('span', 'r-drop', hat()), 130, 78))
    st.append(h('span', 'r-cap', 'Tỉnh xuất phát bí mật'))
  },

  // 3. Di chuyển: bấm tỉnh giáp ranh → nón lá nhảy sang; tỉnh xa còn sương mù
  move(st) {
    const tiles = [
      { id: 'a', x: 70, y: 60, cls: 'fog', label: '?' }, { id: 'b', x: 130, y: 95, cls: 'mine' }, { id: 'c', x: 70, y: 130, cls: 'near' },
      { id: 'd', x: 190, y: 60, cls: 'near' }, { id: 'e', x: 190, y: 130, cls: 'near' }, { id: 'f', x: 250, y: 95, cls: 'fog', label: '?' },
    ]
    const m = miniMap(tiles)
    m.tile('d').classList.add('target')
    st.append(m.svg)
    st.append(pin(h('span', 'r-hop', hat()), 130, 78))
    st.append(pin(h('span', 'r-cursor', ic('chevron', 26)), 200, 70))
    st.append(pin(h('span', 'r-tap'), 190, 60))
    st.append(h('div', 'r-qcard', h('b', '', 'Trạm mới!'), h('span', '', 'Câu hỏi bật lên…')))
    st.append(h('span', 'r-legend', h('i', 'lg near'), 'đi được', h('i', 'lg fog'), 'sương mù'))
  },

  // 4. Câu hỏi: đồng hồ 30 giây (15 giây đầu đủ điểm), đồng đội bỏ phiếu → tự chốt
  question(st) {
    const opts = ['Lòng lợn', 'Chả quế', 'Nước mắm ớt', 'Thịt luộc']
    const card = h('div', 'r-q',
      h('div', 'r-q-head', h('b', '', 'Trạm: Nghệ An · 100 điểm'), h('span', 'r-pts')),
      h('div', 'r-timer', h('span', 'free'), h('span', 'bar')),
      h('p', 'r-q-text', 'Bánh mướt Nghệ An thường ăn kèm gì?'),
      h('div', 'r-opts', ...opts.map((t, i) => h('span', `r-opt${i === 1 ? ' right' : ''}`, h('i', '', String(i + 1)), t))))
    const opt = card.querySelectorAll('.r-opt')[1]
    opt.append(h('span', 'r-voters', h('span', 'v v1', 'An'), h('span', 'v v2', 'Bình'), h('span', 'v v3', 'Chi')))
    card.append(h('span', 'r-stamp', 'Cả team chọn — tự chốt!'))
    st.append(card)
  },

  // 5. Đúng / Sai / Bỏ qua
  outcomes(st) {
    const panel = (cls, title, ...kids) => h('div', `r-oc ${cls}`, h('b', 'r-oc-t', title), ...kids)
    const good = panel('good', 'Đúng', h('span', 'r-tile'), h('span', 'r-sticker'), h('span', 'r-plus', '+100'), h('span', 'r-oc-flag', ic('flag', 22)))
    const bad = panel('bad', 'Sai', h('span', 'r-optx', 'Chả quế', h('span', 'x')), h('span', 'r-lock pill', ic('timer', 18), 'Nghỉ 30 giây'))
    const skip = panel('skip', 'Bỏ qua',
      h('span', 'r-two', h('span', 'r-tile sm prev'), h('span', 'r-tile sm cur')),
      h('span', 'r-back', hat()), h('span', 'r-lock pill', ic('timer', 18), 'Nghỉ 10 giây+'))
    st.append(h('div', 'r-oc-row', good, bad, skip))
  },

  // 6. Cược · Siêu tốc · Chuỗi đúng
  bonus(st) {
    const bet = h('div', 'r-bn bet', h('span', 'r-bn-t', 'Mạo hiểm'),
      h('span', 'r-betbtns', h('span', 'r-bb safe', ic('flag', 18), 'Chắc ăn'), h('span', 'r-bb risky', ic('bet', 18), 'Mạo hiểm')),
      h('span', 'r-gain', '+50%'))
    const speed = h('div', 'r-bn speed', h('span', 'r-bn-t', 'Siêu tốc'),
      h('span', 'r-ring', h('span', 'r-ring-in', ic('timer', 26))), h('span', 'r-sec'),
      h('span', 'r-gain', '+10%'))
    const flames = h('span', 'r-flames', ...[1, 2, 3].map(i => h('span', `fl fl${i}`, ic('streak', 26))))
    const streak = h('div', 'r-bn streak', h('span', 'r-bn-t', 'Chuỗi 3 câu đúng'), flames,
      h('span', 'r-mini-card', ic('fifty', 26), h('small', '', 'Thẻ trợ giúp')))
    st.append(h('div', 'r-bn-col', bet, speed, streak))
  },

  // 7. Ghé thăm thử tài: hai lá cờ trên tỉnh → thanh kéo co → hai kết cục
  siege(st) {
    const hero = h('div', 'r-siege-hero')
    const m = miniMap([
      { id: 'a', x: 70, y: 110, cls: 'mine' }, { id: 'b', x: 150, y: 110, cls: 'taken', label: '' }, { id: 'c', x: 230, y: 110, cls: 'fog' },
    ], { h: 200 })
    hero.append(m.svg)
    const flag = (side, me) => {
      const f = h('span', `r-sflag ${side}`, h('span', 'pole'), h('span', 'cloth', badge(me, 26)), h('span', 'who', me ? 'Đội bạn' : 'Chủ nhà'))
      f.style.setProperty('--team', me ? ME.color : '#6B7280')
      return pin(f, side === 'l' ? 104 : 196, 112)
    }
    hero.append(flag('l', true), flag('r', false), pin(h('span', 'r-spark'), 150, 60))
    st.append(hero)
    const duel = cls => h('div', `r-duel ${cls}`,
      h('span', 'end', badge(true, 24)), h('span', 'lane', h('span', 'rope'), h('span', 'knot')), h('span', 'end foe', badge(false, 24)))
    const win = h('div', 'r-so win', duel('win'), h('span', 'r-so-tile'), h('b', '', 'Bạn đúng trước'), h('span', 'r-so-res', 'Thành chủ nhà mới +50'))
    const lose = h('div', 'r-so lose', duel('lose'), h('span', 'r-so-shield', ic('shield', 34)), h('b', '', 'Chủ nhà đúng trước'), h('span', 'r-so-res', 'Được mời về · nghỉ 30 giây'))
    st.append(h('div', 'r-so-row', win, lose))
  },

  // 8. Thẻ bài: lật lần lượt
  cards(st) {
    const list = [['scout', 'Ống nhòm'], ['shield', 'Hàng rào'], ['march', 'Xe tốc hành'], ['fifty', '50:50'], ['time', 'Thêm giờ']]
    st.append(h('div', 'r-cards', ...list.map(([n, t], i) => h('span', `r-card k${i + 1}`,
      h('span', 'face', ic(n, 34), h('small', '', t)), h('span', 'back', ic('card', 30))))))
    st.append(h('span', 'r-cap', 'Tối đa 3 thẻ · dùng 1 lần'))
  },

  // 9. Sự kiện
  events(st) {
    const fest = h('div', 'r-ev fest', h('b', '', 'Lễ hội'), h('span', 'r-ev-ic', ic('festival', 40)),
      ...[1, 2, 3].map(i => h('span', `lan l${i}`)), h('span', 'r-gain', '+100'))
    const storm = h('div', 'r-ev storm', h('b', '', 'Bão'), h('span', 'r-ev-ic spin', ic('storm', 44)), h('span', 'r-nogo', 'Không vào được'))
    const gold = h('div', 'r-ev gold', h('b', '', 'Câu hỏi vàng'), h('span', 'r-ev-ic coin', ic('golden', 44)), h('span', 'r-gain', '×2'))
    const rumor = h('div', 'r-ev rumor', h('b', '', 'Tin đồn'), h('span', 'r-ev-ic', ic('rumor', 40)),
      h('span', 'r-ticker', h('span', '', 'Team dẫn đầu đang giữ 7 tỉnh…')))
    st.append(h('div', 'r-ev-grid', fest, storm, gold, rumor))
  },

  // 10. Điểm: ví dụ cộng dồn 810
  score(st) {
    const parts = [['Tỉnh', 300, 'p1'], ['Câu vàng', 300, 'p2'], ['Mạo hiểm', 150, 'p3'], ['Siêu tốc', 60, 'p4']]
    st.append(h('p', 'r-ex', 'Ví dụ: thành phố 300 điểm, câu vàng + Mạo hiểm + siêu tốc'))
    st.append(h('div', 'r-stack', ...parts.map(([t, v, c]) => {
      const seg = h('span', `seg ${c}`, h('b', '', `+${v}`), h('small', '', t))
      seg.style.flexGrow = String(v)
      return seg
    })))
    st.append(h('div', 'r-total', h('span', 'muted', 'Tổng'), h('b', 'score-pts')))
  },

  // 11. Phím tắt
  tips(st) {
    const key = (t, cls) => h('kbd', cls, t)
    st.append(h('div', 'r-keys', key('1', 'kk1'), key('2', 'kk2'), key('3', 'kk3'), key('4', 'kk4'), key('Enter', 'kk5 wide')))
    st.append(h('div', 'r-esc', key('Esc', 'kk6'), h('span', 'r-screen', h('span', 'r-cover', 'Đã che màn hình'))))
  },
}

// ---------- Dựng + chạy khi nhìn thấy ----------
fillIcons()
const io = new IntersectionObserver(entries => {
  for (const e of entries) e.target.classList.toggle('on', e.isIntersecting)
}, { threshold: 0.35 })
for (const st of document.querySelectorAll('.stage[data-scene]')) {
  SCENES[st.dataset.scene]?.(st)
  io.observe(st)
}
// Mục lục: tô mục đang đọc
const links = new Map([...document.querySelectorAll('.rules-nav a')].map(a => [a.hash.slice(1), a]))
const spy = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue
    links.forEach((a, id) => a.classList.toggle('on', id === e.target.id))
    // mục đang đọc cuộn vào giữa dải mục lục (điện thoại: dải bị cắt, cuộn ngang)
    const a = links.get(e.target.id), nav = a?.parentElement
    if (a && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' })
  }
}, { rootMargin: '-40% 0px -55% 0px' })
document.querySelectorAll('.rule').forEach(r => spy.observe(r))
