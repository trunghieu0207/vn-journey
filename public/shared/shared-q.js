// Câu hỏi chung cả phòng: khung dùng chung cho màn team, màn chiếu và trang chủ phòng.
// Trước khi công bố: câu + lựa chọn + số người đã chọn. Sau khi công bố: tỉ lệ chọn từng đáp án, đáp án đúng, lời giải.
// Server chỉ gửi số đếm gộp (không ai chọn gì, không theo team).

import { el } from './dom.js'
import { labeled } from './icons.js'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/** sh: dữ liệu `shared` từ server. opts: provinceName; mine: chỉ số mình đã chọn (màn team); onPick(i): bấm chọn (null = chỉ xem) */
export function sharedPanel(sh, { provinceName = '', mine = null, onPick = null } = {}) {
  const r = sh.result
  const live = onPick && !r
  const options = el('div', { class: 'sq-options' }, ...sh.options.map((text, i) => {
    const cls = ['sq-opt', mine === i && 'mine', r && i === r.correct && 'right'].filter(Boolean).join(' ')
    const row = live
      ? el('button', { type: 'button', class: cls, 'data-key': String(i + 1), onclick: () => onPick(i) })
      : el('div', { class: cls })
    row.append(el('span', { class: 'sq-letter' }, LETTERS[i]), el('span', { class: 'sq-text' }, text))
    if (r) {
      const pct = r.voters ? Math.round(r.counts[i] * 100 / r.voters) : 0
      const bar = el('span', { class: 'sq-bar' })
      bar.style.width = `${pct}%`
      row.prepend(bar)
      if (mine === i) row.append(el('span', { class: 'sq-you' }, 'Bạn chọn'))
      row.append(el('span', { class: 'sq-pct' }, `${pct}%`))
    }
    return row
  }))

  const summary = !r
    ? el('p', { class: 'sq-hint' }, `Cả phòng cùng chọn — cứ bàn với mọi người xung quanh, kể cả team khác. Cả phòng đúng từ ${sh.passPct}% → mọi team +${sh.reward} điểm.`)
    : el('p', { class: r.passed ? 'sq-summary pass' : 'sq-summary' }, !r.voters
      ? 'Chưa ai chọn đáp án.'
      : r.passed
        ? `Cả phòng đúng ${r.pct}% — mọi team +${r.bonus} điểm!`
        : `Cả phòng đúng ${r.pct}% (cần ${sh.passPct}%) — lần sau nhé!`)

  return el('div', { class: r ? 'sq revealed' : 'sq' },
    el('div', { class: 'sq-head' },
      el('span', { class: 'tag sq-tag' }, labeled('question', 'Câu hỏi chung cả phòng')),
      provinceName ? el('span', { class: 'sq-where' }, provinceName) : '',
      el('span', { class: 'sq-timer' })),
    summary,
    el('p', { class: 'sq-text-main' }, sh.content),
    options,
    r
      ? el('div', { class: 'sq-explain' }, el('b', {}, `Đáp án: ${r.answer}. `), r.explanation ?? '')
      : el('p', { class: 'sq-count' }, `${sh.voted}/${sh.players} người đã chọn`),
  )
}

// Đồng hồ trong khung (gọi định kỳ): còn bao nhiêu giây / đã công bố
export function sharedTick(root, sh, t) {
  const timer = root.querySelector('.sq-timer')
  if (!timer) return
  const left = Math.max(0, Math.ceil((sh.until - t) / 1000))
  timer.textContent = sh.result ? 'Đã công bố' : left ? `${left} giây` : 'Đang công bố…'
  timer.classList.toggle('late', !sh.result && left <= 5)
}
