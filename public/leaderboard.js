// Trang bảng xếp hạng cá nhân cả sự kiện (/leaderboard): phòng chơi đơn đã kết thúc, mỗi tên một dòng = trận điểm cao nhất.
// Dữ liệu từ GET /api/leaderboard (công khai), tự làm mới 30 giây. Tên người chơi gán bằng textContent (qua el()).

import { api } from '/shared/api.js'
import { $, el } from '/shared/dom.js'
import { icon, fillIcons } from '/shared/icons.js'
import { mascotIcon } from '/shared/mascots.js'

const fmt = n => n.toLocaleString('vi-VN')
const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()
const avatar = (e, size) => mascotIcon([...e.name][0]?.toLocaleUpperCase('vi') ?? '?', e.color, size)

let data = null

async function load() {
  try {
    data = await api('/api/leaderboard')
  } catch {
    return // giữ bảng cũ, lần sau thử lại
  }
  render()
}

function render() {
  const { entries, players, plays, keepDays } = data
  $('summary').textContent = players ? `${fmt(players)} lữ khách · ${fmt(plays)} lượt chơi · tự cập nhật` : ''
  $('empty').hidden = entries.length > 0
  $('board').hidden = $('search').parentElement.hidden = entries.length === 0
  $('hint').textContent = entries.length
    ? `Chỉ tính phòng chơi đơn đã kết thúc. Cùng tên ở nhiều phòng tính là một người. Bằng điểm: nhiều tem hơn xếp trên. Bảng giữ ${keepDays} ngày${entries.length < players ? `, hiện top ${entries.length}` : ''}.`
    : ''

  // Bục vinh danh: hạng 2 – 1 – 3 (như màn tổng kết trận)
  $('podium').replaceChildren(...[1, 0, 2].filter(i => entries[i]).map(i => {
    const e = entries[i]
    const step = el('div', { class: `podium-step p${i + 1}` },
      el('span', { class: 'podium-medal' }, icon(`medal${Math.min(e.rank, 3)}`, { size: i === 0 ? 52 : 44, label: `Hạng ${e.rank}` })))
    step.style.setProperty('--c', e.color)
    return el('div', { class: 'podium-col' },
      i === 0 ? el('span', { class: 'podium-crown' }, icon('trophy', { size: 30 })) : '',
      el('span', { class: 'podium-mascot' }, avatar(e, i === 0 ? 56 : 46)),
      el('b', {}, e.name), el('span', { class: 'podium-score' }, fmt(e.score)), step)
  }))
  renderRows()
}

// Ô tìm: lọc theo tên (bỏ dấu), vẫn giữ hạng thật
function renderRows() {
  if (!data) return
  const find = normalize($('search').value)
  const shown = data.entries.filter(e => !find || normalize(e.name).includes(find))
  $('rows').replaceChildren(...(shown.length ? shown.map(e => el('tr', { class: find ? 'match' : '' },
    el('td', { class: 'rank' }, e.rank <= 3 ? icon(`medal${e.rank}`, { size: 26, label: `Hạng ${e.rank}` }) : String(e.rank)),
    el('td', {}, el('span', { class: 'who' }, avatar(e, 26), e.name)),
    el('td', { class: 'num total' }, fmt(e.score)),
    el('td', { class: 'num' }, String(e.stamps)),
    el('td', { class: 'num' }, String(e.games))))
    : [el('tr', {}, el('td', { class: 'none', colspan: '5' }, 'Không thấy tên này trong bảng'))]))
}

$('search').addEventListener('input', renderRows)
fillIcons()
load()
setInterval(load, 30_000)
