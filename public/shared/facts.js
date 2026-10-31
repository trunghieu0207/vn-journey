// Sảnh chờ "Bạn có biết?" (màn chiếu + máy người chơi lúc chờ bắt đầu): mỗi câu factMs, nửa đầu chỉ có câu hỏi
// (cả phòng đoán thử), nửa sau hiện đáp án + lời giải. Mọi máy theo cùng giờ server nên cùng hiện một câu.

import { el } from './dom.js'
import { labeled } from './icons.js'

/** Câu đang hiện lúc t: { i, fact, revealed } (null nếu không có câu nào) */
export function factAt(facts, factMs, t) {
  if (!facts?.length) return null
  const slot = Math.floor(t / factMs)
  return { i: slot % facts.length, slot, fact: facts[slot % facts.length], revealed: t % factMs >= factMs / 2 }
}

export function factCard(fact, provinceName) {
  return el('div', { class: 'fact' },
    el('div', { class: 'fact-head' },
      el('span', { class: 'fact-tag' }, labeled('question', 'Bạn có biết?')),
      el('span', { class: 'fact-where' }, provinceName)),
    el('p', { class: 'fact-q' }, fact.content),
    el('div', { class: 'fact-a' }, el('b', {}, `Đáp án: ${fact.answer}. `), fact.explanation ?? ''),
    el('p', { class: 'fact-wait' }, 'Đoán thử xem — đáp án hiện sau vài giây'))
}

// Vẽ câu đang hiện vào box (chỉ dựng lại khi sang câu mới). Trả về true nếu vừa sang câu mới
export function renderFact(box, facts, factMs, t, nameOf) {
  const cur = factAt(facts, factMs, t)
  box.hidden = !cur
  if (!cur) {
    box.dataset.slot = ''
    return false
  }
  const fresh = box.dataset.slot !== String(cur.slot)
  if (fresh) {
    box.dataset.slot = String(cur.slot)
    box.replaceChildren(factCard(cur.fact, nameOf(cur.fact.province)))
  }
  box.classList.toggle('revealed', cur.revealed)
  return fresh
}
