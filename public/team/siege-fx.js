// Màn team: hiệu ứng công thành (bản tham chiếu: mockup/siege.html — mở màn B "giành cờ", thanh kéo co, 2 cảnh kết quả).
// Luật: không đội nào biết đối thủ là ai → chỉ đội mình hiện linh vật thật, đối thủ luôn là huy hiệu xám "?".
// Mọi thứ là phần tử HTML chồng lên khung bản đồ / trong khung câu hỏi, chỉ đổi transform + opacity (không vẽ lại SVG bản đồ).
// Máy bật "giảm chuyển động": bỏ qua hết (fx.anim trả null), thanh kéo co vẫn hiện tĩnh.

import { mascotIcon } from '/shared/mascots.js'
import { icon } from '/shared/icons.js'
import { el } from '/shared/dom.js'
import * as fx from '/shared/fx.js'
import { state } from './state.js'

const BOUNCE = fx.OVERSHOOT
const mine = () => state.me.team
const disc = me => el('div', { class: 'sx-disc' }, me ? mascotIcon(mine().mascot, mine().color, 40) : el('span', { class: 'sx-mystery' }, '?'))

// Lớp phủ trên khung bản đồ tại tỉnh id: trả về { layer, x, y } hoặc null (tỉnh ngoài khung / giảm chuyển động)
function stage(id) {
  if (fx.reducedMotion || !state.map) return null
  const pt = state.map.spot(id)
  if (!pt) return null
  const layer = el('div', { class: 'siege-fx' })
  state.map.wrap.append(layer)
  return { layer, x: pt[0], y: pt[1] }
}
// Mở màn đang diễn (bỏ đi khi kết quả tới sớm — đội trả lời trong 2 giây đầu — để hai cảnh không chồng nhau)
let intro = null
export function clearIntro() {
  intro?.remove()
  intro = null
}
const at = (node, x, y) => { node.style.left = `${x}px`; node.style.top = `${y}px`; return node }
const done = (layer, ms) => setTimeout(() => layer.remove(), ms)

// Tia lửa khi hai bên va nhau
function sparks(layer, x, y, n = 8, spread = 60) {
  for (let i = 0; i < n; i++) {
    const s = at(el('i', { class: `sx-spark${i % 3 ? '' : ' w'}` }), x, y)
    layer.append(s)
    const a = Math.random() * Math.PI * 2, d = spread * (0.5 + Math.random() * 0.6)
    fx.anim(s, [
      { transform: 'scale(0)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(1) rotate(300deg)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${Math.cos(a) * d * 1.15}px, ${Math.sin(a) * d * 1.15 + 16}px) scale(.4) rotate(420deg)`, opacity: 0 },
    ], { duration: 650, easing: 'cubic-bezier(.2, .8, .3, 1)', fill: 'forwards' })
  }
}

// Dải chữ dưới tỉnh ("Công thành Nghệ An!")
function caption(layer, x, y, text, delay) {
  const c = at(el('div', { class: 'pill sx-cap' }, text), x, y)
  layer.append(c)
  fx.anim(c, [{ transform: 'translate(-50%, 40px)', opacity: 0 }, { transform: 'translate(-50%, 0) rotate(-2deg)', opacity: 1 }],
    { duration: 420, delay, easing: BOUNCE, fill: 'both' })
  return c
}

/** Mở màn: hai lá cờ (đội mình + "?") rơi cắm xuống hai bên tỉnh, nghiêng vào va nhau 3 nhịp. side: 'atk' | 'def'. ~2 giây. */
export function siegeIntro(id, side, name) {
  const s = stage(id)
  if (!s) return
  clearIntro()
  const { layer, x, y } = s, gap = 78
  intro = layer
  const flag = (left, me) => {
    const f = at(el('div', { class: `sx-flag ${left ? 'l' : 'r'}` },
      el('div', { class: 'sx-pole' }),
      el('div', { class: 'sx-cloth' }, disc(me)),
      el('div', { class: 'sx-who' }, me ? 'Đội bạn' : side === 'atk' ? 'Chủ nhà' : 'Đoàn khách')), x + (left ? -gap : gap), y - 20) // chân cờ trên nhãn tên tỉnh
    if (me) f.style.setProperty('--team', mine().color)
    layer.append(f)
    return f
  }
  // Đội mình luôn bên trái
  const fl = flag(true, true), fr = flag(false, false)
  fx.anim(fl, [{ transform: 'translateY(-260px) rotate(-20deg)', opacity: 0 }, { transform: 'translateY(0) rotate(0)', opacity: 1 }],
    { duration: 420, easing: 'cubic-bezier(.6, 0, .9, .5)', fill: 'backwards' })
  fx.anim(fr, [{ transform: 'translateY(-260px) rotate(20deg)', opacity: 0 }, { transform: 'translateY(0) rotate(0)', opacity: 1 }],
    { duration: 420, delay: 120, easing: 'cubic-bezier(.6, 0, .9, .5)', fill: 'backwards' })
  // Bụi bay khi cờ cắm xuống
  for (const [fxX, delay] of [[x - gap, 420], [x + gap, 540]]) {
    for (let i = 0; i < 4; i++) {
      const d = at(el('i', { class: 'sx-dust' }), fxX, y - 20)
      layer.append(d)
      const dir = i < 2 ? -1 : 1
      fx.anim(d, [{ transform: 'scale(.3)', opacity: 0.9 }, { transform: `translate(${dir * (18 + i * 7)}px, -${6 + i * 3}px) scale(1.2)`, opacity: 0 }],
        { duration: 500, delay, fill: 'both' })
    }
  }
  // 3 nhịp va nhau, mỗi nhịp tóe tia lửa giữa hai cờ
  for (let k = 0; k < 3; k++) {
    const t0 = 700 + k * 380
    fx.anim(fl, [{ transform: 'rotate(0)' }, { transform: 'rotate(16deg)', offset: 0.45 }, { transform: 'rotate(-5deg)', offset: 0.75 }, { transform: 'rotate(0)' }], { duration: 360, delay: t0, easing: 'ease-in-out' })
    fx.anim(fr, [{ transform: 'rotate(0)' }, { transform: 'rotate(-16deg)', offset: 0.45 }, { transform: 'rotate(5deg)', offset: 0.75 }, { transform: 'rotate(0)' }], { duration: 360, delay: t0, easing: 'ease-in-out' })
    setTimeout(() => sparks(layer, x, y - 100), t0 + 160)
  }
  caption(layer, x, y + 56, side === 'atk' ? `Ghé thăm thử tài ${name}!` : `Có đoàn khách ghé thử tài ${name}!`, 600)
  fx.anim(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 350, delay: 2200, fill: 'forwards' })
  setTimeout(() => { if (intro === layer) clearIntro() }, 2600)
}

// ---------- Thanh kéo co trong khung câu hỏi / phòng thủ ----------
/** Thanh đấu: đội mình ← dây → "?". foeLabel: 'Chủ tỉnh' (đội công thành) / 'Đội lạ' (đội giữ tỉnh). */
export function duelBar(foeLabel, missed = false) {
  const knot = el('div', { class: 'tug-knot' })
  const bar = el('div', { class: 'duel-bar' },
    el('div', { class: 'tug-end me' }, disc(true), el('span', {}, 'Đội bạn')),
    el('div', { class: 'tug-lane' }, el('div', { class: 'tug-mid' }), el('div', { class: 'tug-rope' }), knot,
      el('p', { class: 'tug-state' }, 'Ai trả lời đúng trước thắng!')),
    el('div', { class: 'tug-end foe' }, disc(false), el('span', {}, foeLabel)))
  if (missed) {
    bar.classList.add('foe-missed')
    bar.querySelector('.tug-state').textContent = 'Đối thủ trượt rồi!'
    return bar
  }
  // Dây giằng vài nhịp lúc mở (không lặp mãi: khung câu hỏi mở 45 giây)
  const sway = [0, -8, 6, -3, 0].map(v => ({ transform: `translateX(${v}px)` }))
  fx.anim(knot, sway, { duration: 1500, iterations: 2, delay: 300, easing: 'ease-in-out' })
  fx.anim(bar.querySelector('.tug-rope'), sway, { duration: 1500, iterations: 2, delay: 300, easing: 'ease-in-out' })
  fx.anim(bar, [{ transform: 'translateY(-14px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, easing: BOUNCE })
  return bar
}

/** Đối thủ trả lời sai: nút dây trượt hẳn về phía mình, huy hiệu "?" ngã ra, dòng báo. */
export function duelMissed(bar, text = 'Đối thủ trượt rồi!') {
  if (!bar || bar.classList.contains('foe-missed')) return
  bar.classList.add('foe-missed') // vị trí cuối do CSS đặt — hiệu ứng chỉ diễn từ giữa tới đó
  const msg = bar.querySelector('.tug-state')
  msg.textContent = text
  fx.anim(bar.querySelector('.tug-knot'), [{ left: '50%' }, { left: '22%' }], { duration: 600, easing: BOUNCE })
  fx.anim(bar.querySelector('.tug-end.foe'), [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-10px) rotate(-20deg)', offset: 0.5 }, { transform: 'rotate(-10deg)', opacity: 0.55 }], { duration: 600 })
  fx.anim(msg, [{ transform: 'scale(1.5) rotate(-6deg)', opacity: 0 }, { transform: 'scale(1) rotate(-2deg)', opacity: 1 }], { duration: 380, easing: BOUNCE })
  fx.bump(bar.querySelector('.tug-end.me'), 1.18)
}

// ---------- Kết quả trên bản đồ ----------
// Hai huy hiệu đứng trên tỉnh: bên trái đội công thành, bên phải đội giữ tỉnh
function pair(s, attackerIsMe) {
  clearIntro()
  const { layer, x, y } = s
  const badge = me => el('div', { class: 'sx-badge' }, disc(me))
  const l = at(badge(attackerIsMe), x - 70, y - 70), r = at(badge(!attackerIsMe), x + 70, y - 70)
  layer.append(l, r)
  for (const [b, d] of [[l, -1], [r, 1]]) {
    fx.anim(b, [{ transform: `translateX(${d * 24}px) scale(.6)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: BOUNCE, fill: 'backwards' })
  }
  return [l, r]
}

/** Công thành thành công: bên công thành lao tới húc văng bên giữ tỉnh. attackerIsMe: mình vừa cướp được / mình vừa mất tỉnh. */
export function siegeTakeover(id, attackerIsMe) {
  const s = stage(id)
  if (!s) return
  const [l, r] = pair(s, attackerIsMe)
  fx.anim(l, [{ transform: 'translateX(0)' }, { transform: 'translateX(-20px) rotate(-8deg)', offset: 0.35 }, { transform: 'translateX(70px) rotate(6deg)', offset: 0.75 }, { transform: 'translateX(46px) rotate(0)' }],
    { duration: 650, delay: 150, fill: 'forwards' })
  fx.anim(r, [{ transform: 'translate(0, 0) rotate(0)' }, { transform: 'translate(220px, -140px) rotate(540deg) scale(.5)', opacity: 0 }],
    { duration: 700, delay: 600, easing: 'cubic-bezier(.2, .6, .4, 1)', fill: 'forwards' })
  setTimeout(() => sparks(s.layer, s.x + 40, s.y - 70, 10, 80), 600)
  fx.anim(s.layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 1500, fill: 'forwards' })
  done(s.layer, 1900)
}

/** Giữ được tỉnh: khiên bật lên trước bên giữ tỉnh, bên công thành đập vào rồi bật ngược ra. */
export function siegeRepelled(id, attackerIsMe) {
  const s = stage(id)
  if (!s) return
  const [l, r] = pair(s, attackerIsMe)
  const sh = at(el('div', { class: 'sx-shield' }, icon('shield', { size: '64px' })), s.x + 26, s.y - 70)
  s.layer.append(sh)
  fx.anim(sh, [{ transform: 'scale(0) rotate(-30deg)', opacity: 0 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 380, delay: 250, easing: BOUNCE, fill: 'backwards' })
  fx.anim(l, [{ transform: 'translateX(0)' }, { transform: 'translateX(60px) rotate(8deg)', offset: 0.45 }, { transform: 'translateX(-50px) rotate(-18deg)', offset: 0.8 }, { transform: 'translateX(-40px) rotate(-12deg)', opacity: 0.6 }],
    { duration: 800, delay: 400, fill: 'forwards' })
  fx.anim(sh, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 350, delay: 760, easing: BOUNCE })
  setTimeout(() => sparks(s.layer, s.x + 10, s.y - 70, 8, 60), 760)
  fx.anim(r, [{ transform: 'scale(1)' }, { transform: 'scale(1.2) translateY(-8px)' }, { transform: 'scale(1)' }], { duration: 450, delay: 1000, easing: BOUNCE })
  fx.anim(s.layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 1700, fill: 'forwards' })
  done(s.layer, 2100)
}
