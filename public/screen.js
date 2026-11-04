// Màn chiếu (Phase 4): đồng hồ lớn, bản đồ "bí ẩn" (không màu team), bản tin ẩn danh, bảng điểm
// (đóng băng 10 phút cuối, trận ngắn 1/3 cuối), hết giờ thì tua lại trận → công bố xếp hạng từ cuối lên → pháo hoa.
// Chỉ nhận dữ liệu ẩn danh từ server (/api/screen); toàn bộ diễn biến chỉ mở sau khi kết thúc (/api/replay).

import { api, connectStream, formatClock, requireRole, serverClock } from '/shared/api.js'
import { createMap, heatTiles, heatNotes } from '/shared/map.js'
import { sound } from '/shared/sound.js'
import { music } from '/shared/music.js'
import '/shared/nocopy.js'
import { mascotIcon } from '/shared/mascots.js'
import { icon, labeled, fillIcons } from '/shared/icons.js'
import { fmtTime } from '/shared/results.js'
import { $, el } from '/shared/dom.js'
import * as fx from '/shared/fx.js'
import { eventLabel, eventSign, timedEvent } from '/shared/events.js'
import { sharedPanel, sharedTick } from '/shared/shared-q.js'
import { renderFact } from '/shared/facts.js'
import { cultureView } from '/shared/culture.js'

fillIcons() // icon trong HTML tĩnh (<span data-icon>): bông tuyết, nút Bỏ qua / Xem lại, tiêu đề khung diễn biến

const clock = serverClock()
const now = () => clock.now()
const wait = ms => new Promise(r => setTimeout(r, ms))
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

const REPLAY_MS = 40_000     // tua lại cả trận trong khoảng 40 giây
const STEAL_PAUSE_MS = 1_800 // dừng lại ở khoảnh khắc cướp tỉnh
const REVEAL_GAP_MS = 2_200  // công bố từng hạng cách nhau

let map = null
let view = null
let stream = null
let lastNewsAt = 0
let replay = null  // { token, raf, data }

// ---------- Đăng nhập ----------
function showEntry(message = '') {
  stream?.close()
  stream = null
  stopReplay()
  $('app').hidden = true
  $('entry').hidden = false
  $('loginError').textContent = message
  $('code').focus()
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault()
  $('loginError').textContent = ''
  try {
    await api('/api/screen/login', { code: $('code').value.trim(), screenCode: $('screenCode').value.trim() })
    sound.click() // lần bấm này cho phép trình duyệt phát âm thanh
    await enter()
  } catch (err) {
    $('loginError').textContent = err.message
  }
})

async function enter() {
  await requireRole('screen', 'owner') // chủ phòng mở màn chiếu cùng trình duyệt: dùng luôn phiên chủ phòng (server chỉ gửi dữ liệu màn chiếu)
  const v = await api('/api/screen')
  $('entry').hidden = true
  $('app').hidden = false
  if (!map) {
    const [geo, provinces] = await Promise.all([
      fetch('/data/map-geo.json').then(r => r.json()),
      api('/api/provinces'),
    ])
    map = createMap($('mapWrap'), { geo, provinces })
  }
  view = null
  apply(v)
  stream = connectStream({
    view: 'screen',
    poll: '/api/screen',
    onState: apply,
    onUnauthorized: () => showEntry('Phiên màn chiếu đã hết hạn, đăng nhập lại.'),
  })
}

// ---------- Nhận trạng thái ----------
function apply(v) {
  const prev = view
  view = v
  clock.sync(v.serverNow)

  // Tin mới: tỉnh liên quan nháy sóng vàng (không lộ team) + âm thanh
  const fresh = v.news.filter(n => n.at > lastNewsAt).reverse()
  if (prev && v.status !== 'ended') {
    for (const n of fresh) {
      if (n.province) map.burst(n.province, null, 'ripple')
      if (n.kind === 'capture') sound.capture()
      else if (n.kind === 'steal') sound.lost()
      else if (['event', 'start', 'shared', 'shared-result'].includes(n.kind)) sound.event()
      else if (n.kind === 'streak') sound.correct()
    }
  }
  lastNewsAt = Math.max(lastNewsAt, ...v.news.map(n => n.at))
  // Đếm ngược theo mốc giờ server (startedAt) — cả màn chiếu lẫn máy các team hiện "Bắt đầu!" cùng lúc.
  // Mở / tải lại trang giữa lúc đếm ngược cũng đếm tiếp phần còn lại
  if (v.status === 'running' && v.startedAt > now() && (!prev || prev.status === 'waiting')) fx.countdown('Bắt đầu!', v.startedAt - now())
  const evKey = e => (e ? `${e.kind}|${e.region}|${e.until}` : '')
  if (prev && timedEvent(v.event) && evKey(v.event) !== evKey(prev.event)) fx.hangSign(eventSign(v.event))

  if (v.status === 'ended' && prev?.status !== 'ended') startReplay()
  if (v.status !== 'ended' && replay) stopReplay()
  render()
}

function render() {
  const v = view
  music.mode(v.status === 'waiting' ? 'calm' : v.status === 'ended' ? (replay?.revealing ? 'finale' : 'calm') : 'play')
  $('roomName').textContent = v.room.name
  $('ticker').replaceChildren(labeled('rumor', v.news.length ? v.news.map(n => n.text).join('     ·     ') : 'Chào mừng đến với Hành trình 3 miền!'))
  $('ticker').style.animationDuration = `${Math.max(18, $('ticker').textContent.length * 0.22)}s`

  // Lớp phủ: sảnh chờ (mã phòng to để mọi người vào) / tạm dừng
  const ov = $('overlay')
  ov.hidden = !['waiting', 'paused'].includes(v.status) || !!v.shared
  renderShared(v)
  if (v.status === 'waiting') {
    $('ovTitle').textContent = 'Vào chơi ngay!'
    $('ovLink').textContent = `${location.origin}/?room=${v.room.code}`
    $('ovCode').textContent = v.room.code
    $('ovText').textContent = 'Mở link hoặc nhập mã phòng · chờ chủ phòng bắt đầu'
  } else if (v.status === 'paused') {
    $('ovTitle').replaceChildren(labeled('pause', 'Tạm dừng'))
    $('ovLink').textContent = ''
    $('ovCode').textContent = ''
    $('ovText').textContent = 'Chủ phòng đang tạm dừng trận đấu'
  }

  renderFeed(v)
  if (v.status === 'ended') return // phần còn lại do màn tua lại + công bố điều khiển

  // Bản đồ "bí ẩn": không màu team, chỉ hiện bão / lễ hội. Phòng đơn / Team gọn tắt Đấu: bản đồ nhiệt số người / số đội đã tới (không lộ là ai)
  const solo = v.room.mode === 'solo'
  map.render({
    current: null, trail: [], tiles: v.room.stamps ? heatTiles(v.heat) : {}, notes: v.room.stamps ? heatNotes(v.heat, solo ? 'người' : 'đội') : null,
    storm: v.event?.kind === 'storm' ? v.event.region : null,
    festival: v.event?.kind === 'festival' ? v.event.region : null,
  })

  $('replayButtons').hidden = true
  $('boardMore').hidden = true
  if (v.status === 'waiting') {
    $('boardTitle').textContent = solo ? `Lữ khách · ${v.players} người` : 'Các team'
    $('frozen').hidden = true
    renderRows(v.lobby.map(t => ({ key: t.name, color: t.color, mascot: t.mascot, name: t.name, value: solo ? '' : `${t.members}`, unit: solo ? '' : 'người' })))
  } else {
    $('boardTitle').textContent = solo ? `Top ${v.scoreboard?.length ?? ''} lữ khách` : 'Bảng điểm'
    $('frozen').hidden = !v.frozen
    $('scoreList').hidden = v.frozen
    if (!v.frozen) {
      const max = Math.max(1, ...v.scoreboard.map(s => s.total))
      renderRows(v.scoreboard.map((s, i) => ({
        key: s.name, rank: i + 1, color: s.color, mascot: s.mascot, name: s.name,
        value: s.total.toLocaleString('vi-VN'), unit: [`${s.provinces} ${solo ? 'tem' : 'tỉnh'} · `, labeled('timer', fmtTime(s.answerMs))], bar: Math.max(0, s.total) / max,
      })))
    }
    // Phòng đơn: còn lại xem hạng trên máy mình
    $('boardMore').hidden = !solo || v.frozen || v.players <= (v.scoreboard?.length ?? 0)
    $('boardMore').textContent = `và ${v.players - (v.scoreboard?.length ?? 0)} lữ khách khác · mỗi người xem hạng của mình trên máy`
  }
}

// Khung "Diễn biến mới nhất" (góc trái bản đồ): 5 tin gần nhất, tin mới nảy vào từ trên. Cùng nội dung ẩn danh với bản tin chạy chữ
// (không lộ đội nào); chỉ hiện lúc đang chơi — sảnh chờ, tạm dừng, câu hỏi chung, tua lại cuối trận đã có khung riêng
const FEED_ICONS = { capture: 'flag', steal: 'flag-unknown', defend: 'shield', start: 'play', end: 'finish', finish: 'trophy', streak: 'streak',
  pioneer: 'star', shared: 'question', 'shared-result': 'stats' }
const FEED_MAX = 5
const feedKey = n => `${n.at}|${n.kind}|${n.text}`

function renderFeed(v) {
  const box = $('feed')
  const items = v.news.slice(0, FEED_MAX)
  box.hidden = v.status !== 'running' || !!v.shared || !items.length
  if (box.hidden) return
  const list = $('feedList')
  const shown = new Set([...list.children].map(li => li.dataset.key))
  list.replaceChildren(...items.map(n =>
    el('li', { class: `feed-item${shown.size && !shown.has(feedKey(n)) ? ' enter' : ''}`, 'data-key': feedKey(n), 'data-at': n.at },
      icon(n.kind === 'event' ? n.sub ?? 'rumor' : FEED_ICONS[n.kind] ?? 'rumor', { size: '1.4em' }),
      el('span', {}, n.text),
      el('small', { class: 'feed-age' }, ago(n.at)))))
}

// "vừa xong" / "25 giây trước" / "3 phút trước" — cập nhật mỗi giây cùng đồng hồ
function ago(at) {
  const s = Math.max(0, Math.floor((now() - at) / 1000))
  return s < 10 ? 'vừa xong' : s < 60 ? `${s} giây trước` : `${Math.floor(s / 60)} phút trước`
}

// Vẽ danh sách điểm; hàng đổi vị trí thì trượt mượt (FLIP). Đội vượt hạng: nhấc lên (to, nghiêng) trượt qua,
// nhãn "lên N hạng" bật ra; điểm đổi thì đếm dần tới số mới.
const lastValue = new Map() // key → điểm (số) lần vẽ trước
function renderRows(rows) {
  const list = $('scoreList')
  list.hidden = false
  const before = new Map([...list.children].map(li => [li.dataset.key, li.getBoundingClientRect().top]))
  const oldRank = new Map([...list.children].map((li, i) => [li.dataset.key, i]))
  list.replaceChildren(...rows.map(r => {
    const bar = el('span', { class: 'bar' })
    bar.style.background = r.color
    bar.style.width = `${Math.round((r.bar ?? 0) * 100)}%`
    const li = el('li', { class: `score-row${r.highlight ? ' winner' : ''}`, 'data-key': r.key },
      el('span', { class: 'rank' }, r.rank ? String(r.rank) : ''),
      mascotIcon(r.mascot, r.color, 44),
      el('span', { class: 'name' }, r.name, r.bar != null ? el('span', { class: 'bar-track' }, bar) : ''),
      el('span', { class: 'value' }, el('b', {}, r.value), el('small', {}, ...[r.unit].flat())))
    return li
  }))
  const num = s => Number(String(s).replace(/[^\d-]/g, '')) || 0
  rows.forEach((r, i) => {
    const li = list.children[i], b = li.querySelector('.value b')
    const prevVal = lastValue.get(r.key), v = num(r.value)
    lastValue.set(r.key, v)
    if (!reducedMotion && r.bar != null && prevVal != null && prevVal !== v) {
      fx.countUp(b, prevVal, v, 800, n => n.toLocaleString('vi-VN'))
      fx.bump(b, 1.3)
    }
  })
  if (reducedMotion) return
  ;[...list.children].forEach((li, i) => {
    const old = before.get(li.dataset.key)
    if (old == null) { li.classList.add('enter'); return }
    const dy = old - li.getBoundingClientRect().top
    if (!dy) return
    const up = oldRank.get(li.dataset.key) - i
    if (up > 0) {
      // vượt hạng: nhấc lên, trượt qua các đội khác
      li.style.zIndex = '2'
      li.animate([
        { transform: `translateY(${dy}px) scale(1) rotate(0deg)` },
        { transform: `translateY(${dy - 10}px) scale(1.05) rotate(-1.5deg)`, offset: 0.25 },
        { transform: 'translateY(-8px) scale(1.05) rotate(-1deg)', offset: 0.8 },
        { transform: 'none' },
      ], { duration: 820, easing: 'ease-in-out' }).finished.then(() => { li.style.zIndex = '' }, () => {})
      const badge = el('span', { class: 'up-badge' }, `lên ${up} hạng`)
      li.append(badge)
      badge.animate([
        { transform: 'scale(0) rotate(-20deg)', opacity: 0 }, { transform: 'scale(1.2) rotate(6deg)', opacity: 1, offset: 0.6 }, { transform: 'scale(1) rotate(4deg)', opacity: 1 },
      ], { duration: 480, delay: 700, easing: fx.OVERSHOOT, fill: 'backwards' })
      setTimeout(() => badge.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished.then(() => badge.remove(), () => {}), 4000)
    } else {
      li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 480, delay: 260, easing: 'cubic-bezier(.3, 1.6, .5, 1)', fill: 'backwards' })
    }
  })
}

// ---------- Câu hỏi chung cả phòng: khung lớn giữa bản đồ (tỉ lệ chọn chỉ có sau khi công bố) ----------
function renderShared(v) {
  const sh = v.status === 'ended' ? null : v.shared
  $('sharedBoard').hidden = !sh
  if (!sh) return
  $('sharedBoard').replaceChildren(sharedPanel(sh, { provinceName: map.byId.get(sh.province)?.name ?? '' }))
  sharedTick($('sharedBoard'), sh, now())
}

// ---------- Đồng hồ ----------
setInterval(() => {
  if (!view) return
  const t = now()
  const left = view.status === 'running' ? view.endsAt - t
    : view.status === 'paused' ? view.endsAt - view.pausedAt
    : view.status === 'ended' ? 0
    : view.room.durationMin * 60_000
  $('clock').textContent = view.status === 'ended' ? 'Hết giờ!' : formatClock(left)
  for (const li of $('feedList').children) li.querySelector('.feed-age').textContent = ago(Number(li.dataset.at))
  if (view.shared && !$('sharedBoard').hidden) sharedTick($('sharedBoard'), view.shared, t)
  // Sảnh chờ "Bạn có biết?": sang câu mới thì tỉnh của câu nháy sóng trên bản đồ
  if (renderFact($('factBox'), view.status === 'waiting' ? view.facts : null, view.factMs, t, id => map.byId.get(id)?.name ?? '')) {
    map.burst(view.facts[Number($('factBox').dataset.slot) % view.facts.length].province, null, 'ripple')
  }
  $('clock').classList.toggle('warn', view.status === 'running' && left < 60_000)
  const ev = view.event && view.event.until > t ? view.event : null
  $('eventPill').hidden = !ev
  if (ev) {
    $('eventPill').replaceChildren(labeled(ev.kind, `${eventLabel(ev)} · ${formatClock(ev.until - t)}`))
    $('eventPill').classList.toggle('storm', ev.kind === 'storm')
    $('eventPill').classList.toggle('golden', ev.kind === 'golden')
  }
}, 250)

// ---------- Tua lại trận + công bố ----------
function stopReplay() {
  $('cultureBoard').hidden = true
  $('eventBoard').hidden = true
  if (!replay) return
  cancelAnimationFrame(replay.raf)
  replay = null
  $('caption').hidden = true
  $('replayButtons').hidden = true
}

function showCaption(text, ic) {
  const c = $('caption')
  c.replaceChildren(ic ? labeled(ic, text) : text)
  c.hidden = false
  fx.stickerIn(c, { base: 'translateX(-50%)', tilt: -8 })
}

async function startReplay() {
  stopReplay()
  const token = {}
  replay = { token }
  let data
  try {
    data = await api('/api/replay')
  } catch {
    return
  }
  if (replay?.token !== token) return
  replay.data = data

  const teams = new Map(data.teams.map((t, i) => [t.id, { ...t, no: i + 1 }]))
  $('replayButtons').hidden = false
  $('eventBtn').hidden = data.mode !== 'solo'
  // Phòng đơn / Team gọn tắt Đấu: không tua bản đồ (tỉnh không thuộc riêng ai) — công bố luôn
  if (data.mode === 'solo' || data.stamps) return reveal(token)
  $('frozen').hidden = true
  $('boardTitle').textContent = 'Tua lại trận đấu'
  renderRows(data.teams.map((t, i) => ({ key: t.name, rank: i + 1, color: t.color, mascot: t.mascot, name: t.name, value: '', unit: '' })))

  const events = data.events.filter(e => ['spawn', 'move', 'retreat', 'pushed-back', 'capture', 'steal'].includes(e.action))
  const owner = new Map(), pos = new Map()
  const draw = () => map.render({
    current: null, trail: [],
    tiles: Object.fromEntries([...owner].map(([p, t]) => [p, { owner: 'owned', color: teams.get(t)?.color }])),
    pins: [...pos].map(([t, p]) => ({ province: p, color: teams.get(t).color, text: String(teams.get(t).no) })),
  })
  const applyEvent = e => {
    if (e.action === 'capture' || e.action === 'steal') owner.set(e.province_id, e.team_id)
    else pos.set(e.team_id, e.province_id)
  }
  draw()
  if (!events.length) return reveal(token)

  const t0 = events[0].created_at
  const span = Math.max(1, events.at(-1).created_at - t0)
  let i = 0, played = 0, last = performance.now(), pauseUntil = 0
  const step = ts => {
    if (replay?.token !== token) return
    const dt = ts - last
    last = ts
    if (ts >= pauseUntil) {
      played += dt
      const until = t0 + (played / REPLAY_MS) * span
      let changed = false
      while (i < events.length && events[i].created_at <= until) {
        const e = events[i++]
        applyEvent(e)
        changed = true
        if (e.action === 'capture') map.burst(e.province_id, teams.get(e.team_id).color)
        if (e.action === 'steal') {
          // Khoảnh khắc cướp tỉnh: dừng lại cho cả hội trường xem
          draw()
          map.burst(e.province_id, teams.get(e.team_id).color)
          sound.lost()
          showCaption(`${teams.get(e.team_id).name} thành chủ nhà mới của ${map.byId.get(e.province_id).name} (thay ${teams.get(e.detail?.fromTeam)?.name ?? 'đội khác'})!`, 'siege')
          pauseUntil = ts + STEAL_PAUSE_MS
          break
        }
      }
      if (changed) draw()
      if (ts >= pauseUntil) $('caption').hidden = true
    }
    if (i >= events.length && ts >= pauseUntil) {
      setTimeout(() => reveal(token), 1200)
      return
    }
    replay.raf = requestAnimationFrame(step)
  }
  replay.raf = requestAnimationFrame(step)
  replay.finish = () => { // Bỏ qua: hiện ngay trạng thái cuối
    while (i < events.length) applyEvent(events[i++])
    draw()
  }
}

// Công bố xếp hạng từ cuối lên; hạng 1: pháo hoa + tiếng trống
async function reveal(token, fast = false) {
  if (replay?.token !== token || replay.revealing) return
  replay.revealing = true
  music.mode('finale')
  $('caption').hidden = true
  $('boardTitle').replaceChildren(labeled('trophy', 'Bảng xếp hạng'))
  const solo = replay.data.mode === 'solo'
  const scores = solo ? replay.data.scores.slice(0, 10) : replay.data.scores
  const max = Math.max(1, ...scores.map(s => s.total))
  const row = (s, i) => ({
    key: s.name, rank: i + 1, color: s.color, mascot: s.mascot, name: s.name, highlight: i === 0,
    value: s.total.toLocaleString('vi-VN'), unit: [`${s.provinces} ${solo ? 'tem' : 'tỉnh'} · `, labeled('timer', fmtTime(s.answerMs))], bar: Math.max(0, s.total) / max,
  })
  $('scoreList').replaceChildren()
  for (let k = scores.length - 1; k >= 0; k--) {
    if (!fast) await wait(REVEAL_GAP_MS)
    if (replay?.token !== token) return
    renderRows(scores.slice(k).map((s, j) => row(s, k + j)))
    if (!fast && k > 0) sound.click()
  }
  if (!scores.length) return
  showCaption(`${scores[0].name} vô địch!`, 'trophy')
  sound.capture()
  setTimeout(() => sound.event(), 400)
  fireworks(scores.map(s => s.color))
}

$('replayBtn').addEventListener('click', () => {
  sound.click()
  $('cultureBoard').hidden = true
  startReplay()
})
// Tổng kết "Hành trình văn hóa": MC bấm để chiếu (bấm lại để về bản đồ)
$('cultureBtn').addEventListener('click', () => {
  if (!replay?.data) return
  sound.click()
  const board = $('cultureBoard')
  if (board.hidden) board.replaceChildren(cultureView(replay.data.culture, id => map.byId.get(id)?.name ?? id))
  board.hidden = !board.hidden
  $('eventBoard').hidden = true
})
// Phòng đơn: bảng xếp hạng cá nhân cả sự kiện (mọi phòng đơn đã kết thúc) — top 10, bản đầy đủ ở /leaderboard
$('eventBtn').addEventListener('click', async () => {
  const board = $('eventBoard')
  sound.click()
  $('cultureBoard').hidden = true
  if (!board.hidden) return void (board.hidden = true)
  let data
  try {
    data = await api('/api/leaderboard')
  } catch {
    return
  }
  const top = data.entries.slice(0, 10)
  board.replaceChildren(
    el('h2', {}, labeled('trophy', 'Bảng xếp hạng cả sự kiện')),
    el('p', { class: 'muted' }, `${data.players.toLocaleString('vi-VN')} lữ khách · cộng dồn điểm mọi trận · xem đầy đủ: ${location.host}/leaderboard`),
    top.length
      ? el('ol', { class: 'event-list' }, ...top.map(e => el('li', {},
        el('span', { class: 'event-rank' }, e.rank <= 3 ? icon(`medal${e.rank}`, { size: 40, label: `Hạng ${e.rank}` }) : String(e.rank)),
        mascotIcon([...e.name][0]?.toLocaleUpperCase('vi') ?? '?', e.color, 44),
        el('b', {}, e.name),
        el('span', { class: 'event-meta' }, `${e.stamps} tem`),
        el('span', { class: 'event-score' }, e.score.toLocaleString('vi-VN')))))
      : el('p', {}, 'Chưa có trận chơi đơn nào kết thúc.'))
  board.hidden = false
})
$('skipBtn').addEventListener('click', () => {
  if (!replay?.data || replay.revealing) return
  cancelAnimationFrame(replay.raf)
  replay.finish?.()
  reveal(replay.token, true)
})

// ---------- Pháo hoa (canvas tự vẽ) ----------
function fireworks(colors) {
  if (reducedMotion) return
  const canvas = $('fireworks')
  const ctx = canvas.getContext('2d')
  canvas.width = innerWidth
  canvas.height = innerHeight
  canvas.hidden = false
  const palette = [...colors, '#FFC800', '#FF4B4B', '#1CB0F6', '#58CC02']
  const particles = []
  const burst = () => {
    const x = innerWidth * (0.15 + Math.random() * 0.7), y = innerHeight * (0.15 + Math.random() * 0.4)
    const color = palette[Math.floor(Math.random() * palette.length)]
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 6
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color })
    }
  }
  const start = performance.now()
  let next = 0
  const frame = ts => {
    const t = ts - start
    if (t < 5000 && t >= next) { burst(); next = t + 350 + Math.random() * 300 }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.08
      p.vx *= 0.985
      p.life -= 0.012
      if (p.life <= 0) continue
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1)
    if (t < 5000 || particles.length) requestAnimationFrame(frame)
    else canvas.hidden = true
  }
  requestAnimationFrame(frame)
}

// ---------- Hoa văn trống đồng làm nền (vòng đồng tâm + ngôi sao 14 cánh) ----------
function drawDrum() {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = $('drum')
  const add = (tag, attrs) => {
    const e = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
    svg.append(e)
  }
  const star = []
  for (let i = 0; i < 28; i++) {
    const r = i % 2 ? 34 : 95, a = Math.PI / 14 * i - Math.PI / 2
    star.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`)
  }
  add('polygon', { points: star.join(' ') })
  for (const r of [120, 160, 250, 290, 380, 420, 480]) add('circle', { r })
  // Vành răng cưa và vành chấm giữa các vòng
  for (let i = 0; i < 36; i++) {
    const a = Math.PI * 2 * i / 36, b = Math.PI * 2 * (i + 0.5) / 36
    add('polyline', { points: `${160 * Math.cos(a)},${160 * Math.sin(a)} ${250 * Math.cos(b)},${250 * Math.sin(b)} ${160 * Math.cos(a + Math.PI / 18)},${160 * Math.sin(a + Math.PI / 18)}` })
  }
  for (let i = 0; i < 60; i++) {
    const a = Math.PI * 2 * i / 60
    add('circle', { cx: 335 * Math.cos(a), cy: 335 * Math.sin(a), r: 9 })
  }
}
drawDrum()

// ---------- Âm thanh ----------
function renderMute() {
  $('muteBtn').replaceChildren(sound.muted ? labeled('sound-off', 'Bật âm thanh') : icon('sound-on', { label: 'Tắt âm thanh' }))
}
$('muteBtn').addEventListener('click', () => {
  sound.setMuted(!sound.muted)
  renderMute()
  sound.click()
})
renderMute()

// Nhạc nền (shared/music.js): máy chiếu mặc định bật — phát từ lúc MC bấm vào phòng (cú bấm cho phép trình duyệt phát)
music.setup('vnj-music-screen', true)
function renderMusic() {
  $('musicBtn').replaceChildren(music.on ? icon('music-on', { label: 'Tắt nhạc nền' }) : labeled('music-off', 'Bật nhạc nền'))
}
$('musicBtn').addEventListener('click', () => {
  music.setOn(!music.on)
  renderMusic()
})
renderMusic()

// ---------- Khởi động ----------
const invited = new URLSearchParams(location.search).get('room')
if (invited) $('code').value = invited.toUpperCase()
enter().catch(err => showEntry(err.status === 401 || err.status === 403 ? '' : err.message))
