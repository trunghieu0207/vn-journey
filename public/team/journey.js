// Màn chơi đơn: Sổ tay hành trình — tem của mình theo 3 miền (Tiên phong: tem vàng), bấm tem xem điều đã học;
// danh sách Muốn thử / Muốn đến. Mở được cả sau khi kết thúc.

import { api } from '/shared/api.js'
import { REGION_NAME } from '/shared/map.js'
import { labeled } from '/shared/icons.js'
import { $, button, el } from '/shared/dom.js'
import { closeDialog, dlg, openDialog } from './dialogs.js'
import { toast } from './notify.js'
import { nameOf, state } from './state.js'

const REGIONS = ['north', 'central', 'south']

export async function openJourney() {
  let j
  try {
    j = await api('/api/journal')
  } catch (err) {
    return toast(err.message, true)
  }
  const mine = new Map(j.stamps.map(s => [s.province, s]))
  const detail = el('div', { class: 'jr-detail' }, el('p', { class: 'muted' }, 'Bấm một con tem để xem điều bạn đã học ở tỉnh đó.'))
  const show = id => {
    const s = mine.get(id)
    detail.replaceChildren(
      el('h3', {}, nameOf(id), s?.first ? el('span', { class: 'jr-badge' }, 'Tiên phong') : ''),
      !s ? el('p', { class: 'muted' }, 'Chưa có tem — tới tỉnh này và trả lời đúng để nhận tem.')
        : s.start ? el('p', { class: 'muted' }, 'Tỉnh xuất phát của bạn.')
        : el('div', {}, el('p', { class: 'jr-q' }, s.content), s.explanation ? el('p', { class: 'jr-a' }, s.explanation) : ''))
  }
  const byRegion = r => [...state.map.byId.values()].filter(p => p.region === r).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  const regions = REGIONS.map(r => {
    const list = byRegion(r)
    return el('section', { class: 'jr-region' },
      el('h3', {}, `${REGION_NAME[r]} `, el('span', { class: 'muted' }, `${list.filter(p => mine.has(p.id)).length}/${list.length}`)),
      el('div', { class: 'jr-grid' }, ...list.map(p => {
        const s = mine.get(p.id)
        return el('button', { type: 'button', class: `jr-stamp${s ? ' got' : ''}${s?.first ? ' first' : ''}`, onclick: () => show(p.id), title: p.name },
          el('span', {}, p.name))
      })))
  })
  const firsts = j.stamps.filter(s => s.first).length
  const wishes = { food: j.wishes.filter(w => w.kind === 'food'), place: j.wishes.filter(w => w.kind === 'place') }
  const wishLine = (title, rows) => rows.length ? el('p', {}, el('b', {}, `${title}: `), rows.map(w => nameOf(w.province)).join(', ')) : ''
  openDialog('journey',
    el('div', { class: 'journey' },
      el('h2', {}, labeled('map', `Sổ tay hành trình · ${j.name}`)),
      el('div', { class: 'cul-stats' },
        el('div', {}, el('b', {}, `${j.stamps.length}/${j.total}`), el('span', {}, 'tem')),
        el('div', {}, el('b', {}, String(firsts)), el('span', {}, 'tem Tiên phong')),
        el('div', {}, el('b', {}, j.score.toLocaleString('vi-VN')), el('span', {}, 'điểm'))),
      wishLine('Muốn thử đặc sản', wishes.food), wishLine('Muốn đến', wishes.place),
      ...regions, detail),
    el('div', { class: 'dialog-actions' }, button('Đóng', 'green', closeDialog)))
  dlg.classList.add('journey-dlg')
}

$('journeyBtn').addEventListener('click', openJourney)
