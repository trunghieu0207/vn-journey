// Nhạc nền: file /audio/nhac-nen.mp3 (chủ dự án đưa vào 26/11), phát lặp cho cả game — trang chủ, sảnh chờ, lúc chơi, công bố.
// Bản tự tổng hợp bằng Web Audio trước đó: docs/music/music-du-duong.js (và bản vui nhanh docs/music/music-ban-vui-nhanh.js).
// mode: calm | play | finale đều phát cùng một bài (giữ tên để chỗ gọi không đổi, đổi sắc thái không phát lại từ đầu);
// mode(null) = im. Trình duyệt chỉ cho phát sau cú bấm đầu tiên. Tab bị ẩn → tạm dừng.
// Âm lượng qua Web Audio (GainNode): Safari iOS bỏ qua audio.volume; không tạo được AudioContext thì dùng audio.volume.

const SRC = '/audio/nhac-nen.mp3'
const LEVEL = 0.18 // 26/11: chủ dự án thấy to, giảm ~50% (từ 0.35)

let audio = null, ctx = null, gain = null, pauseTimer = 0
let on = false, style = null, key = 'vnj-music', gestured = false

// Safari iOS: AudioContext phải tạo / mở lại ngay trong cú bấm, tạo sau đó sẽ bị treo ở trạng thái suspended
function ensure() {
  if (!audio) {
    audio = new Audio(SRC)
    audio.loop = true
    audio.preload = 'auto'
    try {
      ctx = new AudioContext()
      gain = ctx.createGain()
      gain.gain.value = 0
      ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination)
    } catch {
      ctx = gain = null
      audio.volume = 0
    }
  }
  if (ctx?.state === 'suspended') ctx.resume()
}

// Đưa âm lượng về v trong khoảng sec giây
function level(v, sec) {
  if (gain) {
    const t = ctx.currentTime
    gain.gain.cancelScheduledValues(t)
    gain.gain.setTargetAtTime(Math.max(v, 0.0001), t, sec / 3)
  } else if (audio) audio.volume = v
}

const playing = () => !!audio && !audio.paused && !pauseTimer

function start() {
  if (!on || !style || document.hidden) return
  ensure()
  clearTimeout(pauseTimer)
  pauseTimer = 0
  if (audio.paused) {
    level(0, 0.01)
    audio.play().catch(() => {}) // chưa có cú bấm → trình duyệt chặn; lần chạm sau phát lại
  }
  level(LEVEL, 1.2) // vào nhẹ
}

function stop() {
  if (!audio || audio.paused || pauseTimer) return
  level(0, 0.5)
  pauseTimer = setTimeout(() => { pauseTimer = 0; audio.pause() }, 600)
}

// Bật sẵn từ lần trước: phát ở lần chạm / gõ phím đầu tiên (chưa tới đoạn có nhạc thì vẫn mở khóa phát trong cú bấm)
for (const type of ['pointerdown', 'keydown']) {
  addEventListener(type, () => {
    gestured = true
    if (!on || playing()) return
    if (style) return start()
    ensure()
    audio.play().then(() => { if (!style || !on) audio.pause() }, () => {}) // gain = 0 nên không nghe thấy
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
  /** calm | play | finale | null (im). Cùng một bài — đổi giữa các sắc thái thì nhạc chạy tiếp */
  mode(m) {
    if (m === style) return
    const was = style
    style = m
    if (!m) return stop()
    if (!was && gestured) start() // im → có nhạc: chỉ phát khi trang đã có cú bấm (trình duyệt cho phép)
  },
  /** Hạ nhỏ một lúc cho hiệu ứng âm thanh nghe rõ (shared/sound.js gọi) */
  duck(ms = 1400) {
    if (!playing()) return
    if (gain) {
      const t = ctx.currentTime
      gain.gain.cancelScheduledValues(t)
      gain.gain.setTargetAtTime(LEVEL * 0.3, t, 0.04)
      gain.gain.setTargetAtTime(LEVEL, t + ms / 1000, 0.4)
    } else {
      audio.volume = LEVEL * 0.3
      setTimeout(() => { if (playing()) audio.volume = LEVEL }, ms)
    }
  },
}
