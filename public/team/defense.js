// Màn team: phòng thủ khi đội khác công thành tỉnh của mình (đấu tay đôi) — cùng câu hỏi, ai đúng trước thắng.
// Đúng trước → giữ tỉnh +50; sai → không bị phạt, chỉ còn trông vào đội công thành trả lời sai.
// Đội công thành sai trước: tỉnh đã giữ được, khung vẫn mở tới hết giờ — trả lời đúng vẫn được +50.
// Không bỏ phiếu: ai trong team bấm trước thì tính (đua tốc độ). Không biết đội nào đang công thành.

import { api } from '/shared/api.js'
import { sound } from '/shared/sound.js'
import { labeled } from '/shared/icons.js'
import { button, el } from '/shared/dom.js'
import * as fx from '/shared/fx.js'
import { act } from './actions.js'
import { closeDialog, dlg, openDocked } from './dialogs.js'
import { toast } from './notify.js'
import { renderAll, renderTimers } from './render.js'
import { nameOf, state } from './state.js'
import { duelBar, duelMissed, siegeIntro, siegeRepelled, siegeTakeover } from './siege-fx.js'
import { roundLine, roundToast } from './siege-bet.js'

const alertText = d => (d.attackerDone
  ? `Đoàn khách đã trả lời sai — ${nameOf(d.province)} vẫn là của bạn. Trả lời đúng vẫn được +50 điểm.`
  : `Có đoàn khách ghé thử tài ở ${nameOf(d.province)}! Trả lời đúng trước họ để giữ tỉnh (+50 điểm). Sai thì không sao.`)

// Đội công thành vừa trả lời sai trong lúc khung đang mở: đổi dòng báo, giữ khung (vẫn lấy được +50)
export function defenseUpdated(d) {
  const was = state.defense
  state.defense = d
  if (state.dialogMode !== 'defense' || !d.attackerDone || was?.attackerDone) return
  const a = dlg.querySelector('.defense-alert')
  if (a) {
    a.textContent = alertText(d)
    a.classList.add('safe')
  }
  duelMissed(dlg.querySelector('.duel-bar'), 'Đoàn khách trượt rồi! Đúng vẫn +50')
}

export function openDefense(d) {
  // Đấu nhiều hiệp: vừa sang hiệp mới mà mình không trả lời hiệp trước (đoàn khách đúng / sai trước) → báo kết quả hiệp đó
  const prev = state.defense
  if (prev?.duelId === d.duelId && prev.round && d.round && d.round.no > prev.round.no) {
    roundToast({ no: prev.round.no, winner: d.round.att > prev.round.att ? 'att' : 'def', att: d.round.att, def: d.round.def }, 'def')
  }
  state.defense = d
  if (!d.round || d.round.no === 1) sound.lost()
  let body
  if (d.kind === 'choice') {
    body = el('div', { class: 'options' }, ...d.options.map((text, i) => {
      const b = button('', '', () => defend(i), { 'data-key': String(i + 1) })
      b.append(el('span', { class: 'key' }, String(i + 1)), text)
      return b
    }))
  } else if (d.kind === 'truefalse') {
    body = el('div', { class: 'options' },
      button('', '', () => defend(true), { 'data-key': '1' }), button('', '', () => defend(false), { 'data-key': '2' }))
    const [t, f] = body.querySelectorAll('button')
    t.append(el('span', { class: 'key' }, '1'), 'Đúng')
    f.append(el('span', { class: 'key' }, '2'), 'Sai')
  } else {
    const input = el('input', { class: 'input', maxlength: '100', 'aria-label': 'Câu trả lời', autocomplete: 'off' })
    body = el('form', { class: 'text-answer' }, input, el('button', { type: 'submit', class: 'btn green' }, 'Trả lời'))
    body.addEventListener('submit', e => {
      e.preventDefault()
      if (input.value.trim()) defend(input.value.trim())
    })
    setTimeout(() => input.focus(), 50)
  }
  const name = nameOf(d.province)
  const flight = openDocked('defense', d.province,
    el('div', { class: 'q-head' },
      el('h2', {}, `Đón khách: ${name}`),
      el('span', { class: 'tag siege' }, labeled('siege', 'So tài'))),
    duelBar('Đoàn khách', d.attackerDone),
    roundLine(d.round, 'def'),
    el('p', { class: 'defense-alert' }, alertText(d)),
    el('div', { class: 'q-timer' }, ''),
    el('p', { class: 'q-text' }, d.content),
    body,
    el('div', { class: 'q-foot' },
      el('span', { class: 'muted' }, 'Ai trong team bấm trước thì tính'),
      button('Bỏ qua', 'skip', () => {
        // Không phòng thủ lượt này (để đội công thành tự trả lời) — không mở lại khung này nữa
        state.defenseSkipped.add(d.duelId)
        state.defense = null
        closeDialog()
      })),
  )
  dlg.classList.add('defense')
  dlg.querySelector('.defense-alert').classList.toggle('safe', !!d.attackerDone)
  renderTimers()
  // Hai lá cờ giành tỉnh — diễn sau khi camera bay tới (không chồng lên lúc bản đồ đang di chuyển)
  if (!d.attackerDone && !(d.round?.no > 1)) flight.then(() => { if (state.defense?.duelId === d.duelId) siegeIntro(d.province, 'def', name) })
}

function chosenButton(value) {
  const opts = dlg.querySelectorAll('.options .btn')
  if (typeof value === 'number') return opts[value]
  if (typeof value === 'boolean') return opts[value ? 0 : 1]
  return dlg.querySelector('.text-answer .btn')
}

function defend(value) {
  const d = state.defense
  if (!d || state.busy) return
  const chosen = chosenButton(value)
  dlg.querySelectorAll('button, input').forEach(b => { b.disabled = true })
  state.defending = true
  act(async () => {
    let r
    try {
      r = await api('/api/defend', { duelId: d.duelId, answer: value, round: d.round?.no ?? null })
    } catch (err) {
      state.defending = false
      state.defense = null
      closeDialog()
      if (['no-duel', 'answered', 'round-over'].includes(err.code)) return toast(err.message)
      throw err
    }
    if (!r.correct) {
      sound.wrong()
      if (chosen && !fx.reducedMotion) {
        chosen.classList.add('danger')
        fx.drawMark(chosen, 'cross')
        fx.shakeX(chosen)
      }
      await fx.sleep(1100)
      state.defending = false
      state.defense = null
      closeDialog()
      toast(`Chưa đúng — ${nameOf(d.province)} chỉ còn trông vào đoàn khách trả lời sai`, true)
      return
    }
    sound.capture()
    if (chosen && !fx.reducedMotion) {
      chosen.classList.add('green')
      fx.drawMark(chosen, 'check')
      fx.bump(chosen)
      await fx.sleep(700)
    }
    state.defending = false
    state.defense = null
    // Đấu nhiều hiệp, chưa ngã ngũ: thắng hiệp này, hiệp sau tự mở
    if (r.round && !r.round.done) {
      closeDialog()
      return roundToast(r.round, 'def', ' (bạn đúng trước)')
    }
    showHeld(r)
  })
}

// Giữ vững tỉnh: khung kết quả (dùng lại khung kết quả câu hỏi)
function showHeld(r) {
  const ok = button('Tiếp tục', 'green', closeDialog)
  openDocked('result', r.province, el('div', { class: 'result good' },
    el('h2', {}, `Giữ vững ${nameOf(r.province)}!`),
    el('p', { class: 'answer' }, `Đáp án: ${r.correctAnswer}`),
    r.explanation ? el('p', { class: 'explain' }, r.explanation) : '',
    r.round ? el('p', { class: 'answer' }, `Thắng ${r.round.def}–${r.round.att} sau ${r.round.no} hiệp`) : '',
    el('p', { class: 'reward' }, labeled('shield', `${r.attackerDone ? 'Đón khách thành công' : 'Đoàn khách được mời về'} · +${r.bonus} điểm`)),
    el('div', { class: 'dialog-actions' }, ok)))
  ok.focus()
  fx.stamp(dlg.querySelector('.result h2'), { tilt: -10 })
  if (!r.attackerDone) siegeRepelled(r.province, false) // đội công thành đập vào khiên, bật ngược ra
  renderAll()
}

// Lượt phòng thủ kết thúc mà mình chưa trả lời (đội công thành cướp được, hoặc hết giờ): đóng khung, báo kết quả
// (mất tỉnh thì đã có cảnh báo "Bạn vừa mất …")
export function defenseEnded(d) {
  const open = state.dialogMode === 'defense'
  state.defense = null
  if (state.me.known[d.province] === 'mine') {
    if (open) closeDialog()
    return toast(`Hết giờ đón khách — ${nameOf(d.province)} vẫn là của bạn`, false, 'shield')
  }
  if (!open) return
  if (fx.reducedMotion) return closeDialog()
  // Bị cướp: giữ khung (camera còn ở tỉnh) cho cảnh "?" húc văng huy hiệu đội mình, rồi mới đóng + bay về
  const box = dlg.firstChild
  dlg.querySelectorAll('button, input').forEach(b => { b.disabled = true })
  siegeTakeover(d.province, false)
  setTimeout(() => { if (state.dialogMode === 'defense' && dlg.firstChild === box) closeDialog() }, 1700)
}
