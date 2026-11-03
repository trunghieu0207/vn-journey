// Màn team: thao tác trên bản đồ — đi tới tỉnh, công thành, rút lui (mọi luật chơi kiểm tra ở server).

import { api } from '/shared/api.js'
import { sound } from '/shared/sound.js'
import { labeled } from '/shared/icons.js'
import { $, button, el } from '/shared/dom.js'
import { closeDialog, dlg, dockReserve, openDocked, setFocusFree, unfocus } from './dialogs.js'
import { showEntry } from './entry.js'
import { apply } from '/team.js'
import { toast } from './notify.js'
import { openQuestion, openTopicPicker } from './question.js'
import { siegeIntro } from './siege-fx.js'
import { openSiegeBet } from './siege-bet.js'
import { renderSide, siegeWaitText } from './render.js'
import { TEAMMATE_FIRST, canMove, hasPending, lastActor, nameOf, state } from './state.js'

// Lấy lại trạng thái từ server rồi vẽ lại (apply tự mở khung chọn chủ đề / câu hỏi nếu đang chờ)
async function resync() {
  try { apply(await api('/api/me')) } catch (err) { console.error(err) }
}
export function reopenPending() {
  if (state.me.pendingQuestion) openQuestion(state.me.pendingQuestion, true)
  else if (state.me.choosing) openTopicPicker(state.me.choosing.province, state.me.choosing.topics, state.me.choosing.bet, state.me.choosing.worth)
}
// ---------- Thao tác ----------
export async function act(fn) {
  if (state.busy) return null
  state.busy = true
  renderSide()
  try {
    return await fn()
  } catch (err) {
    if (err.status === 401) showEntry('Bạn đã rời phòng hoặc phiên đã hết hạn.')
    else toast(err.message, true)
    return null
  } finally {
    state.busy = false
    if (state.me) renderSide()
  }
}

// Bấm tỉnh: camera bay tới tỉnh (song song với gọi server), tới nơi mới trượt khung câu hỏi vào
export function moveTo(id) {
  if (!state.me || state.busy) return
  if (hasPending()) return reopenPending() // đang dở câu hỏi / chọn chủ đề: mở lại khung đó
  if (!canMove()) return
  sound.click()
  // Tỉnh của đội mình: không có câu hỏi → không phóng camera, chỉ di chuyển (nón lá nhảy sang, tỉnh nổi khối)
  const quiet = state.me.known[id] === 'mine'
  state.moving = true
  if (!quiet) state.focusedId = id
  const flight = quiet ? Promise.resolve() : state.map.focusOn(id, dockReserve())
  act(async () => {
    let r
    try {
      r = await api('/api/move', { provinceId: id })
      await flight
      // Tỉnh vừa bị đội khác cướp mất (server trả khung cần mở) → lúc này mới bay tới
      if (quiet && r.status !== 'own') {
        state.focusedId = id
        await state.map.focusOn(id, dockReserve())
      }
    } catch (err) {
      state.moving = false
      // Đồng đội thao tác trước (đã đi tỉnh khác, đang có câu hỏi / chọn chủ đề, vừa bị khóa…):
      // lấy lại trạng thái — apply() bay tới đúng tỉnh và mở đúng khung — rồi báo nhẹ, không báo lỗi
      if (TEAMMATE_FIRST.has(err.code)) {
        const before = state.me.current
        setFocusFree()
        await resync()
        const by = lastActor()
        toast(state.me.current !== before ? `${by} đã đưa team tới ${nameOf(state.me.current)} trước bạn` : `${by} đã thao tác trước bạn`)
        if (!hasPending()) state.map.unfocus() // không có khung nào cần mở: bỏ làm mờ, bay về vị trí team
        return
      }
      unfocus()
      throw err
    }
    state.moving = false
    openFor(r, id, quiet)
  })
}

// Mở khung ứng với kết quả server khi team ở tỉnh `id` (vừa tới / trả lời lại)
function openFor(r, id, quiet = false) {
  try {
    if (r.status === 'question') openQuestion(r.question)
    else if (r.status === 'choose') openTopicPicker(id, r.topics, r.bet, r.worth)
    else if (r.status === 'owned') openSiegeChoice(id, false, r)
    else if (r.status === 'shielded') openSiegeChoice(id, true)
    else {
      toast(`Về ${nameOf(id)} — tỉnh của đội bạn`)
      if (!quiet) unfocus()
    }
  } catch (err) {
    // Lỗi khi mở khung: không coi là thao tác thất bại (server đã ghi nhận) → lấy lại trạng thái và mở lại
    console.error(err)
    resync()
  }
}

// Trả lời lại ở tỉnh đang đứng (vừa trả lời sai, đã hết khóa): server phát câu khác, không cần đi tỉnh khác rồi quay về
export function retryHere() {
  if (!state.me || state.busy || !canMove() || !state.me.canRetry) return
  const id = state.me.current
  sound.click()
  state.focusedId = id
  const flight = state.map.focusOn(id, dockReserve())
  act(async () => {
    let r
    try {
      r = await api('/api/retry', {})
      await flight
    } catch (err) {
      // Đồng đội vừa bấm trước (đã có câu hỏi / đã đi tỉnh khác): lấy lại trạng thái, apply() mở đúng khung
      if (TEAMMATE_FIRST.has(err.code)) {
        setFocusFree()
        await resync()
        toast(`${lastActor()} đã thao tác trước bạn`)
        if (!hasPending()) state.map.unfocus()
        return
      }
      unfocus()
      throw err
    }
    openFor(r, id)
  })
}

// Bấm Thử tài: chưa có câu — mở khung cược số hiệp (câu hiệp 1 tới qua realtime khi hết cược)
export function siege() {
  act(async () => {
    const r = await api('/api/siege', {})
    openSiegeBet({ duelId: r.duelId, province: r.province, until: r.until, mine: null, max: r.max }, 'att')
    siegeIntro(r.province, 'atk', nameOf(r.province)) // camera đã ở tỉnh (khung "Tỉnh này đã có chủ")
  })
}

function retreat() {
  act(async () => {
    const r = await api('/api/retreat', {})
    closeDialog()
    toast(`Quay lại ${nameOf(r.province)}`)
  })
}
$('siegeBtn').addEventListener('click', siege)
$('retreatBtn').addEventListener('click', retreat)

// block (từ server lúc tới tỉnh): { blocked: 'calm' (vừa đứng vững, miễn tới `until`) | 'besieged' (đội khác đang công thành) }.
// Sau đó khung tự cập nhật theo trạng thái realtime (updateSiegeChoice, gọi mỗi nhịp đồng hồ + mỗi lần SSE về).
function openSiegeChoice(id, shielded, block = {}) {
  const p = state.map.byId.get(id)
  state.siegeChoice = { id, block }
  const actions = shielded
    ? [button(labeled('retreat', 'Quay lại'), 'primary', retreat), button('Để sau', '', closeDialog)]
    : [button(labeled('siege', 'Ghé thăm thử tài'), 'danger siege-go', siege), button(labeled('retreat', 'Quay lại'), '', retreat), button('Để sau', '', closeDialog)]
  openDocked('siege', id, el('div', { class: 'result warn' },
    el('h2', {}, shielded ? labeled('shield', 'Tỉnh đang có hàng rào') : labeled('flag-unknown', 'Tỉnh này đã có chủ!')),
    el('p', { class: 'answer' }, `${p.name} · ${p.points} điểm`),
    el('p', { class: 'explain' }, shielded
      ? 'Chưa ghé thăm thử tài được lúc này. Quay lại hoặc đi tiếp sang tỉnh khác.'
      : 'Bấm Thử tài: hai đội cược 1–3 hiệp trong 10 giây (lấy số lớn hơn). Mỗi hiệp chủ nhà trả lời cùng câu khó — ai đúng trước thắng hiệp; thắng đa số thì thành chủ nhà mới (+50 × số hiệp), hòa thì chủ nhà giữ tỉnh. Đấu 1 hiệp mà thua: chờ 30–45 giây; nhiều hiệp: chờ 30 giây × số hiệp và quay về tỉnh trước.'),
    el('p', { class: 'defense-alert siege-wait', hidden: true }),
    el('div', { class: 'dialog-actions' }, ...actions),
  ))
  updateSiegeChoice()
}

// Khung "Tỉnh này đã có chủ" đang mở: đếm lùi thời gian chờ; hết chờ (hoặc đội khác công thành xong) thì mở nút Công thành
export function updateSiegeChoice() {
  const c = state.siegeChoice
  if (!c || state.dialogMode !== 'siege' || !state.me) return
  // Trạng thái realtime khi team đã ở tỉnh đó; trước khi SSE kịp về thì dùng kết quả lúc tới tỉnh
  const block = state.me.current === c.id && state.me.siegeBlock ? state.me.siegeBlock : c.block
  const text = siegeWaitText(block)
  const note = dlg.querySelector('.siege-wait'), go = dlg.querySelector('.siege-go')
  if (note && note.textContent !== text) note.textContent = text
  if (note) note.hidden = !text
  if (go) go.disabled = state.busy || !!text
}
