// Màn team: câu hỏi chung cả phòng — khung riêng (mở chồng lên mọi khung khác), mỗi người chọn trên máy mình.
// Lựa chọn của mình chỉ lưu trên máy này (server không gửi lại ai chọn gì).

import { api } from '/shared/api.js'
import { sound } from '/shared/sound.js'
import { $, button, el } from '/shared/dom.js'
import { labeled } from '/shared/icons.js'
import { sharedPanel, sharedTick } from '/shared/shared-q.js'
import { storage, toast } from './notify.js'
import { isHost, nameOf, now, state } from './state.js'

export const sharedDlg = $('sharedDlg')
sharedDlg.addEventListener('cancel', e => e.preventDefault()) // Esc dành cho che màn hình

const voteKey = sh => `vnj-shared-${state.me.me?.id}-${sh.at}`

export function renderShared(prev = null) {
  const sh = state.me.status === 'ended' ? null : state.me.shared
  if (!sh) {
    if (sharedDlg.open) sharedDlg.close()
    return
  }
  const mine = storage(voteKey(sh))
  sharedDlg.replaceChildren(sharedPanel(sh, { provinceName: nameOf(sh.province), mine, onPick: pick }),
    // Chủ phòng đang chơi: công bố sớm / tiếp tục trận ngay trong khung
    isHost() ? el('div', { class: 'btn-row host-row' },
      sh.result ? '' : button(labeled('stats', 'Công bố ngay'), '', () => hostCall('/api/owner/shared', { action: 'reveal' })),
      button(labeled('play', 'Tiếp tục trận'), 'green', () => hostCall('/api/owner/game', { action: 'resume' }))) : '')
  sharedTick(sharedDlg, sh, now())
  if (!sharedDlg.open) {
    sharedDlg.showModal()
    sound.event()
  }
  // Vừa công bố: tiếng đúng / sai theo lựa chọn của mình
  if (sh.result && prev?.shared && !prev.shared.result && mine != null) {
    if (mine === sh.result.correct) sound.correct()
    else sound.wrong()
  }
}

async function hostCall(path, body) {
  try {
    await api(path, body)
  } catch (err) {
    toast(err.message, true)
  }
}

async function pick(i) {
  const sh = state.me.shared
  if (!sh || sh.result) return
  storage(voteKey(sh), i)
  sound.click()
  renderShared()
  try {
    await api('/api/shared-vote', { answer: i })
  } catch (err) {
    toast(err.message, true)
  }
}

setInterval(() => {
  if (sharedDlg.open && state.me?.shared) sharedTick(sharedDlg, state.me.shared, now())
}, 250)
