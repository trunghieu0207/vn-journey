// Màn tổng kết khi trận kết thúc — dùng chung cho trang team và trang chủ phòng.
// Dữ liệu lấy từ /api/replay (chỉ mở sau khi kết thúc). Dữ liệu động gán bằng textContent.

import { mascotIcon } from './mascots.js'
import { icon, labeled } from './icons.js'

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  e.append(...children)
  return e
}
const fmt = n => n.toLocaleString('vi-VN')
// Tổng thời gian trả lời (ms) → "05:42"
export const fmtTime = ms => {
  const s = Math.round((ms ?? 0) / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const signed = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0')

// Tỉnh cuối cùng thuộc team nào (phát lại các lần chiếm / cướp)
export function finalOwnership(replay) {
  const owners = new Map()
  for (const e of replay.events) {
    if (e.action === 'capture' || e.action === 'steal' || e.action === 'spawn') owners.set(e.province_id, e.team_id)
  }
  return owners
}

/**
 * Tạo nội dung tổng kết: bục vinh danh top 3 + bảng xếp hạng có chi tiết điểm.
 * myTeamId: team của người đang xem (tô nổi), có thể null (chủ phòng).
 */
export function resultsView(replay, { myTeamId = null } = {}) {
  const scores = replay.scores
  const solo = replay.mode === 'solo' // phòng đơn: "tem" thay cho "tỉnh", "Bạn" thay cho tên team
  const rankOf = new Map(scores.map((s, i) => [s.teamId, i + 1]))
  const mine = scores.find(s => s.teamId === myTeamId)

  const head = el('div', { class: 'results-head' },
    el('h2', {}, labeled('finish', 'Tổng kết trận đấu')),
    mine ? el('p', { class: rankOf.get(mine.teamId) === 1 ? 'results-mine win' : 'results-mine' }, rankOf.get(mine.teamId) === 1
      ? labeled('trophy', `${solo ? 'Bạn' : mine.name} vô địch với ${fmt(mine.total)} điểm!`)
      : `${solo ? 'Bạn' : mine.name} xếp hạng ${rankOf.get(mine.teamId)}/${scores.length} với ${fmt(mine.total)} điểm`) : '')

  // Bục vinh danh: hạng 2 – 1 – 3. Mỗi bậc là mẩu sticker màu team (viền + gờ đáy sẫm hơn tính bằng color-mix trong CSS)
  const podium = el('div', { class: 'podium' }, ...[1, 0, 2].filter(i => scores[i]).map(i => {
    const s = scores[i]
    const step = el('div', { class: `podium-step p${i + 1}` },
      el('span', { class: 'podium-medal' }, icon(`medal${i + 1}`, { size: i === 0 ? 52 : 44, label: `Hạng ${i + 1}` })))
    step.style.setProperty('--c', s.color)
    return el('div', { class: s.teamId === myTeamId ? 'podium-col me' : 'podium-col' },
      i === 0 ? el('span', { class: 'podium-crown' }, icon('trophy', { size: 30 })) : '',
      el('span', { class: 'podium-mascot' }, mascotIcon(s.mascot, s.color, i === 0 ? 56 : 46)),
      el('b', {}, s.name), el('span', { class: 'podium-score' }, fmt(s.total)), step)
  }))

  // Hạng 1–3: huy chương nhỏ thay cho số
  const rankCell = i => (i < 3 ? icon(`medal${i + 1}`, { size: 26, label: `Hạng ${i + 1}` }) : String(i + 1))
  const row = (s, i) => el('tr', { class: s.teamId === myTeamId ? 'me' : '' },
    el('td', { class: 'rank' }, rankCell(i)),
    el('td', {}, el('span', { class: 'who' }, mascotIcon(s.mascot, s.color, 24), s.name)),
    el('td', { class: 'num' }, String(s.provinces)),
    el('td', { class: 'num' }, fmt(s.base)),
    el('td', { class: 'num' }, signed(s.bonus)),
    el('td', { class: 'num' }, s.collectionBonus ? `+${fmt(s.collectionBonus)}` : '–'),
    el('td', { class: 'num' }, s.crossRegion ? `+${fmt(s.crossRegion)}` : '–'),
    el('td', { class: 'num total' }, fmt(s.total)),
    el('td', { class: 'num' }, fmtTime(s.answerMs)))
  // Bảng là một tấm sticker (khung không tự cuộn → lớp vẽ tay ::before không bị cắt)
  const table = el('div', { class: 'results-board' }, el('table', { class: 'results-table' },
    el('thead', {}, el('tr', {}, ...['#', solo ? 'Lữ khách' : 'Team', solo ? 'Tem' : 'Tỉnh', 'Điểm tỉnh', 'Thưởng/phạt', 'Bộ sưu tập', 'Xuyên 3 miền', 'Tổng', labeled('timer', 'Thời gian')].map(t => el('th', {}, t)))),
    el('tbody', {}, ...scores.map(row))))

  return el('div', { class: 'results' }, head, podium, table,
    el('p', { class: 'hint' }, 'Thưởng/phạt gồm thành chủ nhà mới, đón khách, lễ hội, trừ điểm trả lời chậm và điểm chủ phòng điều chỉnh. Bằng điểm: tổng thời gian trả lời ít hơn xếp trên. Bản đồ phía sau đã hiện màu thật của tất cả các team.'))
}
