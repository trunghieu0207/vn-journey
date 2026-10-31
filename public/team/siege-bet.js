// Màn team: cược số hiệp khi thử tài (chốt 30/10) + dòng hiệp / tỉ số khi đấu nhiều hiệp.
// Bấm Thử tài → cả đội công thành lẫn đội giữ tỉnh cược kín 1–3 hiệp trong 10 giây. Lấy số lớn hơn; bên không cược theo bên kia;
// không ai cược: 1 hiệp. Thắng đa số, hòa thì chủ nhà giữ tỉnh. Thắng: +50 × số hiệp; đoàn khách thua: nghỉ chân 30 giây × số hiệp.

import { api, formatClock } from '/shared/api.js'
import { sound } from '/shared/sound.js'
import { labeled } from '/shared/icons.js'
import { button, el } from '/shared/dom.js'
import { act } from './actions.js'
import { closeDialog, dlg, openDocked } from './dialogs.js'
import { toast } from './notify.js'
import { nameOf, now, state } from './state.js'

// Đoàn khách cần thắng mấy hiệp: 1 → 1/1, 2 → 2/2, 3 → 2/3 (server: roundOver)
const NEED_TEXT = n => (n === 1 ? 'thắng 1 hiệp' : n === 2 ? 'thắng cả 2 hiệp' : 'thắng 2/3 hiệp')

// role: 'att' (mình bấm Thử tài) | 'def' (đoàn khách ghé tỉnh mình). bet: { duelId, province, until, mine, max }
export function openSiegeBet(bet, role) {
  state.siegeBet = { ...bet, role }
  const name = nameOf(bet.province)
  const atk = role === 'att'
  if (!atk) {
    state.defense = bet // để apply() nhận ra khung đang mở (defKey)
    sound.lost()
  }
  const choices = Array.from({ length: bet.max }, (_, i) => i + 1).map(n => {
    const b = button('', `bet-opt rounds-opt${bet.mine === n ? ' picked' : ''}`, () => place(n), {
      'aria-pressed': String(bet.mine === n), disabled: bet.mine != null,
    })
    b.append(el('span', { class: 'bet-text' }, el('b', {}, `${n} hiệp`),
      el('small', {}, atk ? `Bạn cần ${NEED_TEXT(n)} · thắng +${50 * n}` : `Khách cần ${NEED_TEXT(n)} · giữ được +${50 * n}`)))
    return b
  })
  openDocked(atk ? 'siegebet' : 'defense', bet.province,
    el('div', { class: 'q-head' },
      el('h2', {}, atk ? `Thử tài: ${name}` : `Đón khách: ${name}`),
      el('span', { class: 'tag siege' }, labeled('siege', 'Cược số hiệp'))),
    el('p', { class: atk ? 'explain' : 'defense-alert' }, atk
      ? 'Chủ nhà cũng đang cược. Lấy số lớn hơn; bên nào không cược thì theo số của bên kia. Mỗi hiệp một câu khó, ai đúng trước thắng hiệp — hòa thì chủ nhà giữ tỉnh.'
      : `Có đoàn khách ghé thử tài ở ${name}! Cược số hiệp để giữ tỉnh. Không cược thì theo số của đoàn khách. Hòa thì bạn giữ tỉnh.`),
    el('div', { class: 'rounds-row' }, ...choices),
    el('p', { class: 'bet-wait muted' }, waitText(bet, atk)),
    el('div', { class: 'q-timer bet-timer' }, ''),
    el('div', { class: 'q-foot' },
      el('span', { class: 'muted' }, atk ? `Thua: nghỉ chân 30 giây × số hiệp` : 'Ai trong team bấm trước thì tính'),
      atk ? button('Thôi thử tài', 'skip', giveUp) : button('Để sau', '', () => { state.defenseSkipped.add(defKey(bet)); state.defense = null; closeDialog() })),
  )
  if (!atk) dlg.classList.add('defense')
  updateBetTimer()
}

const waitText = (bet, atk) => (bet.mine == null
  ? 'Chọn số hiệp — hết giờ mà chưa chọn thì theo số của bên kia (không ai chọn: 1 hiệp).'
  : `Đã cược ${bet.mine} hiệp — chờ ${atk ? 'chủ nhà' : 'đoàn khách'} hoặc hết giờ cược.`)

// Khóa của một khung phòng thủ: sang giai đoạn / hiệp mới là khung mới (mở lại dù hiệp trước đã "Để sau")
export const defKey = d => `${d.duelId}:${d.phase ?? 'play'}:${d.round?.no ?? 1}`

function place(n) {
  const bet = state.siegeBet
  if (!bet || state.busy) return
  dlg.querySelectorAll('.rounds-opt').forEach(b => { b.disabled = true })
  act(async () => {
    try {
      await api('/api/siege-bet', { duelId: bet.duelId, rounds: n })
    } catch (err) {
      if (err.code === 'bet-done') return toast('Đồng đội đã cược rồi')
      if (err.code === 'bet-closed') return toast('Đã hết thời gian cược')
      dlg.querySelectorAll('.rounds-opt').forEach(b => { b.disabled = false })
      throw err
    }
    sound.click()
    betUpdated({ ...bet, mine: n })
  })
}

function giveUp() {
  act(async () => {
    const r = await api('/api/skip', {})
    state.siegeBet = null
    closeDialog()
    toast(`Thôi thử tài — quay về ${nameOf(r.province)}`, true)
  })
}

// Trạng thái cược mới từ server (đồng đội vừa cược / mình vừa cược): đánh dấu lựa chọn, khóa các nút
export function betUpdated(bet) {
  if (!state.siegeBet || state.siegeBet.duelId !== bet.duelId) return
  state.siegeBet = { ...state.siegeBet, mine: bet.mine }
  for (const b of dlg.querySelectorAll('.rounds-opt')) {
    const n = Number(b.querySelector('b').textContent.split(' ')[0])
    b.disabled = bet.mine != null
    b.classList.toggle('picked', bet.mine === n)
    b.setAttribute('aria-pressed', String(bet.mine === n))
  }
  const w = dlg.querySelector('.bet-wait')
  if (w) w.textContent = waitText(state.siegeBet, state.siegeBet.role === 'att')
}

// Gọi mỗi nhịp đồng hồ (render.js): đếm lùi hạn cược
export function updateBetTimer() {
  const bet = state.siegeBet
  const t = dlg.querySelector('.bet-timer')
  if (!bet || !t) return
  const left = bet.until - now()
  t.replaceChildren(labeled('timer', left > 0 ? `Còn ${formatClock(left)} để cược` : 'Hết giờ cược — vào hiệp 1…'))
}

// Đấu nhiều hiệp: "Hiệp 2/3 · Đội bạn 1 – 0 Chủ nhà". role: 'att' | 'def' (đội mình ở bên nào)
export function roundLine(round, role) {
  if (!round) return ''
  const mine = role === 'att' ? round.att : round.def, foe = role === 'att' ? round.def : round.att
  return el('p', { class: 'round-line' },
    el('b', {}, `Hiệp ${round.no}/${round.of}`), ' · Đội bạn ', el('b', { class: 'score' }, `${mine} – ${foe}`), ` ${role === 'att' ? 'Chủ nhà' : 'Đoàn khách'}`,
    el('small', {}, role === 'att' ? ` · cần ${NEED_TEXT(round.of)}` : ` · khách cần ${NEED_TEXT(round.of)}`))
}

// Kết quả một hiệp (chưa ngã ngũ): báo ngắn, hiệp sau tự mở sau vài giây
export function roundToast(round, role, how = '') {
  const mine = role === 'att' ? round.att : round.def, foe = role === 'att' ? round.def : round.att
  const won = (round.winner === 'att') === (role === 'att')
  toast(`${won ? 'Thắng' : 'Thua'} hiệp ${round.no}${how} — tỉ số ${mine}–${foe}. Hiệp ${round.no + 1} bắt đầu ngay…`, !won, 'siege')
}

