// Nhạc nền tự tổng hợp bằng Web Audio — không tải file, không vướng bản quyền.
// Hai bài tự soạn, thang ngũ cung trưởng (C D E G A), chất đồng quê / tuổi thơ kiểu nhạc game cũ — bản du dương (4/11):
// nốt vào nhẹ, ngân dài, có tiếng vang. Phối: sáo trúc (dẫn giai điệu liền hơi, rung, luyến) · đàn tranh (rải hợp âm ngân chồng,
// vuốt dây đầu đoạn, có lúc dẫn giai điệu / bè dưới) · nền hợp âm ngân · đàn nguyệt (bè trầm) · mõ, sênh, trống cơm (nhẹ, thưa)
// · tiếng chuông nhỏ kiểu máy game cũ. Bản vui nhanh, nốt gọn trước đó: docs/music/music-ban-vui-nhanh.js.
// Ba sắc thái: calm (trang chủ, sảnh chờ — không bộ gõ), play (đang chơi), finale (công bố kết quả — nhanh nhất);
// mode(null) = im (vd. phòng theo team). Trình duyệt chỉ cho phát sau cú bấm đầu tiên.
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
  calm: { bpm: 100, swing: 0.06, perc: 1, chip: false },
  play: { bpm: 116, swing: 0.05, perc: 2, chip: true },
  finale: { bpm: 126, swing: 0.04, perc: 3, chip: true },
}
const LEVEL = 0.2

let ctx = null, master = null, dry = null, noise = null, timer = 0
let on = false, style = null, key = 'vnj-music', gestured = false
let pos = 0, nextAt = 0 // pos: số móc đơn đã chơi kể từ đầu bài

// ---------- Nhạc cụ (bản du dương: vào nhẹ, ngân dài, có vang) ----------
function env(t, attack, peak, end, dest = dry) {
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
  src.connect(f).connect(env(t, 0.004, gain, t + dur))
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.05)
}

// Sáo trúc — không ghép sóng sin đều (nghe ra organ điện tử). Gần sáo thật nhờ:
//  · hơi gió lẫn suốt nốt (nhiễu lọc quanh cao độ) + tiếng "phụt" đầu nốt
//  · thổi liền hơi: nốt sát nốt trước thì trượt cao độ từ nốt cũ sang (không bật lại), nốt trước tắt nhanh, không ngân chồng
//  · âm lượng phồng dần trong nốt, rung cả cao độ lẫn độ to, nhịp rung lệch nhẹ mỗi nốt; cao độ lệch vài cent như người thổi
//  · láy: có lúc chạm nốt trên rồi rơi xuống, có lúc luyến từ dưới lên
let fluteWave = null, lastFlute = { semis: null, end: 0 }
function flute(semis, t, dur, gain, orn) {
  fluteWave ??= ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.22, 0.07, 0.02]))
  const f = hz(semis + 12) * 2 ** ((Math.random() - 0.5) * 0.008), end = t + dur
  const legato = lastFlute.semis !== null && Math.abs(t - lastFlute.end) < 0.1
  const from = legato ? hz(lastFlute.semis + 12) : 0
  lastFlute = { semis, end }

  const g = ctx.createGain()
  const a = legato ? 0.025 : 0.08
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain * 0.75, t + a)
  g.gain.linearRampToValueAtTime(gain, Math.max(t + a + 0.01, end - 0.06)) // phồng dần
  g.gain.linearRampToValueAtTime(0.0001, end + 0.09)
  const trem = ctx.createGain() // rung độ to
  trem.gain.value = 1
  trem.connect(g).connect(dry)

  const o = ctx.createOscillator()
  o.setPeriodicWave(fluteWave)
  if (from) { o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06) }
  else if (orn === 'grace') { o.frequency.setValueAtTime(f * 1.122, t); o.frequency.setValueAtTime(f * 1.122, t + 0.055); o.frequency.exponentialRampToValueAtTime(f, t + 0.08) }
  else if (orn === 'scoop') { o.frequency.setValueAtTime(f * 0.9, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.15) }
  else o.frequency.setValueAtTime(f, t)
  o.connect(trem)
  o.start(t)
  o.stop(end + 0.12)

  const lfo = ctx.createOscillator(), vib = ctx.createGain(), tre = ctx.createGain()
  lfo.frequency.value = 4.8 + Math.random() * 0.8
  vib.gain.setValueAtTime(0, t)
  vib.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.35, dur * 0.7))
  tre.gain.setValueAtTime(0, t)
  tre.gain.linearRampToValueAtTime(0.12, t + Math.min(0.35, dur * 0.7))
  lfo.connect(vib).connect(o.frequency)
  lfo.connect(tre).connect(trem.gain)
  lfo.start(t)
  lfo.stop(end + 0.12)

  // Hơi gió: nhiễu lọc hẹp quanh cao độ (tiếng "khàn" của sáo) + chút gió cao
  const air = ctx.createBufferSource()
  air.buffer = noise
  air.loop = true
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = f
  band.Q.value = 7
  const bandG = ctx.createGain()
  bandG.gain.value = 0.55
  const hiss = ctx.createBiquadFilter()
  hiss.type = 'highpass'
  hiss.frequency.value = 3500
  const hissG = ctx.createGain()
  hissG.gain.value = 0.035
  air.connect(band).connect(bandG).connect(g)
  air.connect(hiss).connect(hissG).connect(g)
  air.start(t, Math.random() * 0.5)
  air.stop(end + 0.12)
  if (!legato) noiseHit(t, 0.06, gain * 0.35, 'bandpass', f * 2.2, 2) // "phụt" đầu nốt
}

// Đàn tranh: gảy mềm (lọc bớt tiếng sắc), ngân dài; bend = nhấn (luyến lên)
function tranh(semis, t, dur, gain, bend = false) {
  const f = hz(semis), end = t + dur
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(f * 6, t)
  lp.frequency.exponentialRampToValueAtTime(f * 1.5, end) // tiếng tối dần khi ngân
  lp.connect(env(t, 0.012, gain, end))
  for (const [type, mul, k] of [['triangle', 1, 1], ['sine', 2, 0.25]]) {
    const part = ctx.createGain()
    part.gain.value = k
    part.connect(lp)
    const o = osc(type, f * mul, t, end, part)
    if (bend) { o.frequency.setValueAtTime(f * mul * 0.944, t + 0.12); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.3) }
  }
}

// Đàn nguyệt (bè trầm): tròn, ngân
function nguyet(semis, t, gain, dur = 0.9) {
  const f = hz(semis - 12), end = t + dur
  osc('sine', f, t, end, env(t, 0.02, gain, end))
  osc('triangle', f, t, end, env(t, 0.02, gain * 0.3, end * 0.5 + t * 0.5))
}

// Nền hợp âm (pad): ba nốt ngân cả ô nhịp, vào ra chậm — làm "đệm hơi" cho du dương
function pad(tones, t, dur, gain) {
  const end = t + dur
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.35)
  g.gain.linearRampToValueAtTime(0.0001, end + 0.3)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  g.connect(lp).connect(dry)
  for (const x of tones) for (const det of [-6, 6]) { const o = osc('triangle', hz(x), t, end + 0.3, g); o.detune.value = det }
}

// Tiếng chuông nhỏ kiểu máy game cũ (mềm, ngân) nhân đôi giai điệu cao hơn một quãng tám
function chip(semis, t, gain) {
  const end = t + 0.7
  osc('sine', hz(semis + 24), t, end, env(t, 0.005, gain, end))
}

const mo = (t, gain) => osc('sine', 700, t, t + 0.12, env(t, 0.003, gain, t + 0.12)).frequency.exponentialRampToValueAtTime(560, t + 0.1)
const sanh = (t, gain) => noiseHit(t, 0.12, gain, 'bandpass', 5000, 0.8)
function trong(t, gain) {
  const end = t + 0.4
  osc('sine', 130, t, end, env(t, 0.004, gain, end)).frequency.exponentialRampToValueAtTime(58, end)
}

// Vuốt dây đàn tranh đầu mỗi đoạn
function gliss(t, gain) {
  for (let i = 0; i < 9; i++) tranh(semisOf(i), t - 0.36 + i * 0.04, 1.4, gain * (0.6 + i * 0.05))
}

// Tiếng vang (reverb): đáp ứng xung tự tạo từ nhiễu tắt dần ~2,2 giây
function reverb() {
  const len = Math.floor(ctx.sampleRate * 2.2)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  }
  const c = ctx.createConvolver()
  c.buffer = ir
  return c
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

  if (k === 0) gliss(t, 0.06)
  // Nền hợp âm + bè trầm ngân
  if (s === 0) pad([r1, r3, r5], t, eighth * 8, 0.035)
  if (s === 0) nguyet(r1, t, 0.3, eighth * 3.5)
  if (s === 4) nguyet(st.perc > 1 ? r5 : r1, t, 0.22, eighth * 3.5)
  // Đàn tranh rải hợp âm, ngân chồng lên nhau (calm: móc đen, đang chơi: móc đơn)
  const arp = [r1, r5, r1 + 12, r3 + 12, r5 + 12, r3 + 12, r1 + 12, r5]
  if (st.perc > 1 || s % 2 === 0) tranh(arp[s], t, 1.2, st.perc > 1 ? 0.035 : 0.045)
  // Bộ gõ: mềm, thưa
  if (st.perc > 1 && (s === 2 || s === 6)) mo(t, 0.07)
  if (st.perc > 1 && s % 2 === 1) sanh(t, 0.018)
  if (st.perc > 1 && s === 0) trong(t, 0.28)
  if (st.perc > 2 && s === 4) trong(t, 0.2)
  // Giai điệu
  const n = b.at.get(s)
  if (n) {
    const [idx, len] = n, semis = semisOf(idx), dur = len * eighth
    if (sec.lead === 'flute') flute(semis, t, dur, 0.14, len >= 2 ? ['grace', 'scoop', ''][(p * 7) % 3] : '')
    else tranh(semis + 12, t, Math.max(1.2, dur * 2), 0.15, len >= 2 && (p * 5) % 3 === 0)
    if (sec.harm) tranh(semisOf(idx - 2) + 12, t, Math.max(1, dur * 1.6), 0.05)
    if (sec.chip && st.chip) chip(semis, t, 0.018)
  }
}

function tick() {
  const st = STYLE[style]
  const eighth = 60 / st.bpm / 2
  while (nextAt < ctx.currentTime + 0.45) { // lên lịch trước ~0,4 giây (tiếng vuốt dây bắt đầu sớm 0,36 giây)
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
    // nhạc cụ → dry → (thẳng + vang) → lọc bớt tiếng chói → nén → loa
    master = ctx.createGain()
    dry = ctx.createGain()
    const wet = ctx.createGain()
    wet.gain.value = 0.35
    dry.connect(master)
    dry.connect(reverb()).connect(wet).connect(master)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 5200
    const comp = ctx.createDynamicsCompressor() // nhiều nhạc cụ cùng lúc không bị rè
    comp.threshold.value = -18
    comp.ratio.value = 3
    master.connect(lp).connect(comp).connect(ctx.destination)
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  master.gain.cancelScheduledValues(ctx.currentTime)
  master.gain.setValueAtTime(0.0001, ctx.currentTime)
  master.gain.exponentialRampToValueAtTime(LEVEL, ctx.currentTime + 1.2) // vào nhẹ
  nextAt = ctx.currentTime + 0.45 // chừa chỗ cho tiếng vuốt dây mở đầu
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
