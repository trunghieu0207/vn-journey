// Màn team: thông báo nhanh (toast), nhật ký team, cảnh báo mất tỉnh, chữ cho sự kiện Lễ hội / Bão.

import { sound } from '/shared/sound.js'
import { labeled } from '/shared/icons.js'
import { $, el } from '/shared/dom.js'
import * as fx from '/shared/fx.js'
import { CARD_INFO, nameOf, now, solo, state } from './state.js'

// Thông báo dán vào như sticker, hết giờ thì bóc ra (shared/fx.js)
let toastTimer
export function toast(msg, bad = false, ic = '') {
  const t = $('toast')
  t.replaceChildren(ic ? labeled(ic, msg) : msg)
  t.classList.toggle('bad', bad)
  t.hidden = false
  fx.stickerIn(t, { base: 'translateX(-50%)', tape: true })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => fx.peelOut(t, { base: 'translateX(-50%)', done: () => { t.hidden = true } }), 3200)
}

export function storage(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key))
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return null
  }
}

export function addJournal(text, cls = '') {
  state.notes.unshift({ at: now(), text, cls })
  state.notes.length = Math.min(state.notes.length, 20)
  renderJournal()
}

// Nhật ký team từ server (ai trong team đã làm gì) + ghi chú chung, mới nhất trước
function logText(e) {
  const p = e.province ? nameOf(e.province) : ''
  const who = e.by && !solo() ? `${e.by}: ` : '' // phòng đơn: chỉ có mình — không cần tên
  switch (e.action) {
    case 'spawn': return [`Xuất phát ở ${p}`]
    case 'move': return [`${who}đi đến ${p}`]
    case 'retry': return [`${who}trả lời lại ở ${p}`]
    case 'retreat': return [`${who}quay lại ${p}`]
    case 'pushed-back': return [`Được mời về ${p}`, 'bad']
    case 'capture': return [solo() ? `Nhận tem ${p}` : `${who}cắm cờ ở ${p}`, 'good']
    case 'pioneer': return [`Tem Tiên phong ở ${p}: +${e.bonus} điểm`, 'good']
    case 'steal': return [`${who}thành chủ nhà mới của ${p}`, 'good']
    case 'siege': return [`${who}ghé thăm thử tài ${p}`]
    case 'wrong': return [e.timeout ? `Hết giờ ở ${p}` : `${who}trả lời sai ở ${p}`, 'bad']
    case 'siege-fail': return [e.timeout ? `Hết giờ thử tài ở ${p}` : `${who}thử tài ở ${p} chưa thành`, 'bad']
    case 'skip': return [`${who}bỏ qua câu hỏi ở ${p}`, 'bad']
    case 'topic': {
      // Bước chọn trước câu hỏi: chủ đề và / hoặc mức cược
      const parts = []
      if (state.me.room.topicChoice) parts.push(`chủ đề ${e.topic}`)
      if (e.bet || state.me.room.betChoice) parts.push(e.bet ? 'Mạo hiểm' : 'Chắc ăn')
      return [`${who}chọn ${parts.join(' · ')} ở ${p}`]
    }
    case 'speed': return [`Siêu tốc ở ${p}: +${e.bonus} điểm`, 'good']
    case 'progress': return [`${who}đúng ${e.done}/${e.of} câu ở ${p}`, 'good']
    case 'siege-bet': return [`${who}cược ${e.rounds} hiệp ở ${p}`]
    case 'duel-round': return [`Hiệp ${e.no}/${e.of} ở ${p}: ${e.winner === 'att' ? 'thắng' : 'thua'} (${e.att}–${e.def})`, e.winner === 'att' ? 'good' : 'bad']
    case 'home': return [`Về quê ${e.names.join(', ')} ở ${p}: +${e.bonus} điểm`, 'good']
    case 'shared-bonus': return [`Câu hỏi chung: cả phòng đúng ${e.pct}%, mọi team +${e.bonus} điểm`, 'good']
    case 'defend': return [`${who}đón khách thành công, giữ vững ${p}: +${e.bonus} điểm`, 'good']
    case 'defend-fail': return [`${who}trả lời sai câu đón khách ở ${p}`, 'bad']
    case 'held': return [`Giữ được ${p} — đoàn khách trả lời sai`, 'good']
    case 'repelled': return [`Thử tài ở ${p} chưa thành — chủ nhà trả lời đúng trước`, 'bad']
    case 'time-penalty': return [`Trả lời chậm ở ${p}: −${e.penalty} điểm`, 'bad']
    case 'card': return [`${who}dùng thẻ ${CARD_INFO[e.kind]?.name ?? ''}${p ? ` (${p})` : ''}`]
    case 'streak': return [`Chuỗi ${e.n} câu đúng! ${e.card ? `Nhận thẻ ${CARD_INFO[e.card].name}` : `+${e.bonus} điểm (khay thẻ đã đầy)`}`, 'good']
    case 'lost': return [`${p} đã đổi chủ!`, 'bad']
    default: return [e.action]
  }
}
export function renderJournal() {
  if (!state.me) return
  const fmt = at => new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const items = [
    ...state.me.log.map(e => { const [text, cls] = logText(e); return { at: e.at, text, cls } }),
    ...state.notes,
  ].sort((a, b) => b.at - a.at).slice(0, 40)
  $('journal').replaceChildren(...items.map(j => el('li', j.cls ? { class: j.cls } : {}, el('time', {}, fmt(j.at)), j.text)))
}

export { eventSign, eventText } from '/shared/events.js'

export function showLost(names) {
  sound.lost()
  const a = $('alertLost')
  a.replaceChildren(labeled('siege', `Bạn vừa mất ${names}!`))
  a.hidden = false
  const base = 'translateX(-50%)'
  fx.stickerIn(a, { base, tilt: -12, scale: 1.5 }).then(() => fx.shakeX(a, { base, amp: 7 }))
  clearTimeout(showLost.timer)
  showLost.timer = setTimeout(() => fx.peelOut(a, { base, done: () => { a.hidden = true } }), 4500)
}
