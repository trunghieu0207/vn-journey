// Hiệu ứng chuyển động dùng chung cho 3 màn (bản tham chiếu: mockup/animations.html, mục 1–10).
// Chỉ dùng transform + opacity (Web Animations API) → nhẹ máy; máy bật "giảm chuyển động" thì bỏ qua hết,
// phần tử vẫn hiện/ẩn đúng như không có hiệu ứng.

import { icon } from '/shared/icons.js'

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
export const OVERSHOOT = 'cubic-bezier(.3, 1.6, .5, 1)'
const PAPER = ['#FFC800', '#58CC02', '#1CB0F6', '#FF4B4B', '#CE82FF', '#FFFFFF']
const rnd = (a, b) => a + Math.random() * (b - a)
export const sleep = ms => new Promise(r => setTimeout(r, reducedMotion ? 0 : ms))

/** el.animate có kiểm tra "giảm chuyển động". Trả về Animation hoặc null. */
export function anim(el, frames, opts = {}) {
  if (reducedMotion || !el?.animate) return null
  return el.animate(frames, { easing: 'ease', ...opts })
}
export const finished = a => (a ? a.finished.then(() => {}, () => {}) : Promise.resolve())

function div(cls, ...children) {
  const d = document.createElement('div')
  d.className = cls
  d.append(...children)
  return d
}

// ---------- Thông báo kiểu sticker ----------
// base: transform sẵn có của phần tử (vd. 'translateX(-50%)' cho thông báo căn giữa)

/** Dán vào: rơi từ trên, nghiêng rồi ép phẳng; băng dính (::after, nếu có) dán sau một nhịp. */
export function stickerIn(el, { base = '', tilt = -10, scale = 1.3, tape = false } = {}) {
  el.getAnimations().forEach(a => a.cancel())
  const a = anim(el, [
    { transform: `${base} translateY(-22px) scale(${scale}) rotate(${tilt}deg)`, opacity: 0 },
    { transform: `${base} translateY(2px) scale(.97) rotate(${-tilt * 0.15}deg)`, opacity: 1, offset: 0.6 },
    { transform: `${base} translateY(0) scale(1) rotate(0deg)`, opacity: 1 },
  ], { duration: 460, easing: 'ease-out' })
  if (tape) anim(el, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 220, delay: 360, easing: 'ease-out', fill: 'backwards', pseudoElement: '::after' })
  return finished(a)
}

/** Bóc ra: nhấc góc lên rồi bay mất. Xong thì gọi done() (thường là ẩn phần tử). */
export async function peelOut(el, { base = '', done = () => {} } = {}) {
  const a = anim(el, [
    { transform: `${base} translateY(0) rotate(0deg)`, opacity: 1 },
    { transform: `${base} translateY(-6px) rotate(-5deg)`, opacity: 1, offset: 0.35 },
    { transform: `${base} translateY(-34px) rotate(-12deg)`, opacity: 0 },
  ], { duration: 400, easing: 'ease-in', fill: 'forwards' })
  await finished(a)
  done()
  a?.cancel()
}

/** Lắc ngang (sai, mất tỉnh). */
export function shakeX(el, { base = '', amp = 8 } = {}) {
  return finished(anim(el, [0, -1, 1, -0.7, 0.5, -0.25, 0].map(k => ({ transform: `${base} translateX(${k * amp}px)` })), { duration: 450, easing: 'ease-out' }))
}

/** Đóng dấu: phóng to nghiêng → đập xuống. */
export function stamp(el, { tilt = -12 } = {}) {
  return finished(anim(el, [
    { transform: `scale(2) rotate(${tilt}deg)`, opacity: 0 },
    { transform: `scale(.95) rotate(${tilt / 12}deg)`, opacity: 1, offset: 0.65 },
    { transform: `scale(1) rotate(${tilt / 6}deg)`, opacity: 1 },
  ], { duration: 420, easing: 'cubic-bezier(.5, 0, .5, 1)', fill: 'forwards' }))
}

/** Nảy nhẹ (nút vừa đổi trạng thái, số đếm, khay thẻ). */
export function bump(el, k = 1.06) {
  return finished(anim(el, [{ transform: 'scale(1)' }, { transform: `scale(${k}) rotate(-1deg)`, offset: 0.4 }, { transform: 'scale(1)' }], { duration: 380, easing: OVERSHOOT }))
}

// ---------- Dấu tích / gạch chéo vẽ tay ----------
const MARK = {
  check: ['M5 16c2.2 1.2 4.4 3.4 6.4 6.6C15 14 19.6 8.6 26 4.6'],
  cross: ['M7 6.5c5 5.4 11 12 16.6 17.4', 'M23.6 6c-5.4 5-11.8 11.6-17 18'],
}
/** Thêm dấu vẽ tay vào góc phải nút rồi vẽ từng nét. */
export function drawMark(btn, kind) {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 30 30')
  svg.setAttribute('class', 'fx-mark')
  svg.setAttribute('aria-hidden', 'true')
  btn.append(svg)
  MARK[kind].forEach((d, i) => {
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('d', d)
    svg.append(p)
    const L = p.getTotalLength()
    p.style.strokeDasharray = L
    anim(p, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: kind === 'check' ? 340 : 220, delay: i * 230, easing: 'ease-out', fill: 'backwards' })
  })
}

// ---------- Hạt bắn ra ----------
// Sao nhỏ bắn ra từ điểm (x, y) — toạ độ tính theo khung `box` (phần tử có position)
export function starBurst(box, x, y, n = 6) {
  if (reducedMotion) return
  for (let i = 0; i < n; i++) {
    const s = div('fx-float', icon('star', { size: `${rnd(14, 22)}px` }))
    s.style.left = `${x}px`
    s.style.top = `${y}px`
    box.append(s)
    const ang = -Math.PI / 2 + rnd(-1.4, 1.4), d = rnd(36, 70)
    const at = k => `translate(calc(-50% + ${Math.cos(ang) * d * k}px), calc(-50% + ${Math.sin(ang) * d * k}px))`
    finished(anim(s, [
      { transform: 'translate(-50%, -50%) scale(0)', opacity: 1 },
      { transform: `${at(1)} scale(1) rotate(${rnd(90, 200)}deg)`, opacity: 1, offset: 0.6 },
      { transform: `${at(1.15)} scale(.6) rotate(${rnd(200, 300)}deg)`, opacity: 0 },
    ], { duration: 800, delay: 100 + i * 30, easing: 'cubic-bezier(.2, .8, .4, 1)', fill: 'backwards' })).then(() => s.remove())
  }
}

/** Giấy vụn bắn tung từ (x, y) trong khung `box`. */
export function confetti(box, x, y, { n = 26, spread = 170 } = {}) {
  if (reducedMotion) return
  for (let i = 0; i < n; i++) {
    const p = div('fx-piece')
    p.style.left = `${x}px`
    p.style.top = `${y}px`
    p.style.background = PAPER[i % PAPER.length]
    box.append(p)
    const ang = rnd(-Math.PI * 0.95, -Math.PI * 0.05), d = rnd(spread * 0.4, spread)
    const dx = Math.cos(ang) * d, dy = Math.sin(ang) * d
    finished(anim(p, [
      { transform: 'translate(-50%, -50%) scale(.3)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(${rnd(180, 400)}deg)`, opacity: 1, offset: 0.45, easing: 'ease-in' },
      { transform: `translate(${dx * 1.2}px, ${dy + 90}px) scale(.8) rotate(${rnd(500, 800)}deg)`, opacity: 0 },
    ], { duration: rnd(900, 1300), easing: 'cubic-bezier(.2, .8, .4, 1)', fill: 'forwards' })).then(() => p.remove())
  }
}

/** Đếm số tăng dần trong phần tử; fmt định dạng số → chữ. */
export function countUp(el, from, to, ms = 700, fmt = String) {
  if (reducedMotion || from === to) { el.textContent = fmt(to); return Promise.resolve() }
  const t0 = performance.now()
  return new Promise(res => {
    const tick = now => {
      const k = Math.min(1, (now - t0) / ms)
      el.textContent = fmt(Math.round(from + (to - from) * (1 - (1 - k) ** 3)))
      if (k < 1) requestAnimationFrame(tick)
      else res()
    }
    requestAnimationFrame(tick)
  })
}

// ---------- Lớp hiệu ứng toàn màn hình ----------
function layer(cls = '') {
  const l = div(`fx-layer ${cls}`)
  l.setAttribute('aria-hidden', 'true')
  document.body.append(l)
  return l
}

/** Đếm ngược 3 · 2 · 1 → "Bắt đầu!" + giấy vụn (lúc trận đấu bắt đầu).
 *  ms: còn bao lâu tới "Bắt đầu!" (tính theo giờ server) — mọi máy hiện cùng số cùng lúc dù nhận tin sớm / muộn;
 *  vào muộn thì bỏ các số đã qua. Tab bị ẩn (thu nhỏ trình duyệt, Safari ẩn…): trình duyệt dừng hẹn giờ / chuyển động
 *  của tab ẩn nên mở lại sẽ đếm tiếp từ chỗ bị dừng, lệch với máy khác → ẩn thì bỏ, mở lại thì đếm theo mốc
 *  (đã qua mốc thì thôi, không diễn lại). */
let cd = null // lượt đếm ngược đang chờ / đang diễn: { goAt, text, run, layer }
export function countdown(text = 'Bắt đầu!', ms = 3000) {
  if (reducedMotion) return
  stopCountdown()
  cd = { goAt: performance.now() + ms, text, run: 0, layer: null }
  if (!document.hidden) runCountdown(cd)
}
function stopCountdown() {
  if (!cd) return
  cd.run++ // lượt diễn đang chạy thấy số lượt đổi thì dừng
  cd.layer?.remove()
  cd.layer = null
}
document.addEventListener('visibilitychange', () => {
  if (!cd) return
  if (document.hidden) return stopCountdown()
  if (cd.goAt - performance.now() > -800) runCountdown(cd) // còn kịp (kể cả vừa tới "Bắt đầu!"): diễn tiếp theo mốc
  else cd = null
})
async function runCountdown(c) {
  const run = ++c.run
  const alive = () => c.run === run
  const l = c.layer = layer()
  const late = at => performance.now() - at // > 0: đã qua mốc `at`
  for (const [n, color] of [['3', 'var(--red)'], ['2', 'var(--orange)'], ['1', 'var(--blue)']]) {
    const at = c.goAt - Number(n) * 1000
    if (late(at) < 0) await sleep(-late(at))
    if (!alive()) return
    if (late(at) > 500) continue // số này đã qua (vào muộn / hẹn giờ bị trễ)
    const s = div('fx-count', n)
    s.style.color = color
    l.append(s)
    const r = rnd(-14, 14)
    await finished(anim(s, [
      { transform: `translate(-50%, -50%) scale(2.4) rotate(${r * 2}deg)`, opacity: 0 },
      { transform: `translate(-50%, -50%) scale(.92) rotate(${r * 0.3}deg)`, opacity: 1, offset: 0.7 },
      { transform: `translate(-50%, -50%) scale(1) rotate(${r * 0.4}deg)`, opacity: 1 },
    ], { duration: 300, easing: 'ease-in', fill: 'forwards' }))
    // Giữ tới mốc của số (không cộng dồn thời lượng hiệu ứng: hiện trễ thì giữ ngắn lại, số sau vẫn đúng giờ)
    await sleep(Math.max(0, at + 780 - performance.now()))
    await finished(anim(s, [{ opacity: 1, transform: `translate(-50%, -50%) rotate(${r * 0.4}deg)` }, { opacity: 0, transform: `translate(-50%, -50%) scale(.5) rotate(${r}deg)` }], { duration: 200, easing: 'ease-in', fill: 'forwards' }))
    s.remove()
    if (!alive()) return
  }
  if (late(c.goAt) < 0) await sleep(-late(c.goAt))
  if (!alive()) return
  const go = div('toast fx-go', icon('flag'), c.text)
  l.append(go)
  anim(go, [
    { transform: 'translate(-50%, -50%) scale(2) rotate(-14deg)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(.94) rotate(2deg)', opacity: 1, offset: 0.65 },
    { transform: 'translate(-50%, -50%) scale(1) rotate(-2deg)', opacity: 1 },
  ], { duration: 420, easing: 'ease-in', fill: 'forwards' })
  await sleep(260)
  if (!alive()) return
  confetti(l, innerWidth / 2, innerHeight / 2, { n: 40, spread: Math.min(320, innerWidth / 3) })
  await sleep(1300)
  await finished(anim(go, [{ opacity: 1, transform: 'translate(-50%, -50%) rotate(-2deg)' }, { opacity: 0, transform: 'translate(-50%, -80%) rotate(-8deg)' }], { duration: 300, easing: 'ease-in', fill: 'forwards' }))
  l.remove()
  if (cd === c) cd = null
}

/** Biển treo đu xuống từ trên (sự kiện Lễ hội / Bão), đèn lồng bay lên khi là Lễ hội. */
export async function hangSign({ kind, title, sub = '' }) {
  if (reducedMotion) return
  const l = layer('fx-sign-layer')
  const NS = 'http://www.w3.org/2000/svg'
  const strings = document.createElementNS(NS, 'svg')
  strings.setAttribute('viewBox', '0 0 220 42')
  strings.setAttribute('class', 'fx-strings')
  strings.innerHTML = '<path d="M40 0L60 42M180 0L160 42"/>'
  const pill = div(`pill fx-sign-pill${kind === 'storm' || kind === 'golden' ? ` ${kind}` : ''}`, icon(kind), title)
  const sign = div('fx-sign', strings, pill, sub ? div('fx-sign-sub', sub) : '')
  l.append(sign)
  anim(sign, [
    { transform: 'translateY(-200px) rotate(-30deg)' },
    { transform: 'translateY(0) rotate(14deg)', offset: 0.35, easing: 'ease-in-out' },
    { transform: 'translateY(0) rotate(-8deg)', offset: 0.55, easing: 'ease-in-out' },
    { transform: 'translateY(0) rotate(4.5deg)', offset: 0.72, easing: 'ease-in-out' },
    { transform: 'translateY(0) rotate(-2deg)', offset: 0.86, easing: 'ease-in-out' },
    { transform: 'translateY(0) rotate(0deg)' },
  ], { duration: 1700, easing: 'ease-out', fill: 'forwards' })
  if (kind === 'festival') {
    for (let i = 0; i < 9; i++) {
      const f = div('fx-lantern', icon('festival', { size: `${rnd(28, 46)}px` }))
      f.style.left = `${6 + i * 11}%`
      l.append(f)
      const sway = rnd(8, 18)
      anim(f, [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 0 },
        { transform: `translate(${sway}px, -30vh) rotate(6deg)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${-sway}px, -60vh) rotate(-6deg)`, opacity: 1, offset: 0.65 },
        { transform: `translate(${sway / 2}px, -95vh) rotate(4deg)`, opacity: 0 },
      ], { duration: rnd(3000, 3800), delay: 300 + i * 160, easing: 'ease-in-out', fill: 'both' })
    }
  }
  await sleep(3400)
  await finished(anim(sign, [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-160px) rotate(-6deg)', opacity: 0 }], { duration: 380, easing: 'ease-in', fill: 'forwards' }))
  await sleep(600)
  l.remove()
}

/** Thẻ bài: thẻ úp hiện giữa màn, lật ra mặt trước (tia sáng phía sau), rồi bay vào khay `target`. */
export async function cardReveal({ iconName, name, hint, target, caption = null }) {
  if (reducedMotion) return
  const l = layer('fx-card-layer')
  // caption: dòng chữ phía trên thẻ cho biết thẻ từ đâu ra (vd. "Chủ phòng tung thẻ!") — lớp phủ che mất thông báo thường
  const cap = caption ? div('pill fx-card-caption', caption) : null
  if (cap) {
    l.append(cap)
    anim(cap, [{ transform: 'translate(-50%, 20px) scale(.6)', opacity: 0 }, { transform: 'translate(-50%, 0) scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%, 0) scale(1)', opacity: 1 }],
      { duration: 420, easing: 'ease-out', fill: 'forwards' })
  }
  const rays = div('fx-rays')
  const front = div('face front card', icon(iconName, { size: '56px' }), Object.assign(document.createElement('b'), { textContent: name }), Object.assign(document.createElement('small'), { textContent: hint }))
  const back = div('face back', icon('card', { size: '64px' }))
  const inner = div('fx-flip-in', front, back)
  const flip = div('fx-flip', inner)
  l.append(rays, flip)
  anim(flip, [{ transform: 'scale(.2) translateY(60px)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 480, easing: 'ease-out', fill: 'forwards' })
  anim(inner, [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: 0.35 }, { transform: 'rotateY(-12deg)', offset: 0.85 }, { transform: 'rotateY(0deg)' }], { duration: 950, easing: 'ease-in-out', fill: 'forwards' })
  anim(rays, [{ opacity: 0, transform: 'scale(.5) rotate(0deg)' }, { opacity: 1, transform: 'scale(1) rotate(40deg)', offset: 0.4 }, { opacity: 1, transform: 'scale(1) rotate(100deg)' }], { duration: 2400, delay: 300, easing: 'linear', fill: 'both' })
  await sleep(2100)
  anim(rays, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' })
  if (cap) anim(cap, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' })
  const tr = target?.getBoundingClientRect()
  if (tr?.width) {
    const fr = flip.getBoundingClientRect()
    const dx = tr.left + tr.width / 2 - (fr.left + fr.width / 2), dy = tr.top + tr.height / 2 - (fr.top + fr.height / 2)
    await finished(anim(flip, [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 40}px) scale(.6) rotate(-8deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.12) rotate(12deg)`, opacity: 0.4 },
    ], { duration: 600, easing: 'ease-in', fill: 'forwards' }))
    bump(target, 1.15)
  } else {
    await finished(anim(flip, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }))
  }
  l.remove()
}
