// Tổng kết "Hành trình văn hóa" (sau khi kết thúc): dùng chung cho trang team, trang chủ phòng và màn chiếu.
// Dữ liệu `culture` trong /api/replay: chỉ số gộp cả phòng — không tên người, không so sánh miền.

import { el } from './dom.js'
import { labeled } from './icons.js'

const section = (title, ...children) => el('section', { class: 'cul-sec' }, el('h3', {}, title), ...children)
const tops = (rows, nameOf, unit) => el('ol', { class: 'cul-top' }, ...rows.map(r => el('li', {}, el('b', {}, nameOf(r.province)), ` · ${r.n} ${unit}`)))
const reveal = (x, nameOf, extra) => el('li', { class: 'cul-q' },
  el('span', { class: 'cul-where' }, nameOf(x.province)), extra ? el('span', { class: 'cul-stat' }, extra) : '',
  el('p', { class: 'cul-text' }, x.content),
  el('p', { class: 'cul-answer' }, el('b', {}, `Đáp án: ${x.answer}. `), x.explanation ?? ''))

export function cultureView(c, nameOf) {
  if (!c) return ''
  const lists = [
    ['Đặc sản cả phòng muốn thử', c.food.want, 'người muốn thử'],
    ['Đặc sản nhiều người đã ăn', c.food.been, 'người đã ăn'],
    ['Nơi cả phòng muốn đến', c.place.want, 'người muốn đến'],
    ['Nơi nhiều người đã đến', c.place.been, 'người đã đến'],
  ].filter(([, rows]) => rows.length)
  return el('div', { class: 'culture' },
    el('h2', {}, labeled('map', 'Hành trình văn hóa')),
    el('div', { class: 'cul-stats' },
      el('div', {}, el('b', {}, String(c.answers)), el('span', {}, `câu đã trả lời · đúng ${c.correctPct}%`)),
      el('div', {}, el('b', {}, `${c.visited}/${c.provinces}`), el('span', {}, 'tỉnh, thành cả phòng đã ghé')),
      el('div', {}, el('b', {}, String(c.reactions)), el('span', {}, 'lượt "Đã từng / Muốn thử"'))),
    c.hardest.length ? section('Câu khó nhất trận', el('ul', {}, ...c.hardest.map(x => reveal(x, nameOf, `${x.ok}/${x.n} lượt đúng`)))) : '',
    c.shared.length ? section('Câu hỏi chung cả phòng', el('ul', {}, ...c.shared.map(x => reveal(x, nameOf, `cả phòng đúng ${x.pct}%`)))) : '',
    lists.length ? el('div', { class: 'cul-lists' }, ...lists.map(([title, rows, unit]) => section(title, tops(rows, nameOf, unit)))) : '',
    c.rivals ? el('p', { class: 'cul-rivals' }, labeled('siege', `Cặp so tài nhiều nhất: ${c.rivals.a} và ${c.rivals.b} · ${c.rivals.n} lần`)) : '')
}
