// Trang chủ phòng (MC) — Phase 4: điều khiển trận, sự kiện, xem team + thành viên, kick, sửa điểm.
// Chủ phòng thấy toàn bộ phòng của mình (màu team, vị trí từng team). Dữ liệu động gán bằng textContent.

import { api, connectStream, formatClock, requireRole, serverClock } from '/shared/api.js'
import { createMap, heatTiles, heatNotes } from '/shared/map.js'
import { resultsView, fmtTime } from '/shared/results.js'
import { mascotIcon } from '/shared/mascots.js'
import { icon, labeled, fillIcons } from '/shared/icons.js'
import { $, el, button } from '/shared/dom.js'
import * as fx from '/shared/fx.js'
import { enhanceSelects } from '/shared/select.js'
import { eventLabel, eventSign, timedEvent } from '/shared/events.js'
import { sharedPanel, sharedTick } from '/shared/shared-q.js'
import { cultureView } from '/shared/culture.js'

const clock = serverClock()
const now = () => clock.now()

const STATUS_TEXT = { waiting: 'Chờ bắt đầu', running: 'Đang chơi', paused: 'Tạm dừng', ended: 'Đã kết thúc' }
const CARD_NAME = { scout: 'Ống nhòm', shield: 'Hàng rào', march: 'Xe tốc hành', fifty: '50:50', time: 'Thêm giờ' }

let map = null
let view = null
let stream = null
let final = null  // dữ liệu tổng kết (/api/replay) khi trận đã kết thúc

const nameOf = id => map?.byId.get(id)?.name ?? id ?? ''

fillIcons()
enhanceSelects()

let toastTimer
function toast(msg, bad = false) {
  const t = $('toast')
  t.textContent = msg
  t.classList.toggle('bad', bad)
  t.hidden = false
  fx.stickerIn(t, { base: 'translateX(-50%)', tape: true })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => fx.peelOut(t, { base: 'translateX(-50%)', done: () => { t.hidden = true } }), 3200)
}

// Hộp xác nhận cùng phong cách game (thay cho confirm() mặc định của trình duyệt)
function confirmBox({ title, text = '', ok, danger = false }) {
  const dlg = $('confirmDlg')
  $('confirmTitle').textContent = title
  $('confirmText').textContent = text
  $('confirmText').hidden = !text
  $('confirmYes').textContent = ok
  $('confirmYes').className = `btn ${danger ? 'danger' : 'green'}`
  dlg.showModal()
  $('confirmYes').focus()
  return new Promise(resolve => {
    const done = value => {
      dlg.close()
      $('confirmYes').onclick = $('confirmNo').onclick = dlg.oncancel = null
      resolve(value)
    }
    $('confirmYes').onclick = () => done(true)
    $('confirmNo').onclick = () => done(false)
    dlg.oncancel = e => { e.preventDefault(); done(false) } // Esc = Hủy
  })
}

// Chủ phòng sửa tên người chơi (tên tự gõ, hiện cho đồng đội) — hộp riêng nên SSE vẽ lại danh sách không làm mất chữ đang gõ
function renameBox(m) {
  const dlg = $('renameDlg')
  $('renameTitle').textContent = `Sửa tên ${m.name}`
  $('renameInput').value = m.name
  dlg.showModal()
  $('renameInput').select()
  $('renameNo').onclick = () => dlg.close()
  $('renameForm').onsubmit = e => {
    e.preventDefault()
    const name = $('renameInput').value.trim()
    if (!name) return
    act(async () => {
      await api('/api/owner/rename', { playerId: m.id, name })
      dlg.close()
    }, `Đã đổi tên ${m.name} thành ${name}`)
  }
}

async function act(fn, okMsg) {
  try {
    await fn()
    if (okMsg) toast(okMsg)
  } catch (err) {
    if (err.status === 401) showEntry('Phiên đã hết hạn, đăng nhập lại.')
    else toast(err.message, true)
  }
}

// ---------- Đăng nhập ----------
function showEntry(message = '') {
  stream?.close()
  stream = null
  $('app').hidden = true
  $('entry').hidden = false
  $('loginError').textContent = message
  $('code').focus()
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault()
  $('loginError').textContent = ''
  try {
    await api('/api/owner/login', { code: $('code').value.trim(), ownerKey: $('ownerKey').value.trim() })
    $('ownerKey').value = ''
    await enter()
  } catch (err) {
    $('loginError').textContent = err.message
  }
})

$('playerSearch').addEventListener('input', () => { if (view) renderTeams() })

$('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', {}) } catch {}
  showEntry()
})

async function enter() {
  await requireRole('owner')
  // Mở từ trang quản trị (nút Điều khiển): có nút quay về
  $('sysBack').hidden = !fromSys
  const v = await api('/api/owner/overview')
  // Sang màn chơi: đang chơi (giữ quyền chủ phòng) thì quay lại màn chơi; chưa chơi thì vào phòng này như người chơi —
  // server thấy phiên chủ phòng nên vẫn giữ quyền chủ phòng
  for (const id of ['playLink', 'playLinkBot']) {
    $(id).textContent = v.playing ? '← Quay lại chơi' : 'Vào chơi'
    $(id).href = v.playing ? '/' : `/?room=${v.room.code}&host=1`
  }
  $('entry').hidden = true
  $('app').hidden = false
  if (!map) {
    const [geo, provinces] = await Promise.all([
      fetch('/data/map-geo.json').then(r => r.json()),
      api('/api/provinces'),
    ])
    map = createMap($('mapWrap'), { geo, provinces, tipExtra })
  }
  apply(v)
  stream = connectStream({
    view: 'owner',
    onState: apply,
    onStatus: s => { $('conn').hidden = s === 'online' },
    onUnauthorized: () => showEntry('Phiên đã hết hạn, đăng nhập lại.'),
  })
}

// ---------- Hiển thị ----------
function apply(v) {
  const prev = view
  view = v
  clock.sync(v.serverNow)
  if (v.status !== 'ended') final = null
  // Sự kiện mới: biển treo đu xuống (cùng lúc với màn team + màn chiếu)
  const evKey = e => (e ? `${e.kind}|${e.region}|${e.until}` : '')
  if (prev && timedEvent(v.event) && evKey(v.event) !== evKey(prev.event)) fx.hangSign({ ...eventSign(v.event), sub: '' })
  render()
  // Vừa kết thúc (hoặc mở trang khi đã kết thúc): hiện tổng kết
  if (v.status === 'ended' && !final) loadResults(prev?.status !== 'ended')
}

async function loadResults(open = true) {
  try {
    final = await api('/api/replay')
  } catch (err) {
    toast(err.message, true)
    return
  }
  renderButtons()
  if (open) openResults()
}

function openResults() {
  if (!final) return
  $('resultsBody').replaceChildren(resultsView(final), cultureView(final.culture, nameOf))
  if (!$('resultsDlg').open) $('resultsDlg').showModal()
  $('resultsDlg').scrollTop = 0
}
for (const id of ['resultsClose', 'resultsX']) $(id).addEventListener('click', () => $('resultsDlg').close())

const teamById = id => view.teams.find(t => t.id === id)

function tipExtra(id) {
  // Phòng đơn / Team gọn tắt Đấu: số người / số đội đã tới + ai đang đứng
  if (view?.room.stamps) {
    const here = view.teams.filter(t => t.current === id).map(t => t.name)
    const n = view.heat?.[id] ?? 0
    return [[view.room.mode === 'solo' ? `${n} người đã có tem` : `${n} đội đã cắm cờ`, !n], ...(here.length ? [[`Đang đứng: ${here.join(', ')}`, false, 'hat']] : [])]
  }
  const o = view?.ownership[id]
  const lines = o ? [[teamById(o.team)?.name ?? '', false, 'flag', teamById(o.team)?.color]] : [['Chưa có chủ', true]]
  if (o?.shieldUntil > now()) lines.push(['Đang có hàng rào', false, 'shield'])
  const here = view?.teams.filter(t => t.current === id).map(t => t.name)
  if (here?.length) lines.push([`Đang đứng: ${here.join(', ')}`, false, 'hat'])
  return lines
}

function render() {
  const v = view
  $('roomName').textContent = v.room.name
  $('statusText').textContent = STATUS_TEXT[v.status]
  $('roomCode').textContent = v.room.code
  $('screenCode').textContent = v.screenCode
  $('inviteLink').textContent = `${location.origin}/?room=${v.room.code}`
  $('inviteLink').title = $('inviteLink').textContent
  $('topicChoice').checked = v.room.topicChoice
  $('betChoice').checked = v.room.betChoice

  // Bản đồ thật: màu tất cả team + chấm số vị trí từng team
  // Phòng đơn: bản đồ nhiệt số người có tem (tỉnh không thuộc riêng ai)
  const tiles = v.room.stamps ? heatTiles(v.heat) : {}
  for (const [id, o] of Object.entries(v.ownership)) {
    tiles[id] = { owner: 'owned', color: teamById(o.team)?.color, shielded: o.shieldUntil > now() }
  }
  map.render({
    current: null,
    trail: [],
    tiles,
    storm: v.event?.kind === 'storm' ? v.event.region : null,
    festival: v.event?.kind === 'festival' ? v.event.region : null,
    // Phòng đơn: tối đa 50 người → không chấm vị trí từng người (rê chuột lên tỉnh xem "Đang đứng"); ghi số người có tem thay dòng điểm
    pins: v.room.mode === 'solo' ? [] : v.teams.filter(t => t.current).map((t, i) => ({ province: t.current, color: t.color, text: String(i + 1) })),
    notes: v.room.stamps ? heatNotes(v.heat, v.room.mode === 'solo' ? 'người' : 'đội') : null,
  })

  renderButtons()
  renderTeams()
  renderLog()
  renderTimers()
}

function control(action, label, cls, ask) {
  return button(label, cls, async () => {
    if (ask && !(await confirmBox(ask))) return
    act(() => api('/api/owner/game', { action }))
  })
}

function renderButtons() {
  const s = view.status
  const buttons = []
  if (s === 'waiting') {
    const players = view.teams.reduce((n, t) => n + t.members.length, 0)
    const empty = view.teams.filter(t => !t.members.length).map(t => t.name)
    buttons.push(control('start', labeled('play', 'Bắt đầu'), 'green', {
      title: 'Bắt đầu trận đấu?',
      text: `${players} người chơi sẽ được chia tỉnh xuất phát và đồng hồ ${view.room.durationMin} phút bắt đầu chạy.`
        + (empty.length ? ` Lưu ý: ${empty.join(', ')} chưa có ai.` : ''),
      ok: 'Bắt đầu',
    }))
  }
  if (s === 'running') buttons.push(control('pause', labeled('pause', 'Tạm dừng'), ''))
  if (s === 'paused') buttons.push(control('resume', labeled('play', 'Tiếp tục'), 'green'))
  if (s === 'running' || s === 'paused') {
    buttons.push(control('end', labeled('stop', 'Kết thúc'), 'danger', {
      title: 'Kết thúc trận ngay?', text: 'Điểm được chốt theo tỉnh đang sở hữu lúc này.', ok: 'Kết thúc', danger: true,
    }))
  }
  if (s === 'ended') buttons.push(button(labeled('finish', 'Xem tổng kết'), 'green', openResults, { disabled: !final }))
  if (s !== 'waiting') {
    buttons.push(control('reset', '↺ Chơi lại', '', {
      title: '↺ Chơi lại từ đầu?', text: 'Xóa toàn bộ diễn biến và điểm. Giữ nguyên team và người chơi.', ok: 'Chơi lại', danger: true,
    }))
  }
  $('gameButtons').replaceChildren(...buttons)
  $('eventBtn').disabled = s !== 'running'
  renderCardsCard(s)
  $('sharedBtn').disabled = s !== 'running'
  renderShared()
}

// Câu hỏi chung cả phòng: chủ phòng xem như màn chiếu (đáp án chỉ có sau khi công bố) + nút công bố sớm / tiếp tục trận
function renderShared() {
  const sh = view.status === 'paused' ? view.shared : null
  $('sharedAdmin').hidden = !sh
  if (!sh) return
  $('sharedAdmin').replaceChildren(
    sharedPanel(sh, { provinceName: nameOf(sh.province) }),
    el('div', { class: 'btn-row' },
      sh.result ? '' : button(labeled('stats', 'Công bố ngay'), '', () => act(() => api('/api/owner/shared', { action: 'reveal' }))),
      control('resume', labeled('play', 'Tiếp tục trận'), 'green')))
  sharedTick($('sharedAdmin'), sh, now())
}

function renderTeams() {
  const scores = new Map(view.scores.map(s => [s.teamId, s]))
  const solo = view.room.mode === 'solo'
  $('teamsTitle').textContent = solo ? `Lữ khách · ${view.teams.length} người` : 'Team & điểm'
  $('playerSearch').hidden = !solo
  $('adminTabs').querySelector('[data-tab="teams"]').textContent = solo ? 'Lữ khách' : 'Team'
  $('scoreTeam').setAttribute('aria-label', solo ? 'Lữ khách' : 'Team')
  const selected = $('scoreTeam').value
  const options = solo ? [...view.teams].sort((a, b) => a.name.localeCompare(b.name, 'vi')) : view.teams
  $('scoreTeam').replaceChildren(...options.map(t => el('option', { value: String(t.id) }, t.name)))
  if (selected) $('scoreTeam').value = selected
  if (solo) return renderPlayers(scores)

  $('teams').replaceChildren(...view.teams.map((t, i) => {
    const sc = scores.get(t.id)
    const status = []
    if (t.current) status.push(labeled('hat', nameOf(t.current)))
    if (t.lockedUntil > now()) status.push(labeled('timer', 'đang nghỉ chân'))
    if (t.pendingQuestion) status.push(labeled('question', 'đang trả lời'))
    if (t.cards.length) status.push(el('span', { class: 'with-icon' }, ...t.cards.map(c => icon(c, { label: CARD_NAME[c] }))))
    const members = t.members.map(m => el('li', {}, m.name, m.id === view.hostId ? el('small', { class: 'muted' }, ' (chủ phòng)') : '',
      button('Sửa', 'kick', () => renameBox(m), { title: `Sửa tên ${m.name}`, 'aria-label': `Sửa tên ${m.name}` }),
      button('✕', 'kick', async () => {
        if (!(await confirmBox({ title: `Mời ${m.name} ra khỏi phòng?`, text: `${m.name} sẽ bị ngắt khỏi phòng ngay.`, ok: 'Mời ra', danger: true }))) return
        act(() => api('/api/owner/kick', { playerId: m.id }), `Đã mời ${m.name} ra khỏi phòng`)
      }, { title: `Mời ${m.name} ra khỏi phòng`, 'aria-label': `Mời ${m.name} ra khỏi phòng` })))
    return el('div', { class: 'owner-team' },
      el('div', { class: 'owner-team-head' },
        el('span', { class: 'pin-no' }, String(i + 1)), mascotIcon(t.mascot, t.color, 26), el('b', {}, t.name),
        el('span', { class: 'muted' }, `${sc?.provinces ?? 0} tỉnh · `, labeled('timer', fmtTime(sc?.answerMs))),
        el('b', { class: 'owner-score' }, (sc?.total ?? 0).toLocaleString('vi-VN'))),
      status.length ? el('p', { class: 'muted' }, ...status.flatMap((s, k) => (k ? [' · ', s] : [s]))) : '',
      members.length ? el('ul', { class: 'members' }, ...members) : el('p', { class: 'muted' }, 'Chưa có ai'),
    )
  }))
}

// Phòng đơn: mỗi người một dòng (team ẩn 1 người), xếp theo hạng như bảng điểm; lọc theo ô tìm tên.
// Nút trên dòng: sửa tên, sửa điểm (chọn sẵn người đó trong khung Sửa điểm), mời ra
function renderPlayers(scores) {
  const rankOf = t => scores.get(t.id) ?? { total: 0, answerMs: 0, provinces: 0 }
  const ranked = [...view.teams].sort((a, b) => rankOf(b).total - rankOf(a).total || rankOf(a).answerMs - rankOf(b).answerMs)
  const find = normalize($('playerSearch').value)
  const shown = ranked.map((t, i) => [t, i + 1]).filter(([t]) => !find || normalize(t.name).includes(find))
  if (!ranked.length) return $('teams').replaceChildren(el('p', { class: 'muted' }, 'Chưa có ai vào phòng'))
  if (!shown.length) return $('teams').replaceChildren(el('p', { class: 'muted' }, 'Không có ai tên như vậy'))
  $('teams').replaceChildren(el('ol', { class: 'player-list' }, ...shown.map(([t, rank]) => {
    const sc = rankOf(t)
    const m = t.members[0]
    const status = []
    if (t.current) status.push(labeled('hat', nameOf(t.current)))
    if (t.lockedUntil > now()) status.push(labeled('timer', 'nghỉ chân'))
    if (t.pendingQuestion) status.push(labeled('question', 'đang trả lời'))
    return el('li', { class: 'player-row' },
      el('span', { class: 'rank' }, String(rank)),
      mascotIcon(t.mascot, t.color, 30),
      el('div', { class: 'player-main' },
        el('b', {}, t.name, m?.id === view.hostId ? el('small', { class: 'muted' }, ' (chủ phòng)') : ''),
        el('span', { class: 'muted' }, `${sc.provinces} tem`, ...(t.pioneers ? [' · ', labeled('star', `${t.pioneers} Tiên phong`)] : []),
          ...status.flatMap(s => [' · ', s]))),
      el('b', { class: 'owner-score' }, sc.total.toLocaleString('vi-VN')),
      m ? el('div', { class: 'player-actions' },
        button('Sửa tên', '', () => renameBox(m)),
        button('±điểm', '', () => {
          $('scoreTeam').value = String(t.id)
          $('scoreForm').scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          $('scoreDelta').focus()
        }, { title: `Sửa điểm ${t.name}` }),
        button('✕', 'kick', async () => {
          if (!(await confirmBox({ title: `Mời ${m.name} ra khỏi phòng?`, text: `${m.name} sẽ bị ngắt khỏi phòng ngay, tem và điểm bị xóa.`, ok: 'Mời ra', danger: true }))) return
          act(() => api('/api/owner/kick', { playerId: m.id }), `Đã mời ${m.name} ra khỏi phòng`)
        }, { title: `Mời ${m.name} ra khỏi phòng`, 'aria-label': `Mời ${m.name} ra khỏi phòng` })) : '')
  })))
}

// Tìm tên không phân biệt dấu / hoa thường
const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()

function logText(e) {
  const team = e.team_id ? `${teamById(e.team_id)?.name ?? ''}${e.player_name ? ` (${e.player_name})` : ''}: ` : ''
  const p = nameOf(e.province_id)
  const d = e.detail ? JSON.parse(e.detail) : {}
  switch (e.action) {
    case 'start': return 'Trận đấu bắt đầu'
    case 'end': return 'Kết thúc trận'
    case 'spawn': return `${team}xuất phát ở ${p}`
    case 'move': return `${team}đi đến ${p}`
    case 'retry': return `${team}trả lời lại ở ${p}`
    case 'retreat': return `${team}quay lại ${p}`
    case 'pushed-back': return `${team}được mời về ${p}`
    case 'capture': return `${team}cắm cờ ở ${p}`
    case 'steal': return `${team}thành chủ nhà mới của ${p} (thay ${teamById(d.fromTeam)?.name ?? '?'})`
    case 'siege': return `${team}ghé thăm thử tài ${p}`
    case 'wrong': return `${team}${d.timeout ? 'hết giờ' : 'trả lời sai'} ở ${p}`
    case 'siege-fail': return `${team}thử tài ${p} chưa thành${d.timeout ? ' (hết giờ)' : ''}`
    case 'skip': return `${team}bỏ qua câu hỏi ở ${p}`
    case 'topic': {
      // Bước chọn trước câu hỏi: chủ đề và / hoặc mức cược
      const parts = []
      if (view.room.topicChoice) parts.push(`chủ đề ${d.topic ? view.topicNames[d.topic] ?? d.topic : 'ngẫu nhiên'}`)
      if (d.bet || view.room.betChoice) parts.push(d.bet ? 'Mạo hiểm' : 'Chắc ăn')
      return `${team}chọn ${parts.join(' · ')} ở ${p}`
    }
    case 'speed': return `${team}siêu tốc ở ${p}: +${d.bonus}`
    case 'progress': return `${team}đúng ${d.done}/${d.of} câu ở ${p}`
    case 'siege-bet': return `${team}cược ${d.rounds} hiệp thử tài ${p}`
    case 'siege-start': return `${team}bắt đầu thử tài ${p}: ${d.rounds} hiệp`
    case 'duel-round': return `${team}hiệp ${d.no}/${d.of} ở ${p}: ${d.winner === 'att' ? 'đoàn khách' : 'chủ nhà'} thắng (${d.att}–${d.def})`
    case 'home': return `${team}về quê ở ${p}: +${d.bonus}` // không nêu tên thành viên — quê chỉ đồng đội biết
    case 'defend': return `${team}đón khách thành công ở ${p}: +${d.bonus}`
    case 'defend-fail': return `${team}trả lời sai câu đón khách ở ${p}`
    case 'held': return `${team}giữ được ${p} (đoàn khách trả lời sai)`
    case 'repelled': return `${team}thử tài ${p} chưa thành, được mời về`
    case 'time-penalty': return `${team}trả lời chậm ở ${p}: −${d.penalty}`
    case 'card': return `${team}dùng thẻ ${CARD_NAME[d.kind] ?? ''}${p ? ` ${p}` : ''}`
    case 'event': return labeled(d.kind, d.kind === 'rumor' ? d.text : eventLabel(d))
    case 'streak': return `${team}đúng ${d.n} câu liền → ${d.card ? `thẻ ${CARD_NAME[d.card]}` : `+${d.bonus} điểm`}`
    case 'shared': return labeled('question', `Câu hỏi chung cả phòng (${p})`)
    case 'shared-result': return `Câu hỏi chung: cả phòng đúng ${d.pct}% (${d.voters} người chọn)${d.passed ? ` → mọi team +${d.bonus}` : ''}`
    case 'shared-bonus': return `${team}+${d.bonus} (câu hỏi chung)`
    case 'rename': return `${team}chủ phòng sửa tên một thành viên thành ${d.to}`
    case 'gift': return `${team}nhận thẻ chủ phòng tung: ${d.kinds.map(k => CARD_NAME[k]).join(', ')}`
    case 'score-adjust': return `${team}${d.delta > 0 ? '+' : ''}${d.delta} điểm — ${d.reason}`
    default: return `${team}${e.action}`
  }
}

function renderLog() {
  const fmt = at => new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  $('log').replaceChildren(...view.log.map(e => el('li', {}, el('time', {}, fmt(e.created_at)), logText(e))))
}

function renderTimers() {
  if (!view) return
  const t = now()
  const left = view.status === 'running' ? view.endsAt - t
    : view.status === 'paused' ? view.endsAt - view.pausedAt
    : view.status === 'ended' ? 0 : null
  $('timer').textContent = left == null ? formatClock(view.room.durationMin * 60_000) : formatClock(left)
  $('timerBox').classList.toggle('warn', left != null && left < 5 * 60_000)
  if (view.shared && !$('sharedAdmin').hidden) sharedTick($('sharedAdmin'), view.shared, t)
  const ev = view.event && view.event.until > t ? view.event : null
  $('eventPill').hidden = !ev
  if (ev) {
    $('eventPill').replaceChildren(labeled(ev.kind, `${eventLabel(ev)} ${formatClock(ev.until - t)}`))
    $('eventPill').classList.toggle('storm', ev.kind === 'storm')
    $('eventPill').classList.toggle('golden', ev.kind === 'golden')
  }
}
setInterval(renderTimers, 500)

// ---------- Thao tác ----------
$('topicChoice').addEventListener('change', e => {
  const on = e.target.checked
  act(() => api('/api/owner/settings', { topicChoice: on }), on ? 'Đã bật: người chơi được chọn chủ đề' : 'Đã tắt: câu hỏi ngẫu nhiên')
})
$('betChoice').addEventListener('change', e => {
  const on = e.target.checked
  act(() => api('/api/owner/settings', { betChoice: on }), on ? 'Đã bật: team chọn Chắc ăn / Mạo hiểm trước câu hỏi' : 'Đã tắt đặt cược')
})
$('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('inviteLink').textContent)
    toast('Đã sao chép link mời')
  } catch {
    toast('Không sao chép được — hãy bôi đen link để copy', true)
  }
})
// Tin đồn / Câu hỏi vàng không theo miền
$('eventKind').addEventListener('change', () => { $('eventRegion').disabled = ['rumor', 'golden'].includes($('eventKind').value) })
$('eventBtn').addEventListener('click', () => act(
  () => api('/api/owner/event', { kind: $('eventKind').value, region: $('eventRegion').value }),
  'Đã tung sự kiện',
))

// Team gọn: tung thẻ cho mọi team. Không đấu (mỗi team một bản đồ): không có Hàng rào
function renderCardsCard(s) {
  $('cardsCard').hidden = !view.room.compact
  if (!view.room.compact) return
  const kinds = ['random', ...Object.keys(CARD_NAME).filter(k => !(k === 'shield' && view.room.stamps))]
  if ($('cardKind').options.length !== kinds.length) {
    const keep = $('cardKind').value
    $('cardKind').replaceChildren(...kinds.map(k => el('option', { value: k }, k === 'random' ? 'Thẻ ngẫu nhiên' : CARD_NAME[k])))
    if (kinds.includes(keep)) $('cardKind').value = keep
  }
  $('cardBtn').disabled = s !== 'running'
}
$('cardBtn').addEventListener('click', () => act(async () => {
  const r = await api('/api/owner/cards', { kind: $('cardKind').value, count: Number($('cardCount').value) })
  toast(r.cards ? `Đã tung ${r.cards} thẻ cho ${r.teams} team` : 'Khay thẻ của mọi team đã đầy — chưa tung thêm được')
}))

$('sharedBtn').addEventListener('click', () => act(() => api('/api/owner/shared', { action: 'start' }), 'Đã tung câu hỏi chung — trận tạm dừng'))

$('scoreForm').addEventListener('submit', e => {
  e.preventDefault()
  const team = teamById(Number($('scoreTeam').value))
  act(async () => {
    await api('/api/owner/score', { teamId: team.id, delta: Number($('scoreDelta').value), reason: $('scoreReason').value.trim() })
    $('scoreDelta').value = ''
    $('scoreReason').value = ''
  }, `Đã sửa điểm ${team.name}`)
})

// ---------- Thống kê câu hỏi (bước 4.11, 7.9) ----------
const LEVEL = { 1: 'Dễ', 2: 'Vừa', 3: 'Khó' }
let stats = []

async function loadStats() {
  try {
    stats = await api('/api/owner/question-stats')
  } catch (err) {
    toast(err.message, true)
    return
  }
  renderStats()
}

function renderStats() {
  const answered = stats.filter(r => r.answers > 0)
  const total = answered.reduce((n, r) => n + r.answers, 0)
  const correct = answered.reduce((n, r) => n + r.correct, 0)
  const changes = answered.filter(r => r.suggestedLevel !== r.level).length
  // Tóm tắt: mỗi số liệu là một chip sticker nhỏ
  const chip = (value, text, cls = '') => el('span', { class: `stat-chip ${cls}` }, el('b', {}, value), ` ${text}`)
  $('statsSummary').replaceChildren(...(total
    ? [chip(String(answered.length), 'câu đã được hỏi'), chip(String(total), 'lượt trả lời'),
      chip(`${Math.round(correct / total * 100)}%`, 'trả lời đúng'), chip(String(changes), 'câu nên đổi mức', changes ? 'warn' : '')]
    : [el('span', { class: 'muted' }, 'Chưa có lượt trả lời nào trong phòng này.')]))
  const rows = $('statsAll').checked ? stats : answered
  // Nhãn mức: Dễ xanh lá · Vừa vàng · Khó đỏ
  const level = (n, extra = '') => el('span', { class: `lv lv${n}` }, LEVEL[n] + extra)
  // % đúng: số + thanh nhỏ (đỏ dưới 40%, vàng dưới 75%, còn lại xanh)
  const rate = r => {
    if (r.rate == null) return '–'
    const fill = el('i')
    fill.style.width = `${Math.round(r.rate * 100)}%` // CSSOM (CSP chặn thuộc tính style="")
    return el('span', { class: 'rate' }, `${Math.round(r.rate * 100)}%`, el('span', { class: `rate-bar ${r.rate < 0.4 ? 'low' : r.rate < 0.75 ? 'mid' : ''}` }, fill))
  }
  $('statsBody').replaceChildren(...rows.map(r => {
    const changed = r.answers >= 3 && r.suggestedLevel !== r.level
    return el('tr', changed ? { class: 'me' } : {},
      el('td', { class: 'qid' }, r.id),
      el('td', {}, nameOf(r.province_id)),
      el('td', {}, r.difficulty === 'siege' ? labeled('siege', 'Thử tài') : 'Thường'),
      el('td', { class: 'num' }, String(r.answers)),
      el('td', { class: 'num' }, rate(r)),
      el('td', {}, level(r.level)),
      el('td', {}, r.answers < 3 ? '–' : level(r.suggestedLevel, changed ? (r.suggestedLevel > r.level ? ' ↑' : ' ↓') : '')))
  }))
}

$('statsBtn').addEventListener('click', async () => {
  $('statsDlg').showModal()
  await loadStats()
})
$('statsRefresh').addEventListener('click', loadStats)
$('statsClose').addEventListener('click', () => $('statsDlg').close())
$('statsAll').addEventListener('change', renderStats)

// ---------- Điện thoại: tab nhóm thẻ + nút đáy (css/mobile.css) ----------
function showTab(tab) {
  $('app').dataset.tab = tab
  for (const b of $('adminTabs').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.tab === tab))
}
$('adminTabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]')
  if (b) showTab(b.dataset.tab)
})
showTab('game')
$('logoutBtnBot').addEventListener('click', () => $('logoutBtn').click())

// ---------- Khởi động ----------
const invited = new URLSearchParams(location.search).get('room')
// Mở từ trang quản trị (nút Điều khiển) — đọc trước khi xóa query khỏi thanh địa chỉ
const fromSys = new URLSearchParams(location.search).get('from') === 'quan-tri'
if (location.search) history.replaceState(null, '', location.pathname)
if (invited) $('code').value = invited.toUpperCase()
enter().catch(err => showEntry(err.status === 401 || err.status === 403 ? '' : err.message))
