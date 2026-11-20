// Màn map đặc biệt của phòng Chạy trạm (stage special / puzzle / done): khung cảnh thời kỳ, 3 câu thời kỳ, câu ghép, về đích.
// Phủ lên bản đồ trong #mapWrap. Dữ liệu từ view.tram (server/game/tram.js teamPublic); thứ tự đúng của mảnh không bao giờ có ở client.
// Trạng thái cục bộ (đáp án đang chọn, hàng mảnh đang xếp) chỉ nằm trên máy này; mỗi người tự xếp.

import { api, formatClock } from '/shared/api.js'
import { sound } from '/shared/sound.js'
import * as fx from '/shared/fx.js'
import { ICON_NAMES, icon, labeled } from '/shared/icons.js'
import { $, button, el } from '/shared/dom.js'
import { act } from './actions.js'
import { closeDialog } from './dialogs.js'
import { toast } from './notify.js'
import { now, state } from './state.js'

const POINTS = 500 // điểm câu thời kỳ (RULES.tram.specialPoints), dùng để hiện "còn bao nhiêu điểm"
const LOCK_S = 20 // nghỉ chân khi sai / hết giờ / bỏ qua (RULES.tram.lockMs)
const HOLD_MS = 5000 // chờ tối đa chừng này cho khung kết quả / câu cũ trước khi chuyển sang map đặc biệt
const EXPIRE_GRACE_MS = 2500 // quá hạn chừng này mà câu còn treo thì tự bỏ qua để sang câu khác

// Tên icon lạ thì dùng icon cuộn giấy (không để lỗi); data:check đã báo tên thiếu từ trước
const sceneIcon = name => (ICON_NAMES.includes(name) ? name : 'scroll')

// Trạng thái cục bộ
const L = {
  pick: null,       // đáp án đang chọn (vị trí trong options)
  qid: null,        // câu đang chọn đáp án
  sending: false,
  result: null,     // kết quả câu vừa trả lời: { correct, points, correctAnswer, explanation, timedOut, skipped }
  lockUntil: 0,     // mốc khóa biết từ phản hồi (SSE về sau cũng gửi lại)
  skipArmedAt: 0,   // bấm "Bỏ qua" lần 1 lúc nào (lần 2 trong 3 giây mới bỏ thật)
  holdSince: 0,     // lúc bắt đầu chờ khung câu / kết quả đóng
  skipRetryAt: 0,   // sau lỗi mạng, đợi tới mốc này mới tự bỏ qua lại
  autoSkip: null,   // câu đã tự bỏ qua vì quá hạn
  order: [],        // câu ghép: các `i` theo thứ tự đã xếp
  pieceSig: '',     // bộ mảnh hiện tại (đổi thì xếp lại từ đầu)
  pMsg: '',         // thông báo sau khi chốt sai
  pLock: 0,
  celebrated: false, // đã bắn pháo hoa ở màn về đích
  v: 0,             // tăng khi đổi trạng thái cục bộ → vẽ lại
  sig: '',
  node: null,
}

const tramView = () => (state.me?.room.mode === 'tram' ? state.me.tram : null)

function safeColor(c) { return /^#[0-9a-f]{6}$/i.test(c ?? '') ? c : '#8a6d3b' }
// Chữ trên nền cảnh: đậm hay sáng tùy độ sáng của màu nền
function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16)
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? '#3C3C3C' : '#FFFFFF'
}

const lockOf = tr => Math.max(L.lockUntil, tr.special.lockedUntil ?? 0)
const puzzleLockOf = tr => Math.max(L.pLock, tr.puzzle?.lockedUntil ?? 0)

// Có nên hiện màn map đặc biệt chưa: đợi hiệu ứng "đúng + key + mảnh" của câu cuối diễn xong và đóng khung kết quả (spec §3.6)
function shown(tr) {
  if (!tr || tr.stage === 'map' || state.me.status !== 'running' || !tr.period) return false
  if (state.answering || state.dialogMode === 'question' || state.dialogMode === 'result') {
    // Chờ hiệu ứng kết quả của máy này diễn xong; nhưng chỉ chờ tối đa HOLD_MS (máy đồng đội có thể còn khung kết quả / câu cũ chưa đóng)
    L.holdSince ||= now()
    if (now() - L.holdSince < HOLD_MS) return false
    state.answering = false
    if (state.dialogMode === 'question' || state.dialogMode === 'result') closeDialog()
  }
  L.holdSince = 0
  return true
}

function ensureNode() {
  if (L.node) return L.node
  L.node = el('div', { class: 'tram-stage', id: 'tramStage', hidden: true })
  $('mapWrap').append(L.node)
  return L.node
}

// ---------- Vẽ ----------
function sceneHead(tr) {
  const p = tr.period
  const marks = Array.from({ length: tr.special.of }, (_, i) => el('li', {
    class: `ts-mark${i < tr.special.done ? ' on' : ''}`,
    'aria-label': `Câu ${i + 1}: ${i < tr.special.done ? 'đã xong' : 'chưa xong'}`,
  }, icon(i < tr.special.done ? 'star' : 'question', { size: '1.5em' })))
  return [
    el('div', { class: 'ts-head' },
      el('span', { class: 'ts-years' }, p.years),
      el('h2', {}, p.name)),
    el('div', { class: 'ts-icons' }, ...(p.scene?.icons ?? []).slice(0, 3).map(n => el('span', { class: 'ts-ic' }, icon(sceneIcon(n), { size: '2.6em' })))),
    p.scene?.blurb ? el('p', { class: 'ts-blurb' }, p.scene.blurb) : '',
    el('ol', { class: 'ts-marks', 'aria-label': `Câu thời kỳ ${tr.special.done}/${tr.special.of}` }, ...marks),
  ]
}

function pointsLeft(q, at) {
  const base = POINTS
  if (at <= q.freeUntil) return base
  return base - Math.round(base * Math.min(1, (at - q.freeUntil) / (q.deadline - q.freeUntil)))
}

function questionPanel(tr, q) {
  if (L.qid !== q.id) { L.qid = q.id; L.pick = null; L.skipArmedAt = 0 }
  const expired = now() > q.deadline
  const opts = q.options.map((text, i) => el('button', {
    type: 'button', class: `btn${L.pick === i ? ' primary' : ''}`, 'data-key': String(i + 1), disabled: L.sending || expired || state.busy,
    'aria-pressed': String(L.pick === i),
    onclick: () => { L.pick = i; L.v++; sound.click(); sync(true) },
  }, el('span', { class: 'key' }, String(i + 1)), text))
  const armed = L.skipArmedAt && now() - L.skipArmedAt < 3000
  return el('section', { class: 'ts-panel' },
    el('div', { class: 'q-head' },
      el('h3', {}, `Câu ${tr.special.done + 1}/${tr.special.of} của thời kỳ`)),
    el('p', { class: 'ts-q' }, q.content),
    el('div', { class: 'options' }, ...opts),
    el('div', { class: 'q-foot' },
      el('span', { class: 'q-timer', id: 'tsTimer' }),
      el('div', { class: 'dialog-actions' },
        button(armed ? 'Bấm lại để bỏ qua' : 'Bỏ qua', '', skip, { disabled: L.sending || expired || state.busy }),
        button('Chốt', 'green commit', () => submitAnswer(q), { disabled: L.pick == null || L.sending || expired || state.busy }))),
    el('p', { class: 'muted ts-note' }, `Cả đội dùng chung một câu: ai chốt trước thì tính cho cả đội. Sai, hết giờ hoặc bỏ qua: nghỉ ${LOCK_S} giây.`))
}

function resultPanel(tr) {
  const r = L.result
  const next = () => {
    L.result = null; L.v++
    const cur = state.me.tram
    if (cur.stage === 'special' && !cur.special.pending && lockOf(cur) <= now()) requestQuestion()
    else sync(true)
  }
  if (r.correct) {
    return el('section', { class: 'ts-panel good' },
      el('h3', {}, 'Chính xác!'),
      el('p', { class: 'reward' }, labeled('star', `+${r.points} điểm`)),
      el('p', { class: 'answer' }, `Đáp án: ${r.correctAnswer}`),
      r.explanation ? el('p', { class: 'explain' }, r.explanation) : '',
      el('div', { class: 'dialog-actions' }, button(r.stage === 'puzzle' ? 'Sang câu ghép' : 'Câu tiếp theo', 'green', next)))
  }
  return el('section', { class: 'ts-panel warn' },
    el('h3', {}, r.timedOut ? 'Hết giờ' : r.skipped ? 'Đã bỏ qua' : 'Chưa đúng'),
    el('p', { class: 'explain' }, `Cả đội nghỉ ${LOCK_S} giây rồi nhận câu khác.`),
    el('p', { class: 'ts-lock', id: 'tsLock' }),
    el('div', { class: 'dialog-actions' }, button('Nhận câu hỏi', 'green', () => { L.result = null; L.v++; sync(true) }, { disabled: lockOf(tr) > now() })))
}

function askPanel(tr) {
  const left = lockOf(tr) - now()
  return el('section', { class: 'ts-panel' },
    el('h3', {}, `Câu thời kỳ ${Math.min(tr.special.done + 1, tr.special.of)}/${tr.special.of}`),
    el('p', { class: 'explain' }, 'Trả lời đúng cả 3 câu để mở câu ghép cuối cùng.'),
    left > 0 ? el('p', { class: 'ts-lock', id: 'tsLock' }) : '',
    el('div', { class: 'dialog-actions' }, button(labeled('question', 'Nhận câu hỏi'), 'green', requestQuestion, { disabled: left > 0 || state.busy })))
}

function puzzlePanel(tr) {
  const pz = tr.puzzle, byI = new Map(pz.pieces.map(p => [p.i, p.text]))
  const sig = pz.pieces.map(p => `${p.i}:${p.text}`).join('|')
  if (sig !== L.pieceSig) { L.pieceSig = sig; L.order = []; L.pMsg = '' }
  const left = puzzleLockOf(tr) - now()
  const full = pz.pieces.length > 0 && L.order.length === pz.pieces.length
  const rowBtns = L.order.map((i, n) => el('li', {}, el('button', {
    type: 'button', class: 'btn piece in-row', title: 'Bấm để gỡ khỏi hàng', disabled: L.sending,
    onclick: () => { L.order = L.order.filter(x => x !== i); L.pMsg = ''; L.v++; sound.click(); sync(true) },
  }, el('span', { class: 'key' }, String(n + 1)), byI.get(i))))
  const pool = pz.pieces.filter(p => !L.order.includes(p.i)).map(p => el('li', {}, el('button', {
    type: 'button', class: 'btn piece', disabled: L.sending,
    onclick: () => { L.order = [...L.order, p.i]; L.pMsg = ''; L.v++; sound.click(); sync(true) },
  }, p.text)))
  return el('section', { class: 'ts-panel' },
    el('h3', {}, labeled('key', 'Ghép các mảnh key thành câu đúng')),
    el('p', { class: 'explain' }, 'Bấm lần lượt các mảnh để xếp vào hàng trả lời, bấm mảnh trong hàng để gỡ ra. Mỗi người xếp trên máy mình.'),
    el('ol', { class: 'ts-row', id: 'tsRow', 'aria-label': 'Hàng trả lời' },
      ...(rowBtns.length ? rowBtns : [el('li', { class: 'ts-row-empty' }, 'Chưa xếp mảnh nào')])),
    el('ul', { class: 'ts-pool', 'aria-label': 'Các mảnh còn lại' }, ...pool),
    L.pMsg ? el('p', { class: 'ts-msg', role: 'status' }, L.pMsg) : '',
    el('div', { class: 'dialog-actions' },
      button('Xếp lại', '', () => { L.order = []; L.pMsg = ''; L.v++; sync(true) }, { disabled: !L.order.length || L.sending }),
      button(left > 0 ? `Chốt (chờ ${formatClock(left)})` : 'Chốt', 'green commit', submitPuzzle, { id: 'tsCommit', disabled: !full || left > 0 || L.sending || state.busy })))
}

function donePanel(tr) {
  return el('section', { class: 'ts-panel good ts-done' },
    el('h3', {}, labeled('star-hope', 'Về đích!')),
    el('p', { class: 'explain' }, `Đội bạn đã hoàn thành hành trình ${tr.period.name}.`),
    el('p', { class: 'reward ts-bonus' }, labeled('star', `+${tr.finishBonus} điểm thưởng về đích`)),
    el('p', { class: 'muted' }, 'Chờ hết giờ để xem xếp hạng.'))
}

function bodyFor(tr) {
  if (tr.stage === 'done') return donePanel(tr)
  if (tr.stage === 'puzzle' && !L.result) return puzzlePanel(tr)
  if (L.result) return resultPanel(tr)
  if (tr.special.pending) return questionPanel(tr, tr.special.pending)
  return askPanel(tr)
}

// Vẽ lại khi dữ liệu đổi (force: vừa đổi trạng thái cục bộ). Gọi từ renderTram và mỗi nhịp 250 ms
export function syncTramMap(force = false) {
  const node = ensureNode()
  const tr = tramView()
  if (!shown(tr)) { node.hidden = true; return }
  const t = now(), p = tr.special.pending
  const sig = JSON.stringify([tr.stage, tr.special.done, p?.id, lockOf(tr) > t, p ? t > p.deadline : 0, puzzleLockOf(tr) > t,
    L.v, L.result ? 1 : 0, tr.puzzle?.pieces.map(x => x.i), tr.period.id, tr.finishBonus, L.skipArmedAt && t - L.skipArmedAt < 3000, state.busy])
  if (force || sig !== L.sig || node.hidden) {
    L.sig = sig
    const wasHidden = node.hidden
    node.hidden = false
    node.style.setProperty('--scene', safeColor(tr.period.scene?.color))
    node.style.setProperty('--scene-ink', inkOn(safeColor(tr.period.scene?.color)))
    node.replaceChildren(...sceneHead(tr), bodyFor(tr))
    if (wasHidden && !fx.reducedMotion) fx.anim(node, [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: 'ease-out' })
  }
  tickTexts(tr)
  if (tr.stage === 'done' && !L.celebrated) {
    L.celebrated = true
    sound.correct()
    if (!fx.reducedMotion) setTimeout(() => { const r = node.getBoundingClientRect(); fx.confetti(node, r.width / 2, r.height * 0.3) }, 200)
  }
  // Đồng đội trả lời trước (câu biến mất mà mình chưa có kết quả): báo nhẹ
  if (!p && L.qid && !L.result && !L.sending) {
    L.qid = null
    toast('Đồng đội đã trả lời câu này trước bạn')
  }
  // Câu quá hạn mà vẫn còn treo (server không tự xóa): tự bỏ qua để cả đội sang câu khác
  if (p && t > p.deadline + EXPIRE_GRACE_MS && L.autoSkip !== p.id && now() >= L.skipRetryAt && !state.busy && !L.sending) {
    L.autoSkip = p.id
    skip(true)
  }
}

// Chữ đếm lùi cập nhật tại chỗ (không dựng lại nút)
function tickTexts(tr) {
  const t = now(), p = tr.special.pending
  const timer = $('tsTimer')
  if (timer && p) {
    const at = Math.max(p.issuedAt, t), left = p.deadline - at
    timer.replaceChildren(labeled('timer', left > 0
      ? `${formatClock(left)} · còn ${pointsLeft(p, at)} điểm${at < p.freeUntil ? ` (đủ điểm thêm ${formatClock(p.freeUntil - at)})` : ''}`
      : 'Hết giờ!'))
    timer.classList.toggle('late', at >= p.freeUntil)
  }
  const lock = $('tsLock')
  if (lock) lock.textContent = lockOf(tr) > t ? `Nghỉ chân: còn ${formatClock(lockOf(tr) - t)}` : ''
  const commit = $('tsCommit')
  if (commit && tr.puzzle) {
    const left = puzzleLockOf(tr) - t
    commit.textContent = left > 0 ? `Chốt (chờ ${formatClock(left)})` : 'Chốt'
  }
}
export const tickTramMap = () => syncTramMap(false)
const sync = syncTramMap

// ---------- Thao tác ----------
// Nhận câu kế (hoặc lấy lại câu đang chờ); ghi ngay vào view để vẽ, SSE xác nhận lại cho cả đội
function requestQuestion() {
  act(async () => {
    try {
      const q = await api('/api/tram/special', {})
      if (q.id === undefined) { // câu cũ đã quá hạn: server xử như hết giờ và khóa — chỉ ghi khóa, SSE cập nhật
        if (state.me?.tram) { state.me.tram.special.pending = null; if (q.lockedUntil) state.me.tram.special.lockedUntil = q.lockedUntil }
        sync(true)
        return
      }
      if (state.me?.tram) state.me.tram.special.pending = q
      sound.click()
      sync(true)
    } catch (err) {
      if (err.code === 'locked' || err.code === 'wrong-stage') { toast(err.message, true, 'timer'); return }
      throw err
    }
  })
}

function submitAnswer(q) {
  if (L.pick == null || L.sending || state.busy) return
  const pick = L.pick
  L.sending = true; L.v++; sync(true)
  act(async () => {
    try {
      const r = await api('/api/tram/special-answer', { questionId: q.id, answer: pick })
      L.sending = false
      afterAnswer(r)
    } catch (err) {
      L.sending = false
      L.v++
      if (err.code === 'no-pending') { toast('Đồng đội đã trả lời câu này trước bạn'); L.qid = null; return }
      throw err
    } finally { sync(true) }
  })
}

// Kết quả câu của mình (đáp án đúng chỉ có khi trả lời đúng; sai thì không lộ)
function afterAnswer(r) {
  const tr = state.me.tram
  L.result = r
  L.pick = null; L.qid = null
  if (r.correct) {
    sound.correct()
    tr.special.pending = null
    tr.special.done = r.done ?? tr.special.done + 1 // SSE có thể đã cập nhật trước phản hồi → không cộng hai lần
  } else {
    sound.wrong()
    L.lockUntil = r.lockedUntil ?? 0
    tr.special.pending = null
    if (r.lockedUntil) tr.special.lockedUntil = r.lockedUntil
    toast((r.timedOut ? 'Hết giờ — tính là trả lời sai' : r.skipped ? `Đã bỏ qua — cả đội nghỉ ${LOCK_S} giây` : `Chưa đúng — cả đội nghỉ ${LOCK_S} giây`), true, r.timedOut ? 'timer' : '')
  }
  if (r.stage && r.stage !== tr.stage) { tr.stage = r.stage; if (r.stage === 'puzzle') tr.puzzle ??= { pieces: [], lockedUntil: null } }
  L.v++
}

// Bỏ qua: bấm hai lần trong 3 giây (auto = câu quá hạn, tự bỏ qua không cần bấm hai lần)
function skip(auto = false) {
  if (!auto && !(L.skipArmedAt && now() - L.skipArmedAt < 3000)) {
    L.skipArmedAt = now(); L.v++; sync(true)
    setTimeout(() => sync(false), 3100)
    return
  }
  if (state.busy) return
  L.skipArmedAt = 0
  const qid = state.me?.tram?.special.pending?.id
  if (!qid) return
  L.sending = true; L.v++
  act(async () => {
    try {
      const r = await api('/api/tram/special-skip', { questionId: qid })
      L.sending = false
      afterAnswer({ ...r, skipped: !auto, timedOut: auto })
    } catch (err) {
      L.sending = false; L.v++
      if (err.code !== 'no-pending') { if (auto) { L.autoSkip = null; L.skipRetryAt = now() + 3000 } throw err } // lỗi khác: nhịp sau thử lại; no-pending = đồng đội xử trước, SSE cập nhật
    } finally { sync(true) }
  })
}

function submitPuzzle() {
  const tr = state.me?.tram
  if (!tr?.puzzle || L.sending || state.busy || !tr.puzzle.pieces.length || L.order.length !== tr.puzzle.pieces.length) return
  L.sending = true; L.v++; sync(true)
  act(async () => {
    try {
      const r = await api('/api/tram/puzzle', { order: L.order })
      L.sending = false
      if (r.correct) {
        sound.correct()
        tr.stage = 'done'; tr.finishBonus = r.finishBonus; tr.puzzle = null
      } else {
        sound.wrong()
        L.pLock = r.lockedUntil ?? 0
        L.pMsg = `Chưa đúng — thử sắp lại thứ tự. Cả đội nghỉ ${LOCK_S} giây trước khi chốt tiếp.`
        const row = $('tsRow')
        if (row && !fx.reducedMotion) fx.shakeX(row)
      }
    } catch (err) {
      L.sending = false
      if (err.code === 'locked') { L.pMsg = 'Cả đội còn đang nghỉ chân, chờ một chút rồi chốt lại.' ; return }
      if (err.code === 'already-done') { L.pMsg = ''; return }
      throw err
    } finally { L.v++; sync(true) }
  })
}

// Bàn phím: 1–4 chọn đáp án, Enter chốt (không chen vào ô nhập / nút đang focus)
document.addEventListener('keydown', e => {
  const node = L.node, tr = tramView()
  if (!node || node.hidden || !tr || e.ctrlKey || e.metaKey || e.altKey || $('cover')?.hidden === false) return
  if (e.target.matches?.('input, textarea, select') || state.dialogMode) return
  if (/^[1-9]$/.test(e.key)) {
    const b = node.querySelector(`.options button[data-key="${e.key}"]`)
    if (b && !b.disabled) { e.preventDefault(); b.click() }
  } else if (e.key === 'Enter' && !e.target.matches?.('button')) {
    const b = node.querySelector('.btn.commit')
    if (b && !b.disabled) { e.preventDefault(); b.click() }
  }
})
