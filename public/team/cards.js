// Màn team: thẻ bài — dùng thẻ, hiệu ứng lật thẻ khi vừa nhận.

import { api } from '/shared/api.js'
import { REGION_NAME } from '/shared/map.js'
import { sound } from '/shared/sound.js'
import { labeled } from '/shared/icons.js'
import { button, el } from '/shared/dom.js'
import * as fx from '/shared/fx.js'
import { act } from './actions.js'
import { closeDialog, dlg, openDialog } from './dialogs.js'
import { toast } from './notify.js'
import { renderAll } from './render.js'
import { CARD_INFO, nameOf, now, state } from './state.js'
import { useHelp } from './question.js'

// ---------- Thẻ bài ----------
export function openCard(card) {
  const info = CARD_INFO[card.kind]
  // Thẻ trợ giúp: đang mở câu hỏi thì dùng luôn; không thì chỉ giải thích (dùng trong khung câu hỏi)
  if (info.help) {
    if (state.dialogMode === 'question' && state.question) return useHelp(card.kind)
    return openDialog('card', el('div', { class: 'result' },
      el('h2', {}, labeled(info.icon, info.name)),
      el('p', { class: 'explain' }, info.hint),
      el('p', {}, 'Thẻ trợ giúp dùng trong lúc trả lời: bấm nút thẻ ngay trong khung câu hỏi.'),
      el('div', { class: 'dialog-actions' }, button('Đã hiểu', 'green', closeDialog))))
  }
  let choices
  if (card.kind === 'scout') {
    choices = Object.entries(REGION_NAME).map(([r, label]) => button(label, 'primary', () => useCard(card, r)))
  } else if (card.kind === 'shield') {
    const mine = state.me.mine.filter(m => !(m.shieldUntil && m.shieldUntil > now()))
    choices = mine.length
      ? mine.map(m => button(nameOf(m.province), 'primary', () => useCard(card, m.province)))
      : [el('p', { class: 'muted' }, 'Mọi tỉnh của đội bạn đều đang có hàng rào.')]
  } else {
    choices = [button('Dùng ngay', 'primary', () => useCard(card, ''))]
  }
  openDialog('card', el('div', { class: 'result' },
    el('h2', {}, labeled(info.icon, info.name)),
    el('p', { class: 'explain' }, info.hint),
    card.kind === 'scout' ? el('p', {}, 'Chọn miền muốn nhìn bằng ống nhòm:') : card.kind === 'shield' ? el('p', {}, 'Chọn tỉnh muốn dựng hàng rào:') : '',
    el('div', { class: 'dialog-actions' }, ...choices),
    el('div', { class: 'dialog-actions' }, button('Để sau', '', closeDialog)),
  ))
}

function useCard(card, target) {
  act(async () => {
    const r = await api('/api/card', { cardId: card.id, target })
    closeDialog()
    sound.event()
    if (r.kind === 'scout') {
      state.scout = { region: r.region, revealed: new Set(r.revealed), counts: r.counts ?? null, until: r.until }
      // Phòng đơn: số người có tem từng tỉnh trong miền (rê chuột lên tỉnh để xem)
      if (r.counts) toast(`${REGION_NAME[r.region]}: ${Object.keys(r.counts).length} tỉnh đã có người nhận tem (sương tan 10 giây)`, false, 'scout')
      else toast(`${REGION_NAME[r.region]}: ${r.revealed.length} tỉnh đã có chủ (sương tan 10 giây)`, false, 'scout')
      renderAll()
    } else if (r.kind === 'shield') {
      toast(`${nameOf(r.province)} có hàng rào 5 phút`, false, 'shield')
    } else {
      toast('Lượt kế tiếp được đi xa 2 tỉnh', false, 'march')
    }
  })
}

// Diễn hiệu ứng lật thẻ cho thẻ đang chờ, khi không có hộp thoại nào mở
export async function revealCards() {
  while (state.cardQueue.length && !dlg.open) {
    const c = state.cardQueue.shift()
    const info = CARD_INFO[c.kind]
    if (info) await fx.cardReveal({ iconName: info.icon, name: info.name, hint: info.hint, target: document.querySelector('.card.cards') })
  }
}
