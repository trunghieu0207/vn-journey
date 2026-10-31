// Màn team: câu hỏi — hiện câu, đếm giờ, thẻ trợ giúp (50:50, Thêm giờ), bỏ phiếu + chốt đáp án (hiệu ứng đúng / sai),
// bỏ qua, kết quả, chọn chủ đề / đặt cược.

import { api } from '/shared/api.js'
import { sound } from '/shared/sound.js'
import { icon, labeled } from '/shared/icons.js'
import { button, el } from '/shared/dom.js'
import * as fx from '/shared/fx.js'
import { act, retryHere, siege } from './actions.js'
import { closeDialog, dlg, openDocked } from './dialogs.js'
import { addJournal, toast } from './notify.js'
import { renderAll, renderTimers } from './render.js'
import { CARD_INFO, TOPIC_ICON, nameOf, now, solo, state, touchOnly } from './state.js'
import { duelBar, duelMissed, siegeRepelled } from './siege-fx.js'
import { roundLine, roundToast } from './siege-bet.js'

// Phòng nhiều câu/tỉnh: dòng tiến độ ở tỉnh đang đứng — vạch xanh = câu đã đúng, viền xanh = câu đang trả lời
function quizSteps() {
  const need = state.me.room.quizCount
  if (need <= 1) return ''
  const done = Math.min(state.me.progress?.done ?? 0, need - 1)
  return el('div', { class: 'quiz-steps', title: 'Sai vẫn giữ số câu đã đúng; đi sang tỉnh khác thì mất' },
    el('span', { class: 'quiz-bars', 'aria-hidden': 'true' }, ...Array.from({ length: need }, (_, i) => el('i', { class: i < done ? 'done' : i === done ? 'now' : '' }))),
    el('span', {}, el('b', {}, `Câu ${done + 1}/${need}`), ` · đúng đủ ${need} câu để ${solo() ? 'nhận tem' : 'cắm cờ'}`))
}

export function openQuestion(q, force = false) {
  if (!force && state.dialogMode === 'question' && dlg.open && state.question?.q.id === q.id) return
  state.question = { q, myVote: null }
  const p = state.map.byId.get(q.province)
  const isSiege = q.difficulty === 'siege'
  let body
  // Trắc nghiệm / đúng-sai: bấm đáp án = bỏ phiếu (đồng đội thấy tên); cả team online cùng chọn thì tự chốt
  if (q.kind === 'choice') {
    body = el('div', { class: 'options' }, ...q.options.map((text, i) =>
      button('', '', () => pick(i), { 'data-key': String(i + 1) })))
    body.querySelectorAll('button').forEach((b, i) => b.append(el('span', { class: 'key' }, String(i + 1)), q.options[i], el('span', { class: 'voters' })))
  } else if (q.kind === 'truefalse') {
    body = el('div', { class: 'options' },
      button('', '', () => pick(true), { 'data-key': '1' }),
      button('', '', () => pick(false), { 'data-key': '2' }))
    const [t, f] = body.querySelectorAll('button')
    t.append(el('span', { class: 'key' }, '1'), 'Đúng', el('span', { class: 'voters' }))
    f.append(el('span', { class: 'key' }, '2'), 'Sai', el('span', { class: 'voters' }))
  } else {
    const input = el('input', { class: 'input', maxlength: '100', 'aria-label': 'Câu trả lời', autocomplete: 'off' })
    body = el('form', { class: 'text-answer' }, input, el('button', { type: 'submit', class: 'btn green' }, 'Trả lời'))
    body.addEventListener('submit', e => {
      e.preventDefault()
      if (input.value.trim()) answer(input.value.trim())
    })
    setTimeout(() => input.focus(), 50)
  }
  openDocked('question', q.province,
    el('div', { class: 'q-head' },
      el('h2', {}, `Trạm: ${p.name} · ${p.points} điểm`),
      q.golden ? el('span', { class: 'tag golden' }, labeled('golden', 'Câu hỏi vàng ×2')) : '',
      q.bet ? el('span', { class: 'tag bet' }, labeled('bet', 'Mạo hiểm +50%')) : '',
      el('span', { class: isSiege ? 'tag siege' : 'tag' }, isSiege ? labeled('siege', q.duel ? 'So tài' : 'Thử tài') : `Mức ${q.level}`)),
    isSiege ? '' : quizSteps(),
    el('div', { class: 'q-timer' }, ''),
    q.duel ? duelBar('Chủ nhà', q.duel.foeMissed) : '', // đội giữ tỉnh cũng đang trả lời câu này
    roundLine(q.duel?.round, 'att'), // đấu nhiều hiệp: hiệp mấy, tỉ số
    el('p', { class: 'q-text' }, q.content),
    body,
    el('div', { class: 'help-bar' }),
    el('div', { class: 'q-foot' }, el('div', { class: 'vote-bar' }), skipButton()),
  )
  dlg.classList.toggle('golden', !!q.golden)
  applyHelp(q, false)
  renderTimers()
}

// ---------- Bỏ phiếu đáp án ----------
const optionValue = (q, i) => (q.kind === 'truefalse' ? i === 0 : i)

// Tên người đã chọn trên từng đáp án + nút "Chốt" (khi mình đã chọn)
function renderVotes(q) {
  const mine = state.question?.myVote ?? null
  dlg.querySelectorAll('.options .btn').forEach((b, i) => {
    const v = optionValue(q, i)
    b.classList.toggle('picked', mine !== null && mine === v)
    const names = (q.votes ?? []).filter(x => x.answer === v && x.name !== state.me.me?.name).map(x => x.name)
    b.querySelector('.voters')?.replaceChildren(...names.map(n => el('span', { class: 'voter' }, n)))
  })
  const bar = dlg.querySelector('.vote-bar')
  if (!bar || q.kind === 'text') return
  bar.replaceChildren(mine === null
    ? el('span', { class: 'muted' }, q.kind === 'choice' && !touchOnly() ? 'Bấm 1–4 để chọn · cả team chọn giống nhau là tự chốt' : 'Cả team chọn giống nhau là tự chốt')
    : button(labeled('flag', 'Chốt đáp án'), 'green commit', () => answer(mine), { title: 'Nộp đáp án bạn đang chọn (phím Enter)' }))
}

// Bấm một đáp án: gửi phiếu. Server tự chốt khi mọi thành viên đang online cùng chọn (team 1 người: chốt luôn).
function pick(value) {
  if (!state.question || state.busy || state.answering) return
  const q = state.question.q
  state.question.myVote = value
  renderVotes(q)
  // answering trong lúc gửi: phiếu có thể chốt luôn — SSE về trước sẽ không đóng khung giữa chừng
  state.answering = true
  act(async () => {
    let r
    try {
      r = await api('/api/vote', { questionId: q.id, answer: value })
    } catch (err) {
      state.answering = false
      if (err.code === 'no-pending') {
        closeDialog()
        toast('Đồng đội đã trả lời câu này trước bạn')
        return
      }
      throw err
    }
    if ('correct' in r) {
      dlg.querySelectorAll('button, input').forEach(b => { b.disabled = true })
      return finishAnswer(r, q, value)
    }
    state.answering = false
    if (state.question?.q.id === q.id) {
      q.votes = r.votes
      renderVotes(q)
    }
  })
}

// ---------- Thẻ trợ giúp: dùng ngay trong khung câu hỏi ----------
// Vẽ lại phần trợ giúp theo câu q (server là nguồn đúng — đồng đội dùng thẻ thì SSE gửi q mới):
// đáp án bị 50:50 loại thì mờ + gạch, thanh thẻ chỉ còn thẻ dùng được cho câu này. animate: diễn hiệu ứng khi vừa dùng.
// Cũng vẽ lại phiếu chọn đáp án của đồng đội.
export function applyHelp(q, animate = true) {
  if (!state.question || state.question.q.id !== q.id) return
  // Đấu tay đôi: đội giữ tỉnh vừa trả lời sai → nút dây trượt về phía mình
  if (q.duel?.foeMissed && !state.question.q.duel?.foeMissed) duelMissed(dlg.querySelector('.duel-bar'))
  state.question.q = q
  dlg.querySelectorAll('.options .btn').forEach((b, i) => {
    if (!q.hidden?.includes(i) || b.classList.contains('gone')) return
    b.classList.add('gone')
    b.disabled = true
    if (animate) fx.anim(b, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.94) rotate(-1deg)', opacity: 0.35 }], { duration: 380, easing: 'ease-out' })
  })
  if (animate && q.extraMs) fx.bump(dlg.querySelector('.q-timer'), 1.08)
  const bar = dlg.querySelector('.help-bar')
  if (!bar) return
  const usable = kind => (kind === 'fifty' ? q.kind === 'choice' && !q.hidden?.length : !q.extraMs)
  // Mỗi loại thẻ một nút (có nhiều thẻ cùng loại thì dùng thẻ đầu)
  const kinds = [...new Set(state.me.cards.filter(c => CARD_INFO[c.kind]?.help && usable(c.kind)).map(c => c.kind))]
  bar.replaceChildren(...(kinds.length ? [el('span', { class: 'muted' }, 'Thẻ trợ giúp:'), ...kinds.map(kind => {
    const info = CARD_INFO[kind]
    return button(labeled(info.icon, kind === 'time' ? 'Thêm 15 giây' : 'Bỏ 2 đáp án sai'), 'help', () => useHelp(kind), { title: info.hint })
  })] : []))
  bar.hidden = !kinds.length
  renderVotes(q)
}

export function useHelp(kind) {
  const card = state.me.cards.find(c => c.kind === kind)
  if (!card || !state.question || state.answering) return
  act(async () => {
    const r = await api('/api/card', { cardId: card.id, target: '' })
    sound.event()
    state.me.cards = state.me.cards.filter(c => c.id !== card.id)
    const q = state.question?.q
    if (!q) return
    // Cập nhật theo giá trị server trả (SSE có thể đã về trước — không cộng giờ hai lần)
    if (r.kind === 'fifty') q.hidden = r.hidden
    else if (q.extraMs !== r.extraMs) {
      q.deadline += r.extraMs - q.extraMs
      q.freeUntil += r.extraMs - q.extraMs
      q.extraMs = r.extraMs
    }
    applyHelp(q)
    renderAll()
    toast(r.kind === 'fifty' ? 'Đã bỏ 2 đáp án sai' : 'Thêm 15 giây!', false, r.kind)
  })
}

// Số giây bị khóa nếu bỏ qua lúc này — cùng công thức server: 10 giây + thời gian đã xem, tối đa = khóa khi sai
function skipLockSec(since, siege = false) {
  return Math.min(siege ? 45 : 30, Math.ceil(10 + Math.max(0, now() - since) / 1000))
}

// Nút "Bỏ qua": bấm lần 1 hiện cảnh báo hậu quả, bấm lần 2 (trong 4 giây) mới bỏ qua
function skipButton() {
  const back = state.me.canRetreat ? nameOf(state.me.trail.at(-2)) : null
  const b = button('Bỏ qua ✕', 'skip', () => {
    if (!b.classList.contains('armed')) {
      const sec = state.question ? skipLockSec(state.question.q.issuedAt, state.question.q.difficulty === 'siege')
        : state.me.choosing ? skipLockSec(state.me.choosing.since) : 10
      b.classList.add('armed')
      b.textContent = back ? `Chắc chắn? Quay về ${back} + nghỉ ${sec} giây` : `Chắc chắn? Nghỉ ${sec} giây`
      setTimeout(() => {
        if (!b.isConnected) return
        b.classList.remove('armed')
        b.textContent = 'Bỏ qua ✕'
      }, 4000)
      return
    }
    skipQuestion()
  }, { title: 'Bỏ câu này để đi tỉnh khác: quay về tỉnh trước, nghỉ chân 10 giây + thời gian đã xem câu hỏi' })
  return b
}

function skipQuestion() {
  if ((!state.question && state.dialogMode !== 'topic') || state.busy) return
  state.answering = true
  dlg.querySelectorAll('button, input').forEach(b => { b.disabled = true })
  act(async () => {
    try {
      const r = await api('/api/skip', {})
      state.me.lockedUntil = r.lockedUntil
      closeDialog()
      renderAll()
      const sec = Math.round((r.lockedUntil - now()) / 1000)
      if (r.timeout) toast('Đã hết giờ — tính là trả lời sai', true, 'timer')
      else toast(`Đã bỏ qua — lùi về ${nameOf(r.province)}, chờ ${sec} giây`)
    } catch (err) {
      if (err.code === 'no-pending') closeDialog()
      else dlg.querySelectorAll('button:not(.gone), input').forEach(b => { b.disabled = false })
      throw err
    } finally {
      state.answering = false
    }
  })
}

// Nút ứng với đáp án đã chọn (để đổi màu + vẽ dấu tích / gạch chéo)
function chosenButton(value) {
  if (typeof value === 'number') return dlg.querySelectorAll('.options .btn')[value]
  if (typeof value === 'boolean') return dlg.querySelectorAll('.options .btn')[value ? 0 : 1]
  return dlg.querySelector('.text-answer .btn')
}

function answer(value) {
  if (!state.question || state.busy) return
  const q = state.question.q
  dlg.querySelectorAll('button, input').forEach(b => { b.disabled = true })
  state.answering = true
  act(async () => {
    let r
    try {
      r = await api('/api/answer', { questionId: q.id, answer: value })
    } catch (err) {
      state.answering = false
      if (err.code === 'no-pending') {
        closeDialog()
        toast('Đồng đội đã trả lời câu này trước bạn')
        return
      }
      dlg.querySelectorAll('button:not(.gone), input').forEach(b => { b.disabled = false })
      throw err
    }
    await finishAnswer(r, q, value)
  })
}

// Diễn kết quả câu trả lời của mình (bấm "Chốt", câu tự điền, hoặc phiếu vừa tự chốt).
// answering giữ tới khi diễn xong hiệu ứng: SSE về sớm (không còn câu chờ) sẽ không đóng khung giữa chừng
async function finishAnswer(r, q, value) {
  const chosen = chosenButton(value)
  state.answering = true
  if (!r.correct) {
    sound.wrong()
    if (r.timeout) toast('Hết giờ — tính là trả lời sai', true, 'timer')
    state.me.lockedUntil = r.lockedUntil
    // Nút chuyển đỏ + lắc + gạch chéo vẽ tay, dòng "Chưa đúng" rơi xuống. Không lộ đáp án đúng (server không gửi).
    if (chosen && !fx.reducedMotion) {
      chosen.classList.add('danger')
      fx.drawMark(chosen, 'cross')
      fx.shakeX(chosen)
      const v = el('div', { class: 'verdict' }, el('h3', {}, 'Chưa đúng'))
      dlg.querySelector('.q-foot')?.before(v)
      fx.anim(v, [{ transform: 'translateY(-26px)', opacity: 0 }, { transform: 'translateY(0) rotate(2deg)', opacity: 1, offset: 0.55 }, { transform: 'rotate(-1.5deg)', offset: 0.8 }, { transform: 'none', opacity: 1 }], { duration: 600, easing: 'ease-out' })
    } else dlg.classList.add('shake')
    setTimeout(() => {
      state.answering = false
      closeDialog()
      renderAll()
      if (r.round && !r.round.done) roundToast(r.round, 'att', r.timeout ? ' (hết giờ)' : '')
      else if (r.pushedBack) toast(`Thử tài chưa thành${r.round ? ` (${r.round.att}–${r.round.def})` : ''} — quay về ${nameOf(state.me.current)}`, true)
      else if (r.golden) toast('Câu hỏi vàng chưa đúng — nghỉ chân gấp đôi', true, 'golden')
      else if (r.bet) toast('Mạo hiểm chưa thành — chờ thêm 30 giây', true, 'bet')
      else if (r.lostStreak >= 2) toast(`Mất chuỗi ${r.lostStreak} câu đúng`, true, 'streak')
    }, fx.reducedMotion ? 500 : 1300)
    return
  }
  // Đúng: nút chuyển xanh + dấu tích vẽ tay + sao bắn ra, một nhịp sau mới sang khung kết quả
  if (chosen && !fx.reducedMotion) {
    chosen.classList.add('green')
    fx.drawMark(chosen, 'check')
    fx.bump(chosen)
    const d = dlg.getBoundingClientRect(), b = chosen.getBoundingClientRect()
    fx.starBurst(dlg, b.right - d.left - 26 + dlg.scrollLeft, b.top - d.top + b.height / 2 + dlg.scrollTop)
    await fx.sleep(800)
  }
  state.answering = false
  showResult(r, q)
}

// Kết quả do đồng đội trả lời (hoặc server xử hết giờ) — đồng bộ qua SSE
export function showTeammateResult(res) {
  const name = nameOf(res.province)
  // Thua đấu tay đôi: đội giữ tỉnh trả lời đúng trước
  if (res.repelled) {
    sound.wrong()
    const report = () => toast(`Chủ nhà ${name} trả lời đúng trước${res.pushedBack ? ` — bạn được mời về ${nameOf(state.me.current)}` : ''}`, true, 'siege')
    if (state.dialogMode !== 'question' || fx.reducedMotion) {
      if (state.dialogMode === 'question') closeDialog()
      return report()
    }
    // Giữ khung (camera còn ở tỉnh) cho cảnh "đập vào khiên, bật ngược ra" rồi mới đóng + bay về
    state.answering = true
    state.holdLock = true
    renderAll()
    dlg.querySelectorAll('button, input').forEach(b => { b.disabled = true })
    siegeRepelled(res.province, true)
    setTimeout(() => {
      state.answering = false
      state.holdLock = false
      if (state.dialogMode === 'question') closeDialog()
      renderAll()
      report()
    }, 1700)
    return
  }
  // Đấu nhiều hiệp, chưa ngã ngũ: chủ nhà đúng trước / đồng đội trả lời sai / đồng đội thắng hiệp — báo ngắn, hiệp sau tự mở
  if (res.round && !res.round.done) {
    if (state.dialogMode === 'question' && state.question?.q.id === res.questionId) closeDialog()
    if (!res.correct) sound.wrong()
    return roundToast(res.round, 'att', res.roundLost ? ' (chủ nhà đúng trước)' : res.by ? ` (${res.by} ${res.correct ? 'trả lời đúng' : 'trả lời sai'})` : '')
  }
  if (res.skipped) {
    if (state.dialogMode === 'question') closeDialog()
    toast(`${res.by ?? 'Đồng đội'} đã bỏ qua câu ở ${name} — lùi về ${nameOf(res.backTo)}, chờ ${Math.max(0, Math.round((res.lockedUntil - now()) / 1000))} giây`, true)
    return
  }
  if (!res.correct) {
    if (state.dialogMode === 'question') closeDialog()
    sound.wrong()
    const who = res.by ? `${res.by} trả lời sai` : 'Hết giờ — tính là sai'
    toast(res.timeout && res.by ? `${res.by} trả lời quá giờ ở ${name}` : `${who} ở ${name}`, true, res.timeout && res.by ? 'timer' : '')
    if (res.pushedBack) setTimeout(() => toast(`Thử tài chưa thành — quay về ${nameOf(state.me.current)}`, true), 1500)
    return
  }
  showResult(res, { province: res.province, difficulty: res.siege ? 'siege' : 'normal' }, res.by)
}

function showResult(r, q, by = null) {
  // Đấu nhiều hiệp: thắng hiệp này nhưng chưa đủ — báo ngắn, hiệp sau tự mở (giữ khung kết quả cho lúc thắng cả trận)
  if (r.round && !r.round.done) {
    sound.correct()
    closeDialog()
    return roundToast(r.round, 'att', ' (đúng trước chủ nhà)')
  }
  const name = nameOf(q.province)
  if (!by) sound.correct()
  const p = state.map.byId.get(q.province)
  const lines = []
  const pts = el('b', {}, '0')
  if (r.progress) {
    // Phòng nhiều câu/tỉnh: đúng nhưng chưa đủ số câu — chưa cắm cờ, mời trả lời câu tiếp theo
    const left = r.progress.of - r.progress.done
    lines.push(el('p', { class: 'reward' }, labeled('flag', `Đúng ${r.progress.done}/${r.progress.of} câu ở ${name} — còn ${left} câu nữa để ${solo() ? 'nhận tem' : 'cắm cờ'}`, { color: state.me.team.color })))
  } else if (r.captured) {
    lines.push(el('p', { class: 'reward' }, labeled('flag', el('span', {}, solo() ? `Nhận tem ${name}! +` : `Cắm cờ ở ${name}! +`, pts, ' điểm'), { color: state.me.team.color })))
    // Phòng đơn: tem Tiên phong (người đầu tiên trong phòng tới tỉnh này)
    if (r.pioneer) lines.push(el('p', { class: 'reward golden' }, labeled('star', `Tem Tiên phong — bạn là người đầu tiên tới ${name}: +${r.pioneer} điểm`)))
    if (r.penalty) lines.push(el('p', { class: 'reward late' }, labeled('timer', `Trả lời chậm: −${r.penalty} điểm`)))
  } else {
    const why = r.reason === 'shielded' ? 'tỉnh vừa dựng hàng rào' : 'một đội khác vừa cắm cờ trước'
    lines.push(el('p', { class: 'reward' }, `Tiếc quá — ${why}!`))
    addJournal(`Trả lời đúng ở ${name} nhưng ${why}`)
  }
  if (r.bonus - (r.pioneer ?? 0)) lines.push(el('p', { class: 'reward' }, labeled('star', `+${r.bonus - (r.pioneer ?? 0)} điểm thưởng`)))
  if (r.goldenBonus) lines.push(el('p', { class: 'reward golden' }, labeled('golden', `Câu hỏi vàng: +${r.goldenBonus} điểm (×2)`)))
  if (r.betBonus) lines.push(el('p', { class: 'reward' }, labeled('bet', `Mạo hiểm thành công: +${r.betBonus} điểm`)))
  if (r.speedBonus) lines.push(el('p', { class: 'reward' }, labeled('star', `Siêu tốc: +${r.speedBonus} điểm`)))
  if (r.home) lines.push(el('p', { class: 'reward home' }, labeled('home', `Về quê ${r.home.names.join(', ')}: +${r.home.bonus} điểm (${r.home.n}/${state.me.homes?.max ?? 3})`)))
  if (r.card) lines.push(el('p', { class: 'reward' }, labeled('card', 'Nhận thẻ'), ' ', labeled(CARD_INFO[r.card].icon, CARD_INFO[r.card].name)))
  // Chuỗi đúng: đếm câu liên tiếp; đủ 3 câu thì nhận thẻ trợ giúp (khay đầy: điểm thưởng)
  const s = r.streak
  if (s?.card) lines.push(el('p', { class: 'reward streak' }, labeled('streak', `Chuỗi ${s.n} câu đúng! Nhận thẻ`), ' ', labeled(CARD_INFO[s.card].icon, CARD_INFO[s.card].name)))
  else if (s?.bonus) lines.push(el('p', { class: 'reward streak' }, labeled('streak', `Chuỗi ${s.n} câu đúng! +${s.bonus} điểm (khay thẻ đã đầy)`)))
  else if (s?.n >= 2) lines.push(el('p', { class: 'reward streak' }, labeled('streak', `Chuỗi ${s.n} câu đúng — thêm ${3 - (s.n % 3)} câu nữa nhận thẻ trợ giúp`)))
  // Chưa đủ câu: nút chính là nhận câu tiếp theo ngay tại tỉnh (giờ chỉ tính từ lúc bấm — đọc lời giải thong thả)
  const ok = r.progress
    ? button(labeled('question', `Câu tiếp theo (${r.progress.done + 1}/${r.progress.of})`), 'green', () => { closeDialog(); retryHere() })
    : button('Tiếp tục', 'green', closeDialog)
  openDocked('result', q.province, el('div', { class: r.captured || r.progress ? 'result good' : 'result warn' },
    el('h2', {}, by ? `${by} trả lời đúng!` : 'Chính xác!'),
    el('p', { class: 'answer' }, `Đáp án: ${r.correctAnswer}`),
    r.explanation ? el('p', { class: 'explain' }, r.explanation) : '',
    r.round ? el('p', { class: 'answer' }, `Thắng ${r.round.att}–${r.round.def} sau ${r.round.no} hiệp`) : '',
    ...lines,
    r.react ? reactBox(q.province, r.react) : '',
    el('div', { class: 'dialog-actions' }, ...(r.progress ? [button('Để sau', '', closeDialog)] : []), ok),
  ))
  state.question = null
  ok.focus()
  // "Chính xác!" đóng dấu, điểm đếm tăng
  fx.stamp(dlg.querySelector('.result h2'), { tilt: -10 })
  if (r.captured) setTimeout(() => fx.countUp(pts, 0, p.points, 700), 250)
}

// "Đã từng / Muốn thử" (không bắt buộc, mỗi người tự bấm): chỉ thấy số đếm gộp cả phòng, không ai biết ai chọn gì
const REACT_TEXT = {
  food: { ask: p => `Bạn đã từng ăn đặc sản ${p} chưa?`, been: 'Đã từng ăn', want: 'Muốn thử', count: (b, w) => `Cả phòng: ${b} người đã từng ăn · ${w} người muốn thử` },
  place: { ask: p => `Bạn đã từng đến ${p} chưa?`, been: 'Đã từng đến', want: 'Muốn đến', count: (b, w) => `Cả phòng: ${b} người đã từng đến · ${w} người muốn đến` },
}
function reactBox(provinceId, kind) {
  const t = REACT_TEXT[kind]
  const count = el('p', { class: 'react-count' }, 'Không bắt buộc · chỉ hiện số người, không hiện tên')
  let mine = null
  const choose = async value => {
    const next = mine === value ? null : value // bấm lại = bỏ chọn
    try {
      const res = await api('/api/react', { province: provinceId, kind, value: next })
      mine = res.mine
      for (const b of box.querySelectorAll('.react-opt')) b.setAttribute('aria-pressed', String(b.dataset.value === mine))
      count.textContent = t.count(res.been, res.want)
      sound.click()
    } catch (err) {
      toast(err.message, true)
    }
  }
  const opt = value => button(t[value], 'react-opt', () => choose(value), { 'data-value': value, 'aria-pressed': 'false' })
  const box = el('div', { class: 'react-box' },
    el('p', { class: 'react-ask' }, t.ask(nameOf(provinceId))),
    el('div', { class: 'btn-row center' }, opt('been'), opt('want')),
    count)
  return box
}

// ---------- Chọn trước câu hỏi: chủ đề và / hoặc đặt cược (theo cài đặt phòng) ----------
// topics: chủ đề còn câu (rỗng = phòng không cho chọn chủ đề); bet: phòng cho đặt cược "Chắc ăn" / "Liều"
export function openTopicPicker(provinceId, topics, bet = false) {
  const p = state.map.byId.get(provinceId)
  let risky = false
  const pick = topic => {
    if (state.busy) return
    dlg.querySelectorAll('button').forEach(b => { b.disabled = true })
    act(async () => {
      try {
        const r = await api('/api/question', { topic, bet: risky })
        openQuestion(r.question)
      } catch (err) {
        dlg.querySelectorAll('button').forEach(b => { b.disabled = false })
        if (err.code === 'no-choosing') return toast('Đồng đội đã chọn rồi')
        throw err
      }
    })
  }
  // Hai lựa chọn cược: chỉ có cược → bấm là nhận câu luôn; có cả chủ đề → bật/tắt rồi chọn chủ đề
  const betButton = (on, title, sub, ic) => {
    const b = button('', `bet-opt${on ? ' risky' : ''}`, () => {
      risky = on
      if (!topics.length) return pick('random')
      dlg.querySelectorAll('.bet-opt').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
    }, { 'aria-pressed': String(!on) })
    b.append(el('span', { class: 'topic-icon' }, icon(ic)), el('span', { class: 'bet-text' }, el('b', {}, title), el('small', {}, sub)))
    return b
  }
  const bets = bet ? el('div', { class: topics.length ? 'bet-row toggle' : 'bet-row' },
    betButton(false, 'Chắc ăn', 'Điểm thường', 'flag'),
    betButton(true, 'Mạo hiểm', `Đúng +50% điểm · sai chờ thêm 30 giây`, 'bet')) : ''
  const grid = topics.length ? el('div', { class: 'topic-grid' },
    ...topics.map(t => button('', 'topic', () => pick(t.id))),
    button('', 'topic random', () => pick('random'))) : ''
  const need = state.me.room.quizCount
  const betNote = need > 1 ? `áp dụng cả ${need} câu` : ''
  // Có cả mức cược lẫn chủ đề: tách hai mục có tiêu đề (mockup/quiz-steps.html, S1); chỉ một thứ thì một câu hỏi như cũ
  const sec = (n, title, note, body) => el('section', { class: 'pick-sec' },
    el('h3', {}, el('span', { class: 'sec-no' }, String(n)), title, note ? el('small', {}, note) : ''), body)
  const body = bet && topics.length
    ? [sec(1, 'Mức cược', betNote, bets), sec(2, 'Chủ đề', 'bấm để nhận câu hỏi', grid)]
    : [el('p', { class: 'q-text' }, topics.length ? 'Bạn muốn trả lời câu hỏi về chủ đề nào?' : 'Trả lời câu này theo kiểu nào?'), bets, grid]
  const foot = topics.length ? 'Đồng hồ trả lời chỉ bắt đầu chạy sau khi chọn chủ đề.'
    : `Đồng hồ trả lời chỉ bắt đầu chạy sau khi chọn.${betNote ? ` Mức cược ${betNote}.` : ''}`
  openDocked('topic', provinceId,
    el('div', { class: 'q-head' },
      el('h2', {}, `Trạm: ${p.name} · ${p.points} điểm`)),
    quizSteps(),
    ...body,
    el('p', { class: 'muted' }, foot),
    el('div', { class: 'q-foot' }, el('span'), skipButton()),
  )
  const buttons = dlg.querySelectorAll('.btn.topic')
  topics.forEach((t, i) => buttons[i].append(el('span', { class: 'topic-icon' }, icon(TOPIC_ICON[t.id] ?? 'question')), t.name))
  if (topics.length) buttons[topics.length].append(el('span', { class: 'topic-icon' }, icon('dice')), 'Ngẫu nhiên')
}
