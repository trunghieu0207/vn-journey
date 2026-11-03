// Nhạc nền tự tổng hợp bằng Web Audio — không tải file, không vướng bản quyền.
// Hai bài tự soạn, thang ngũ cung trưởng (C D E G A) cho vui tươi, chất đồng quê / tuổi thơ kiểu nhạc game cũ. Phối nhiều nhạc cụ:
//   sáo trúc (dẫn giai điệu, rung hơi, luyến) · đàn tranh (rải hợp âm, vuốt dây đầu đoạn, có lúc dẫn giai điệu / bè dưới)
//   đàn nguyệt (bè trầm nảy) · mõ, phách, trống cơm, sênh (nhịp) · tiếng "bíp" máy game cũ nhân đôi giai điệu khi đang chơi.
// Ba sắc thái: calm (trang chủ, sảnh chờ — ít bộ gõ), play (đang chơi — đủ bộ gõ, nhanh hơn), finale (công bố kết quả — nhanh nhất,
// trống dồn); mode(null) = im (vd. phòng theo team). Trình duyệt chỉ cho phát sau cú bấm đầu tiên.
// Tab bị ẩn → tạm dừng (đỡ tốn pin, hẹn giờ nền bị hãm làm nhạc vấp).

const C4 = 261.63
const PENTA = [0, 2, 4, 7, 9]
const semisOf = idx => PENTA[((idx % 5) + 5) % 5] + 12 * Math.floor(idx / 5) // bậc ngũ cung thứ idx (0 = C4, 5 = C5)
const hz = semis => C4 * 2 ** (semis / 12)

// Hợp âm: [nốt gốc (nửa cung so với C4), thứ?]
const CH = { C: [0, 0], G: [-5, 0], Am: [-3, 1], F: [-7, 0] }
const tonesOf = ([root, minor]) => [root, root + (minor ? 3 : 4), root + 7]

// Giai điệu: mỗi ô nhịp 8 móc đơn, [bậc, số móc đơn] — bậc null = nghỉ
const bar = (chord, notes) => ({ chord: CH[chord], notes })
const A1 = bar('C', [[3, 1], [4, 1], [5, 2], [4, 1], [3, 1], [2, 2]])
const A2 = bar('G', [[1, 1], [2, 1], [3, 2], [2, 1], [1, 1], [1, 2]])
const A3 = bar('Am', [[2, 1], [3, 1], [4, 2], [5, 1], [4, 1], [3, 1], [2, 1]])
const A4 = bar('G', [[4, 1], [3, 1], [2, 1], [1, 1], [1, 4]])
const A4e = bar('C', [[1, 1], [2, 1], [1, 1], [0, 1], [0, 4]])
const B = [
  bar('F', [[5, 1], [5, 1], [6, 1], [5, 1], [4, 2], [3, 2]]),
  bar('C', [[7, 1], [6, 1], [5, 1], [4, 1], [3, 2], [2, 2]]),
  bar('Am', [[4, 1], [5, 1], [6, 2], [7, 1], [6, 1], [5, 2]]),
  bar('G', [[6, 2], [5, 1], [4, 1], [3, 4]]),
]
const T1 = bar('C', [[5, 1], [4, 1], [3, 1], [4, 1], [5, 2], [6, 2]])
const T = [
  T1,
  bar('Am', [[7, 1], [6, 1], [5, 1], [4, 1], [4, 2], [null, 2]]),
  bar('F', [[4, 1], [5, 1], [4, 1], [3, 1], [2, 2], [3, 2]]),
  bar('G', [[1, 1], [2, 1], [3, 1], [4, 1], [3, 4]]),
]
const T2 = [
  T1,
  bar('Am', [[7, 1], [8, 1], [7, 1], [6, 1], [5, 2], [4, 2]]),
  bar('G', [[3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [6, 1], [5, 1], [4, 1]]),
  bar('C', [[5, 4], [null, 4]]),
]
// Thứ tự đoạn: lead = nhạc cụ dẫn, harm = đàn tranh đánh bè dưới, chip = tiếng máy game nhân đôi (chỉ khi đang chơi / công bố)
const SONG = [
  { bars: [A1, A2, A3, A4], lead: 'tranh' },
  { bars: [A1, A2, A3, A4e], lead: 'flute' },
  { bars: B, lead: 'flute', harm: true },
  { bars: [A1, A2, A3, A4e], lead: 'flute', chip: true },
  { bars: T, lead: 'flute' },
  { bars: T2, lead: 'flute', harm: true },
  { bars: T, lead: 'tranh', chip: true },
  { bars: T2, lead: 'flute', harm: true, chip: true },
]
for (const s of SONG) for (const b of s.bars) { // bước bắt đầu của từng nốt trong ô nhịp
  if (b.at) continue
  b.at = new Map()
  let p = 0
  for (const [idx, len] of b.notes) { if (idx !== null) b.at.set(p, [idx, len]); p += len }
}

const STYLE = {
  calm: { bpm: 112, swing: 0.12, arp: true, perc: 1, chip: false },
  play: { bpm: 132, swing: 0.08, arp: false, perc: 2, chip: true },
  finale: { bpm: 144, swing: 0.05, arp: false, perc: 3, chip: true },
}
const LEVEL = 0.16

let ctx = null, master = null, noise = null, timer = 0
let on = false, style = null, key = 'vnj-music', gestured = false
let pos = 0, nextAt = 0 // pos: số móc đơn đã chơi kể từ đầu bài

// ---------- Nhạc cụ ----------
function env(t, attack, peak, end, dest = master) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, end)
  g.connect(dest)
  return g
}
function osc(type, f, t, end, into) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  o.connect(into)
  o.start(t)
  o.stop(end + 0.05)
  return o
}
function noiseHit(t, dur, gain, type, freq, q = 1) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  src.connect(f).connect(env(t, 0.002, gain, t + dur))
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.05)
}

// Sáo trúc: sin + bồi âm nhẹ, hơi thổi lúc vào, rung (vibrato) tăng dần, có lúc luyến lên
function flute(semis, t, dur, gain, scoop) {
  const f = hz(semis + 12), end = t + dur
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.035)
  g.gain.setValueAtTime(gain * 0.85, Math.max(t + 0.04, end - 0.06))
  g.gain.linearRampToValueAtTime(0.0001, end + 0.04)
  g.connect(master)
  const lfo = ctx.createOscillator(), depth = ctx.createGain()
  lfo.frequency.value = 5.6
  depth.gain.setValueAtTime(0, t)
  depth.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.3, dur * 0.7))
  lfo.connect(depth)
  lfo.start(t)
  lfo.stop(end + 0.1)
  for (const [mul, k] of [[1, 1], [2, 0.14], [3, 0.04]]) {
    const part = ctx.createGain()
    part.gain.value = k
    part.connect(g)
    const o = osc('sine', f * mul, t, end + 0.05, part)
    if (scoop) { o.frequency.setValueAtTime(f * mul * 0.94, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.07) }
    if (mul === 1) depth.connect(o.frequency)
  }
  noiseHit(t, 0.09, gain * 0.25, 'bandpass', f * 1.5, 1.2) // hơi thổi
}

// Đàn tranh: gảy dây sáng, tắt dần; bend = nhấn (luyến lên nửa cung)
function tranh(semis, t, dur, gain, bend = false) {
  const f = hz(semis), end = t + dur
  const g = env(t, 0.004, gain, end)
  for (const [type, mul, k] of [['triangle', 1, 1], ['sine', 2, 0.35], ['sine', 3, 0.1]]) {
    const part = ctx.createGain()
    part.gain.value = k
    part.connect(g)
    const o = osc(type, f * mul, t, end, part)
    if (bend) { o.frequency.setValueAtTime(f * mul * 0.944, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.1) }
  }
}

// Đàn nguyệt (bè trầm): gảy tròn, ngắn
function nguyet(semis, t, gain) {
  const f = hz(semis - 12), end = t + 0.38
  const g = env(t, 0.005, gain, end)
  osc('triangle', f, t, end, g)
  osc('sine', f / 2, t, end, env(t, 0.005, gain * 0.6, end))
}

// Tiếng "bíp" máy game cũ: sóng vuông ngắn, nhỏ, cao hơn một quãng tám
function chip(semis, t, gain) {
  const end = t + 0.16
  osc('square', hz(semis + 24), t, end, env(t, 0.003, gain, end))
}

const mo = (t, gain) => osc('sine', 1050, t, t + 0.07, env(t, 0.001, gain, t + 0.07)).frequency.exponentialRampToValueAtTime(820, t + 0.06)
const phach = (t, gain) => noiseHit(t, 0.035, gain, 'bandpass', 2600, 4)
const sanh = (t, gain) => noiseHit(t, 0.05, gain, 'highpass', 7000)
function trong(t, gain, high = false) {
  const end = t + (high ? 0.12 : 0.26)
  osc('sine', high ? 320 : 160, t, end, env(t, 0.002, gain, end)).frequency.exponentialRampToValueAtTime(high ? 200 : 62, end)
}

// Vuốt dây đàn tranh đầu mỗi đoạn
function gliss(t, gain) {
  for (let i = 0; i < 9; i++) tranh(semisOf(i), t - 0.3 + i * 0.032, 0.5, gain * (0.6 + i * 0.05))
}

// ---------- Lịch phát ----------
const STEPS = SONG.map(s => s.bars.length * 8)
const TOTAL = STEPS.reduce((a, b) => a + b, 0)

function play(p, t, eighth) {
  const st = STYLE[style]
  let k = p % TOTAL, si = 0
  while (k >= STEPS[si]) k -= STEPS[si++]
  const sec = SONG[si], b = sec.bars[Math.floor(k / 8)], s = k % 8
  const [r1, r3, r5] = tonesOf(b.chord)

  if (k === 0) gliss(t, 0.07)
  // Bè trầm: calm đi gốc–năm, đang chơi nảy cả 4 phách
  if (s === 0 || s === 4) nguyet(r1, t, 0.32)
  if ((st.perc > 1 && (s === 2 || s === 6)) || (st.perc === 1 && s === 6)) nguyet(r5, t, 0.24)
  // Đàn tranh đệm: calm rải hợp âm, đang chơi đánh chặt nhịp nghịch
  if (st.arp) tranh([r1, r3, r5, r1 + 12, r5 + 12, r1 + 12, r5, r3][s], t, 0.45, 0.05)
  else if (s % 2 === 1) for (const x of [r1, r3, r5]) tranh(x + 12, t, 0.16, 0.035)
  // Bộ gõ
  if (s === 2 || s === 6) mo(t, st.perc > 1 ? 0.2 : 0.13)
  if (st.perc > 1) {
    if (s % 2 === 1) phach(t, 0.09)
    sanh(t, s % 2 ? 0.05 : 0.03)
    if (s === 0 || s === 5) trong(t, 0.42)
    if (s === 4) trong(t, 0.2, true)
  }
  if (st.perc > 2 && (s === 2 || s === 6 || s === 7)) trong(t, 0.3)
  // Giai điệu
  const n = b.at.get(s)
  if (n) {
    const [idx, len] = n, semis = semisOf(idx), dur = len * eighth
    if (sec.lead === 'flute') flute(semis, t, dur * 0.95, 0.15, len >= 2 && (p * 7) % 3 === 0)
    else tranh(semis + 12, t, Math.max(0.5, dur * 1.4), 0.17, len >= 2 && (p * 5) % 3 === 0)
    if (sec.harm) tranh(semisOf(idx - 2) + 12, t, Math.max(0.4, dur * 1.2), 0.06)
    if (sec.chip && st.chip) chip(semis, t, 0.022)
  }
}

function tick() {
  const st = STYLE[style]
  const eighth = 60 / st.bpm / 2
  while (nextAt < ctx.currentTime + 0.45) { // lên lịch trước ~0,4 giây (tiếng vuốt dây bắt đầu sớm 0,3 giây)
    const swing = pos % 2 ? eighth * st.swing : 0
    play(pos, nextAt + swing, eighth)
    nextAt += eighth
    pos++
  }
}

// Safari iOS: AudioContext phải tạo / mở lại ngay trong cú bấm, tạo sau đó sẽ bị treo ở trạng thái suspended
function ensureCtx() {
  try {
    ctx ??= new AudioContext()
  } catch { return false }
  if (ctx.state === 'suspended') ctx.resume()
  return true
}

function start() {
  if (!on || !style || document.hidden || !ensureCtx()) return
  if (!master) {
    master = ctx.createGain()
    const comp = ctx.createDynamicsCompressor() // nhiều nhạc cụ cùng lúc không bị rè
    comp.threshold.value = -18
    comp.ratio.value = 4
    master.connect(comp).connect(ctx.destination)
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  master.gain.cancelScheduledValues(ctx.currentTime)
  master.gain.setValueAtTime(0.0001, ctx.currentTime)
  master.gain.exponentialRampToValueAtTime(LEVEL, ctx.currentTime + 1.2) // vào nhẹ
  nextAt = ctx.currentTime + 0.4 // chừa chỗ cho tiếng vuốt dây mở đầu
  clearInterval(timer)
  timer = setInterval(tick, 100)
  tick()
}

function stop() {
  clearInterval(timer)
  timer = 0
  if (ctx && master) {
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15)
  }
}

// Bật sẵn từ lần trước: phát ở lần chạm / gõ phím đầu tiên (chưa tới đoạn có nhạc thì vẫn mở sẵn AudioContext trong cú bấm)
for (const type of ['pointerdown', 'keydown']) {
  addEventListener(type, () => {
    gestured = true
    if (!on) return
    if (style && !timer) start()
    else ensureCtx()
  }, { capture: true })
}
document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))

export const music = {
  /** Đọc lựa chọn đã lưu của trang (mỗi trang một khóa, mặc định bật / tắt khác nhau) */
  setup(storageKey, defaultOn = false) {
    key = storageKey
    let saved = null
    try { saved = localStorage.getItem(key) } catch {}
    on = saved === null ? defaultOn : saved === '1'
  },
  get on() { return on },
  /** Gọi từ cú bấm của người dùng (trình duyệt mới cho phát) */
  setOn(v) {
    on = v
    try { localStorage.setItem(key, v ? '1' : '0') } catch {}
    if (v) start()
    else stop()
  },
  /** calm | play | finale | null (im). Đổi sắc thái → về đầu bài cho vào đúng câu nhạc */
  mode(m) {
    if (m === style) return
    const was = style
    style = m
    pos = 0
    if (!m) return stop()
    if (timer) nextAt = Math.max(nextAt, ctx.currentTime + 0.35)
    else if (!was && gestured) start() // im → có nhạc: chỉ phát khi trang đã có cú bấm (trình duyệt cho phép)
  },
  /** Hạ nhỏ một lúc cho hiệu ứng âm thanh nghe rõ (shared/sound.js gọi) */
  duck(ms = 1400) {
    if (!timer || !master) return
    const t = ctx.currentTime
    master.gain.cancelScheduledValues(t)
    master.gain.setTargetAtTime(LEVEL * 0.3, t, 0.04)
    master.gain.setTargetAtTime(LEVEL, t + ms / 1000, 0.4)
  },
}
