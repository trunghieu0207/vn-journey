// Màn team: vẽ bản đồ theo trạng thái, cột bên phải, lớp phủ, đồng hồ (tự vẽ lại khi hết khóa / hết sự kiện).

import { formatClock } from '/shared/api.js'
import { REGION_NAME } from '/shared/map.js'
import { eventLabel } from '/shared/events.js'
import { renderFact } from '/shared/facts.js'
import { mascotIcon } from '/shared/mascots.js'
import { labeled } from '/shared/icons.js'
import { $, button, el } from '/shared/dom.js'
import { moveTo, reopenPending, retryHere, updateSiegeChoice } from './actions.js'
import { openCard } from './cards.js'
import { renderHost } from './host.js'
import { renderJournal, toast } from './notify.js'
import { openSiegeBet, updateBetTimer } from './siege-bet.js'
import { CARD_INFO, canMove, compactRoom, hasPending, hostBtnWhere, isHost, locked, nameOf, now, reachable, running, scoutActive, solo, state, stormRegion } from './state.js'

function mapView() {
  // Phòng đơn sau khi kết thúc: chỉ tô các tỉnh mình có tem, không còn sương mù
  if (state.final && solo()) {
    const tiles = Object.fromEntries(state.me.mine.map(m => [m.province, { owner: 'mine', color: state.me.team.color }]))
    return { current: state.me.current, color: state.me.team.color, trail: state.me.trail, tiles, homes: homePins() }
  }
  if (state.final) {
    // Sau khi kết thúc: hiện màu thật của mọi team, không còn sương mù
    const tiles = {}
    for (const [id, teamId] of state.final.owners) {
      tiles[id] = teamId === state.me.team.id
        ? { owner: 'mine', color: state.me.team.color }
        : { owner: 'owned', color: state.final.teams.get(teamId)?.color }
    }
    return { current: state.me.current, color: state.me.team.color, trail: state.me.trail, tiles, homes: homePins() }
  }
  const reach = reachable()
  const storm = stormRegion()
  const shields = new Map(state.me.mine.map(m => [m.province, m.shieldUntil && m.shieldUntil > now()]))
  const tiles = {}
  for (const p of state.map.byId.values()) {
    const k = state.me.known[p.id]
    const scouted = scoutActive() && p.region === state.scout.region
    const t = {}
    if (k === 'mine') Object.assign(t, { owner: 'mine', color: state.me.team.color, shielded: shields.get(p.id) })
    else if (k === 'taken' || (scouted && state.scout.revealed.has(p.id))) t.owner = 'taken'
    t.scouted = scouted
    t.blocked = reach.has(p.id) && storm === p.region
    t.neighbor = reach.has(p.id) && canMove()
    t.fog = !(k || p.id === state.me.current || reach.has(p.id) || scouted)
    tiles[p.id] = t
  }
  return {
    current: state.me.current,
    color: state.me.team.color,
    trail: state.me.trail,
    tiles,
    storm,
    festival: state.me.event?.kind === 'festival' && state.me.event.until > now() ? state.me.event.region : null,
    homes: homePins(),
    notes: solo() ? stampNotes() : null,
  }
}

// Phòng đơn: dưới tên tỉnh đã ghé (hoặc đang vén bằng ống nhòm) ghi số người đã có tem, thay cho dòng điểm (điểm vẫn có trong khung rê chuột)
function stampNotes() {
  const scouted = scoutActive() && state.scout.counts
  const notes = {}
  for (const p of state.map.byId.values()) {
    const n = state.me.stampCounts?.[p.id] ?? (scouted && p.region === state.scout.region ? state.scout.counts[p.id] ?? 0 : null)
    if (n != null) notes[p.id] = n ? `${n} người` : 'chưa ai'
  }
  return notes
}

// Về quê: tỉnh quê của thành viên team (server chỉ gửi cho chính team)
const homeNames = id => state.me.members.filter(m => m.home === id).map(m => m.name)
function homePins() {
  const done = new Set(state.me.homes?.done)
  const full = done.size >= (state.me.homes?.max ?? Infinity)
  return [...new Set(state.me.members.map(m => m.home).filter(Boolean))]
    .map(id => ({ province: id, done: done.has(id), capped: full && !done.has(id) }))
}
function homeTip(id) {
  const names = state.me ? homeNames(id) : []
  if (!names.length) return []
  const h = state.me.homes, who = names.join(', ')
  if (h.done.includes(id)) return [[`Đã về quê ${who} (+${h.bonus})`, false, 'home']]
  if (solo()) return [[`Quê bạn · có tem được +${h.bonus}`, false, 'home']]
  if (h.done.length >= h.max) return [[`Quê ${who} · team đã đủ ${h.max} tỉnh Về quê`, true, 'home']]
  return [[`Quê ${who} · cắm cờ được +${h.bonus}`, false, 'home']]
}

// Phòng đơn: tem của mình (Tiên phong) + số người đã có tem (tỉnh đã ghé / đang vén bằng ống nhòm)
function soloTip(id) {
  const st = state.me.stamps?.find(s => s.province === id)
  const scouted = scoutActive() && state.scout.counts && state.map.byId.get(id)?.region === state.scout.region
  const n = state.me.stampCounts?.[id] ?? (scouted ? state.scout.counts[id] ?? 0 : null)
  const lines = []
  if (st) lines.push([st.first ? 'Bạn có tem Tiên phong' : 'Bạn đã có tem', false, st.first ? 'star' : 'flag', state.me.team.color])
  else if (state.me.known[id] || scouted) lines.push(['Chưa có tem', true])
  if (n != null) lines.push([n ? `${n} người trong phòng đã có tem` : 'Chưa ai có tem — tới trước được Tiên phong', true])
  return [...lines, ...homeTip(id)]
}

export function tipExtra(id) {
  if (state.me && solo()) return soloTip(id)
  if (state.final) {
    const t = state.final.teams.get(state.final.owners.get(id))
    return [t ? [t.name, false, 'flag', t.color] : ['Chưa ai cắm cờ', true], ...homeTip(id)]
  }
  const k = state.me?.known[id]
  const own = k === 'mine' ? [['Tỉnh của đội bạn', false, 'flag', state.me.team.color]]
    : k === 'taken' ? [['Đã có chủ (không rõ đội nào)', false, 'flag-unknown']]
    : k === 'free' ? [['Còn trống', true]] : []
  return [...own, ...homeTip(id)]
}

// ---------- Vẽ giao diện ----------
export function renderAll() {
  if (!state.me || !state.map) return
  if ($('teamChip').dataset.mascot !== state.me.team.mascot) {
    $('teamChip').dataset.mascot = state.me.team.mascot
    $('teamChip').replaceChildren(mascotIcon(state.me.team.mascot, state.me.team.color, 32))
  }
  $('teamName').textContent = state.me.team.name
  $('score').textContent = (state.me.score?.total ?? 0).toLocaleString('vi-VN')
  $('provCount').textContent = String(state.me.score?.provinces ?? 0)
  // Phòng đơn: tem thay cho tỉnh, hạng của mình (màn chiếu chỉ có top 10), sổ tay thay cho danh sách thành viên
  const one = solo()
  $('provLabel').textContent = one ? `/${state.map.byId.size} tem` : 'tỉnh'
  $('rankBox').hidden = !one || !state.me.rank?.rank || state.me.status === 'waiting'
  if (one && state.me.rank) {
    $('rank').textContent = String(state.me.rank.rank)
    $('rankOf').textContent = `/${state.me.rank.of}`
  }
  $('membersCard').hidden = one
  $('journeyCard').hidden = !one
  $('teamTabLabel').textContent = one ? 'Sổ tay' : 'Đội' // thanh tab dưới (điện thoại)
  if (one) {
    const firsts = state.me.stamps?.filter(s => s.first).length ?? 0
    $('journeyText').textContent = `${state.me.stamps?.length ?? 0} tem${firsts ? ` · ${firsts} tem Tiên phong` : ''}. Mỗi tem kèm điều bạn đã học.`
  }
  $('cardsEmpty').textContent = one ? 'Nhận tem ở thành phố trực thuộc TW để nhận thẻ.' : 'Cắm cờ ở thành phố trực thuộc TW để nhận thẻ.'
  // Team gọn: không thẻ bài — ẩn khay thẻ (cả tab dưới trên điện thoại)
  const noCards = compactRoom()
  document.querySelector('.card.cards').hidden = noCards
  document.querySelector('#tabbar [data-tab="cards"]').hidden = noCards
  // Chuỗi đúng: cứ 3 câu liên tiếp nhận 1 thẻ trợ giúp (Team gọn: +50 điểm)
  const streak = state.me.streak ?? 0
  $('streakBox').hidden = !streak
  $('streak').textContent = String(streak)
  $('streakBox').title = `${streak} câu đúng liên tiếp — còn ${3 - (streak % 3)} câu nữa ${noCards ? 'được +50 điểm' : 'nhận thẻ trợ giúp'}. Sai, hết giờ hoặc bỏ qua thì về 0`
  $('roomInfo').textContent = `${state.me.room.name} · ${state.me.room.code}`
  $('memberCount').textContent = `· ${state.me.members.length}`
  $('members').replaceChildren(...state.me.members.map(m =>
    el('li', m.id === state.me.me?.id ? { class: 'self' } : {}, m.name, m.id === state.me.me?.id ? ' (bạn)' : '',
      m.home ? el('span', { class: 'home' }, ` · ${nameOf(m.home)}`) : '')))
  const homes = homePins()
  $('homeBox').hidden = !homes.length
  $('homeN').textContent = String(state.me.homes?.done.length ?? 0)
  $('homeMax').textContent = `/${state.me.homes?.max ?? 3} về quê`
  $('homeBox').title = one ? `Có tem ở tỉnh quê của bạn: +${state.me.homes?.bonus} điểm` : `Cắm cờ ở tỉnh quê của đồng đội: +${state.me.homes?.bonus} điểm, tối đa ${state.me.homes?.max} tỉnh`
  $('logoutBtn').textContent = state.me.status === 'waiting' ? (one ? 'Rời phòng' : 'Đổi team / rời phòng') : 'Thoát'
  state.map.render(mapView())
  renderSide()
  renderOverlay()
  renderTimers()
  renderHost()
}

export function renderSide() {
  $('endCard').hidden = state.me.status !== 'ended'
  if (state.final) {
    const rank = state.final.data.scores.findIndex(s => s.teamId === state.me.team.id) + 1
    $('endText').textContent = `${solo() ? 'Bạn' : state.me.team.name} xếp hạng ${rank}/${state.final.data.scores.length}`
  }
  const cur = state.me.current ? state.map.byId.get(state.me.current) : null
  const k = state.me.current ? state.me.known[state.me.current] : null
  $('where').textContent = cur ? cur.name : '—'
  const n = state.me.stampCounts?.[state.me.current]
  $('whereInfo').textContent = !cur ? 'Chờ chủ phòng bắt đầu trận đấu'
    : solo() ? `${REGION_NAME[cur.region]} · ${cur.points} điểm · ${k === 'mine' ? 'bạn đã có tem' : 'chưa có tem'}${n ? ` · ${n} người đã có tem` : ''}`
    : k === 'mine' ? `Tỉnh của đội bạn · ${cur.points} điểm`
    : k === 'taken' ? `${REGION_NAME[cur.region]} · ${cur.points} điểm`
    : `${REGION_NAME[cur.region]} · ${cur.points} điểm · còn trống`

  const siegeOpen = k === 'taken' && running() && !state.me.pendingQuestion
  $('siegeBox').hidden = !siegeOpen
  const wait = siegeWait()
  $('siegeBtn').disabled = state.busy || locked() || !!wait
  $('siegeBtn').title = wait
  $('retreatBtn').disabled = state.busy || locked() || !state.me.canRetreat

  const reach = [...reachable()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'vi'))
  const storm = stormRegion()
  $('reachTitle').replaceChildren(state.me.marchReady
    ? labeled('march', 'Xe tốc hành: lượt này đi xa được 2 tỉnh')
    : 'Có thể đi (bấm tỉnh viền đậm trên bản đồ):')
  if (hasPending() && state.me.siegeBet && !state.me.pendingQuestion) {
    // Vừa bấm Thử tài: đang cược số hiệp
    $('reachTitle').textContent = `${solo() ? 'Bạn' : 'Team'} đang cược số hiệp thử tài ở ${nameOf(state.me.siegeBet.province)}`
    $('neighbors').replaceChildren(button(labeled('siege', 'Mở lại khung cược'), 'green', () => openSiegeBet(state.me.siegeBet, 'att'), { disabled: state.busy }))
    return renderCards()
  }
  if (hasPending()) {
    const at = nameOf(state.me.pendingQuestion?.province ?? state.me.choosing?.province)
    const what = state.me.choosing?.topics.length ? 'chủ đề' : 'mức cược'
    const who = solo() ? 'Bạn' : 'Team'
    $('reachTitle').textContent = state.me.choosing ? `${who} đang chọn ${what} câu hỏi ở ${at}` : `${who} đang có câu hỏi ở ${at}`
    $('neighbors').replaceChildren(button(state.me.choosing ? labeled('target', `Mở lại khung chọn ${what}`) : labeled('question', 'Mở lại câu hỏi'), 'green', reopenPending, { disabled: state.busy }))
    return renderCards()
  }
  // Vừa trả lời sai ở tỉnh còn trống: hết khóa thì trả lời lại câu khác ngay tại đây, hoặc đi tỉnh khác.
  // Phòng nhiều câu/tỉnh đang có tiến độ: cùng nút, nhận câu tiếp theo
  const pr = state.me.progress
  const retry = state.me.canRetry && cur
    ? [button(labeled('question', pr ? `Câu tiếp theo ở ${cur.name} (${pr.done + 1}/${pr.of})` : `Trả lời lại ở ${cur.name}`), 'green', retryHere,
      { disabled: state.busy || !canMove(), title: pr ? `Đã đúng ${pr.done}/${pr.of} câu — đủ ${pr.of} câu mới ${solo() ? 'nhận tem' : 'cắm cờ'}` : 'Nhận câu hỏi khác ở tỉnh đang đứng' })]
    : []
  $('neighbors').replaceChildren(...retry, ...reach.map(id => {
    const p = state.map.byId.get(id)
    const blocked = storm === p.region
    return button(blocked ? labeled('storm', p.name) : p.name, '', () => moveTo(id), {
      disabled: state.busy || blocked || !canMove(),
      title: blocked ? 'Đang có bão' : `${p.points} điểm`,
    })
  }))

  renderCards()
}

function renderCards() {
  $('cards').replaceChildren(...state.me.cards.map(c => {
    const info = CARD_INFO[c.kind]
    return button(labeled(info.icon, info.name), '', () => openCard(c), { disabled: state.busy || !running(), title: info.hint })
  }))
  $('cardsEmpty').hidden = state.me.cards.length > 0
  $('cardBadge').textContent = String(state.me.cards.length) // số thẻ trên thanh tab dưới (điện thoại)
  $('cardBadge').hidden = !state.me.cards.length
  renderJournal()
}

// Tỉnh của đội khác tạm chưa công thành được → câu giải thích (rỗng = công thành được). b: { blocked, until } từ server
export function siegeWaitText(b = {}) {
  if (b.blocked === 'calm' && b.until > now()) return `Chủ nhà vừa tiếp một đoàn khách — chờ ${Math.ceil((b.until - now()) / 1000)} giây nữa mới ghé thăm thử tài được`
  if (b.blocked === 'besieged') return 'Một đoàn khách khác đang thử tài ở tỉnh này — chờ một chút'
  return ''
}
const siegeWait = () => siegeWaitText(state.me.siegeBlock)

function renderOverlay() {
  const s = state.me.status
  let title = '', text = '', calm = true
  if (s === 'waiting' && isHost()) [title, text] = ['Bạn là chủ phòng', `Bấm "Chủ phòng" (${hostBtnWhere()}) để bắt đầu trận khi mọi người đã vào. Bạn vẫn chơi như mọi người.`]
  else if (s === 'waiting') [title, text] = ['Chờ chủ phòng bắt đầu…', solo()
    ? `${state.me.room.name} · phòng chơi đơn: mỗi người một hành trình, sưu tầm tem các tỉnh. Bản đồ sẽ mở khi trận đấu bắt đầu.`
    : `${state.me.room.name} · ${state.me.members.length} người trong ${state.me.team.name}. Bản đồ sẽ mở khi trận đấu bắt đầu.`]
  else if (s === 'paused') [title, text] = state.me.shared ? ['Câu hỏi chung cả phòng', 'Trận tạm dừng trong lúc cả phòng cùng trả lời'] : ['Tạm dừng', 'Chủ phòng đang tạm dừng trận đấu']
  else if (s === 'ended' && !state.final) [title, text] = ['Hết giờ!', 'Đang tổng kết…']
  // Team gọn tắt Đấu: đã đi đủ cả nước — không còn tỉnh nào để đi, chờ các đội khác
  else if (state.me.finished) [title, text] = ['Về đích!', `${state.me.team.name} đã đi đủ ${state.map.byId.size} tỉnh: +${state.me.finished.bonus.toLocaleString('vi-VN')} điểm về đích. Chờ các đội khác về đích hoặc hết giờ.`]
  // holdLock: đang diễn cảnh "bị đẩy lui" trên tỉnh — chưa phủ màn khóa lên bản đồ
  else if (locked() && !state.holdLock) [title, text, calm] = ['Nghỉ chân', state.me.lastResult?.repelled
    ? 'Chủ nhà trả lời đúng trước — chờ hết thời gian để chơi tiếp'
    : state.me.canRetry
      ? `Trả lời sai — nghỉ xong thì trả lời lại câu khác ở đây hoặc đi tỉnh khác${state.me.progress ? ` (vẫn giữ ${state.me.progress.done}/${state.me.progress.of} câu đã đúng)` : ''}`
      : 'Trả lời sai — chờ hết thời gian để chơi tiếp', false]
  // Phòng có sẵn: đủ 2 người mà chủ phòng chưa bấm Bắt đầu → server tự bắt đầu (housekeeping.js)
  if (s === 'waiting' && state.me.autoStartAt) text += ` Trận tự bắt đầu sau ${formatClock(state.me.autoStartAt - now())} nếu chủ phòng chưa bấm.`
  $('overlay').hidden = !title
  $('overlay').classList.toggle('calm', calm)
  $('ovTitle').textContent = title
  $('ovText').textContent = text
  $('ovBig').hidden = calm
}

// Team gọn: thưởng nhanh còn nhận được nếu đúng lúc `at` (cùng công thức với server: giảm đều từ 100% điểm tỉnh về 0 lúc hết giờ)
function speedLeft(q, at) {
  const points = q.worth ?? state.map.byId.get(q.province).points
  return Math.round(points * Math.min(1, Math.max(0, (q.deadline - at) / (q.deadline - q.issuedAt))))
}

// Điểm tỉnh còn nhận được nếu trả lời đúng lúc `at` (cùng công thức với server: trừ dần sau khoảng không trừ)
function pointsLeft(q, at) {
  const points = q.worth ?? state.map.byId.get(q.province).points
  if (at <= q.freeUntil) return points
  return points - Math.round(points * Math.min(1, (at - q.freeUntil) / (q.deadline - q.freeUntil)))
}

export function renderTimers() {
  if (!state.me) return
  const t = now()
  let left = null
  if (state.me.status === 'running') left = state.me.endsAt - t
  else if (state.me.status === 'paused') left = state.me.endsAt - state.me.pausedAt
  else if (state.me.status === 'ended') left = 0
  $('timer').textContent = left == null ? '--:--' : formatClock(left)
  $('timerBox').classList.toggle('warn', left != null && left < 5 * 60_000)

  const ev = state.me.event && state.me.event.until > t ? state.me.event : null
  $('eventPill').hidden = !ev
  if (ev) {
    $('eventPill').replaceChildren(labeled(ev.kind, `${eventLabel(ev)} ${formatClock(ev.until - t)}`))
    $('eventPill').classList.toggle('storm', ev.kind === 'storm')
    $('eventPill').classList.toggle('golden', ev.kind === 'golden')
  }
  if (locked()) $('ovBig').textContent = formatClock(state.me.lockedUntil - t)
  updateSiegeChoice() // khung "Tỉnh này đã có chủ": đếm lùi thời gian chờ, hết chờ thì mở nút Công thành
  updateBetTimer()    // khung cược số hiệp thử tài: đếm lùi hạn cược

  // Đồng hồ câu phòng thủ (cùng hạn chót với đội công thành)
  if (state.dialogMode === 'defense' && state.defense) {
    const timer = $('dlg').querySelector('.q-timer')
    const at = Math.max(state.defense.issuedAt, state.me.status === 'paused' ? state.me.pausedAt : t)
    if (timer) timer.replaceChildren(labeled('timer', state.defense.deadline > at ? formatClock(state.defense.deadline - at) : 'Hết giờ!'))
  }
  if (state.dialogMode === 'question' && state.question) {
    const timer = $('dlg').querySelector('.q-timer')
    if (timer) {
      const q = state.question.q
      // Khi tạm dừng, đồng hồ câu hỏi đứng yên (server dời giờ khi tiếp tục).
      // Giờ chỉ bắt đầu chạy từ issuedAt (server phát câu sớm 1 giây cho camera bay tới) — trước đó đứng ở 00:30
      const at = Math.max(q.issuedAt, state.me.status === 'paused' ? state.me.pausedAt : t)
      const left = q.deadline - at
      timer.replaceChildren(labeled('timer', left <= 0 ? 'Hết giờ!'
        : compactRoom() ? `${formatClock(left)} · thưởng nhanh +${speedLeft(q, at)}`
          : `${formatClock(left)} · còn ${pointsLeft(q, at)} điểm${at < q.freeUntil ? ` (đủ điểm thêm ${formatClock(q.freeUntil - at)})` : ''}`))
      timer.classList.toggle('late', !compactRoom() && at >= q.freeUntil)
    }
  }
}

// Hết khóa / hết trinh sát / hết sự kiện / hết miễn công thành: server không đẩy tin lúc đó nên client tự vẽ lại
let wasLocked = false, wasScout = false, hadEvent = false, wasWaiting = false
setInterval(() => {
  if (!state.me) return
  renderFact($('ovFact'), state.me.status === 'waiting' ? state.me.facts : null, state.me.factMs, now(), nameOf) // sảnh chờ "Bạn có biết?"
  if (state.me.status === 'waiting' && state.me.autoStartAt) renderOverlay() // đếm ngược tự bắt đầu
  const l = locked(), sc = scoutActive(), ev = !!(state.me.event && state.me.event.until > now()), w = !!siegeWait()
  if (l !== wasLocked || sc !== wasScout || ev !== hadEvent || w !== wasWaiting) {
    wasWaiting = w
    if (wasLocked && !l) toast(state.me.canRetry ? `Nghỉ xong — trả lời lại ở ${nameOf(state.me.current)} hoặc đi tỉnh khác` : 'Nghỉ xong — chơi tiếp thôi!')
    wasLocked = l; wasScout = sc; hadEvent = ev
    renderAll()
  } else {
    renderTimers()
  }
}, 250)
