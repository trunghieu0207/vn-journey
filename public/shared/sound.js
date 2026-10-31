// Âm thanh tự tổng hợp bằng Web Audio — không tải file âm thanh nào.
// Trình duyệt chỉ cho phát sau lần bấm đầu tiên của người dùng, nên AudioContext tạo khi cần.

let ctx = null
let muted = false
try { muted = localStorage.getItem('vnj-muted') === '1' } catch {}

function audio() {
  if (muted) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}
// Tạo AudioContext mất ~100 ms (chặn luồng chính) — làm ngay lúc chạm / gõ phím đầu tiên, trước khi có animation nào chạy,
// thay vì lúc phát tiếng đầu tiên (thường trùng lúc camera bắt đầu bay tới tỉnh → giật).
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => audio(), { capture: true, once: true })

function tone(freq, start, dur, { type = 'sine', gain = 0.2, slide } = {}) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + start
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur)
}

// Tiếng trống: sóng sin trầm tụt nhanh
const drum = (start, gain = 0.6) => tone(120, start, 0.35, { gain, slide: 45 })

export const sound = {
  correct() { tone(660, 0, 0.12); tone(990, 0.1, 0.22) },
  wrong() { tone(220, 0, 0.35, { type: 'square', gain: 0.08, slide: 140 }) },
  capture() { drum(0); drum(0.18, 0.45); tone(784, 0.3, 0.3, { type: 'triangle' }) },
  lost() { tone(523, 0, 0.18, { type: 'triangle' }); tone(392, 0.16, 0.18, { type: 'triangle' }); tone(262, 0.32, 0.4, { type: 'triangle' }) },
  event() { tone(880, 0, 0.15, { type: 'triangle' }); tone(1175, 0.12, 0.15, { type: 'triangle' }); tone(1568, 0.24, 0.3, { type: 'triangle' }) },
  click() { tone(520, 0, 0.05, { gain: 0.08 }) },
  get muted() { return muted },
  setMuted(v) {
    muted = v
    try { localStorage.setItem('vnj-muted', v ? '1' : '0') } catch {}
  },
}
