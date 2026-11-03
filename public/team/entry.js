// Màn team: vào phòng (mã phòng → tên → chọn team), tạo phòng, thoát; vào xong thì mở bản đồ + kết nối realtime.

import { api, connectStream, requireRole } from '/shared/api.js'
import { createMap } from '/shared/map.js'
import { music } from '/shared/music.js'
import { mascotIcon } from '/shared/mascots.js'
import { icon } from '/shared/icons.js'
import { $, button, el } from '/shared/dom.js'
import { moveTo } from './actions.js'
import { closeDialog } from './dialogs.js'
import { apply } from '/team.js'
import { tipExtra } from './render.js'
import { state } from './state.js'

// ---------- Trang chủ (landing) + vào phòng / tạo phòng ----------
// message: lỗi / nhắc (phiên hết hạn, bị mời ra…) → cuộn thẳng xuống khu Vào chơi thay vì phần giới thiệu
export function showEntry(message = '') {
  state.stream?.close()
  state.stream = null
  closeDialog()
  $('app').hidden = true
  $('entry').hidden = false
  music.mode('calm')
  showTab('join')
  $('lookupError').textContent = message
  if (message) toPlay()
  loadRooms()
  drawHeroMap()
}
const toPlay = () => $('play').scrollIntoView({ block: 'start' })

// Linh vật các team (trang trí phần đầu trang)
const MASCOT_COLORS = [['Rồng', '#C0392B'], ['Lân', '#E67E22'], ['Rùa', '#27AE60'], ['Phượng', '#8E44AD'], ['Hạc', '#2E86C1'], ['Trâu', '#8D6E63'], ['Voi', '#16A085'], ['Hổ', '#D35400']]
$('entryMascots').replaceChildren(...MASCOT_COLORS.map(([m, c]) => mascotIcon(m, c, 34)))

// Ô "Có mã phòng?" ở đầu trang: tra mã rồi xuống khu Vào chơi (bước nhập tên)
$('heroForm').addEventListener('submit', e => {
  e.preventDefault()
  const code = $('heroCode').value.trim()
  if (!code) return $('heroCode').focus()
  $('roomCode').value = code.toUpperCase()
  showTab('join')
  lookup(code)
  toPlay()
})

// Bản đồ minh họa ở đầu trang: hình tỉnh thật (/data/map-geo.json, thứ tự Bắc → Nam), vài tỉnh có cờ team, còn lại sương mù.
// Chỉ là hình trang trí — không phải dữ liệu phòng nào
const HERO_OWN = { 'ha-noi': '#C0392B', 'bac-ninh': '#C0392B', 'hung-yen': '#C0392B', 'da-nang': '#E67E22', 'quang-ngai': '#E67E22', hue: '#E67E22', 'can-tho': '#27AE60', 'vinh-long': '#27AE60' }
const HERO_SEEN = ['ninh-binh', 'hai-phong', 'quang-ninh', 'thai-nguyen', 'phu-tho', 'quang-tri', 'gia-lai', 'khanh-hoa', 'dong-thap', 'an-giang', 'ho-chi-minh', 'ca-mau']
let heroDrawn = false
async function drawHeroMap() {
  if (heroDrawn) return
  heroDrawn = true
  let geo
  try {
    geo = await fetch('/data/map-geo.json').then(r => r.json())
  } catch {
    heroDrawn = false
    return
  }
  const NS = 'http://www.w3.org/2000/svg'
  const svg = $('heroMap')
  const [x0, y0, x1, y1] = geo.bounds
  svg.setAttribute('viewBox', `${x0 - 10} ${y0 - 10} ${x1 - x0 + 20} ${y1 - y0 + 20}`)
  const ids = geo.provinces.map(p => p.id)
  const region = id => (ids.indexOf(id) <= ids.indexOf('ninh-binh') ? 'n' : ids.indexOf(id) <= ids.indexOf('lam-dong') ? 'c' : 's')
  for (const p of geo.provinces) {
    const path = document.createElementNS(NS, 'path')
    path.setAttribute('d', p.d)
    if (HERO_OWN[p.id]) {
      path.setAttribute('class', 'own')
      path.style.fill = HERO_OWN[p.id]
    } else if (HERO_SEEN.includes(p.id)) path.setAttribute('class', region(p.id))
    svg.append(path)
  }
  const [lx, ly] = geo.provinces.find(p => p.id === 'ha-noi')?.label ?? [227, 154]
  const pin = document.createElementNS(NS, 'g')
  pin.setAttribute('transform', `translate(${lx - 22} ${ly - 52})`)
  const hat = icon('hat')
  for (const [k, v] of Object.entries({ width: 44, height: 44 })) hat.setAttribute(k, v)
  hat.classList.add('lp-pin')
  pin.append(hat)
  svg.append(pin)
}

// Phần đầu trang khuất khỏi màn hình → dừng hiệu ứng nhún (đỡ vẽ lại bản đồ minh họa khi đang gõ ở khu chọn phòng)
new IntersectionObserver(([e]) => $('lpTop').classList.toggle('still', !e.isIntersecting)).observe($('lpTop'))

// ---------- Danh sách phòng đang mở (cột phải, mockup/room-list.html kiểu A) ----------
// Phòng công khai (mọi người tạo) + phòng chơi đơn có sẵn; lọc Tất cả / Theo team / Chơi đơn + tìm tên. Bấm "Vào" = tra mã như nhập tay
const STATUS = { waiting: 'Đang chờ', running: 'Đang chơi', paused: 'Tạm dừng', ended: 'Đã kết thúc' }
const ORDER = { waiting: 0, paused: 1, running: 1, ended: 2 }
let presets = [], openRooms = []
let kind = 'all'
try { kind = localStorage.getItem('vnj-room-filter') || 'all' } catch {}
async function loadRooms() {
  try {
    let allowCreate, allowCompact
    ;({ preset: presets, open: openRooms, allowCreate, allowCompact } = await api('/api/rooms/list'))
    // Ban tổ chức tắt tạo phòng (trang quản trị): báo ngay trên form thay vì để bấm rồi mới lỗi
    $('createOff').hidden = allowCreate !== false
    $('createSubmit').disabled = allowCreate === false
    // Tắt riêng Team gọn: ẩn lựa chọn (đang chọn thì về Theo team)
    $('modeCompact').hidden = allowCompact === false
    if (allowCompact === false && formMode() === 'compact') {
      $('createForm').querySelector('input[name="mode"][value="team"]').checked = true
      syncMode()
    }
  } catch {}
  renderRooms()
}
const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()

function roomRow(r) {
  const team = r.mode !== 'solo'
  const ended = r.status === 'ended'
  const picked = state.lobbyData?.code === r.code
  const full = r.players >= r.max
  let extra
  if (team) {
    extra = el('div', { class: 'room-teams' }, ...r.teams.map(t => el('span', { class: t.members >= r.maxPerTeam ? 'room-team full' : 'room-team' },
      mascotIcon(t.mascot, t.color, 18), String(t.members))))
  } else {
    const fill = el('i')
    fill.style.width = `${Math.min(100, Math.round(r.players * 100 / Math.max(1, r.max)))}%`
    extra = el('div', { class: 'room-meter' }, fill)
  }
  const sub = team ? `${r.compact ? 'Team gọn' : 'Theo team'} · ${r.teams.length} team · ${r.players} người · ${r.durationMin} phút`
    : `Chơi đơn · ${r.players}/${r.max} người · ${r.durationMin} phút${r.preset ? (r.hasHost ? '' : ' · vào trước làm chủ phòng') : ''}`
  const [text, cls] = ended ? ['Đang làm mới', ''] : picked ? ['Đang chọn', ''] : full ? ['Đầy', ''] : ['Vào', 'green']
  return el('div', { class: `room-row${picked ? ' picked' : ''}${ended ? ' ended' : ''}` },
    el('span', { class: `room-kind ${team ? 'team' : 'solo'}` }, icon(team ? 'flag' : 'hat')),
    el('div', {},
      el('div', { class: 'room-title' }, el('b', {}, r.name), el('span', { class: `room-badge ${r.status}` }, STATUS[r.status]),
        r.preset ? el('span', { class: 'room-badge preset' }, 'Có sẵn') : ''),
      el('span', { class: 'room-sub' }, sub), extra),
    button(text, cls, () => lookup(r.code), { disabled: cls !== 'green' }))
}

function renderRooms() {
  const all = [...openRooms.map(r => ({ ...r, preset: false })), ...presets.map(r => ({ ...r, mode: 'solo', preset: true }))]
  const count = k => all.filter(r => k === 'all' || (k === 'team') === (r.mode !== 'solo')).length
  for (const b of document.querySelectorAll('.room-filter .fchip')) {
    b.classList.toggle('on', b.dataset.kind === kind)
    b.setAttribute('aria-pressed', String(b.dataset.kind === kind))
    b.querySelector('i').textContent = String(count(b.dataset.kind))
  }
  const find = normalize($('roomSearch').value)
  const shown = all.filter(r => (kind === 'all' || (kind === 'team') === (r.mode !== 'solo')) && (!find || normalize(r.name).includes(find)))
  // Phòng mọi người tạo: đang chờ trước (dễ vào nhất), rồi đang chơi; trong nhóm giữ thứ tự server (mới tạo trước). Phòng có sẵn ở cuối
  const mine = shown.filter(r => !r.preset).sort((a, b) => ORDER[a.status] - ORDER[b.status])
  const pre = shown.filter(r => r.preset)
  const groups = []
  if (mine.length) groups.push(el('p', { class: 'room-group' }, 'Mọi người tạo'), ...mine.map(roomRow))
  if (pre.length) groups.push(el('p', { class: 'room-group' }, 'Phòng có sẵn'), ...pre.map(roomRow))
  if (!groups.length) {
    groups.push(el('div', { class: 'room-empty' }, find ? 'Không có phòng nào tên như vậy.'
      : kind === 'team' ? 'Chưa có phòng team công khai nào. Được mời vào phòng riêng tư? Nhập mã phòng bên trái — hoặc tạo phòng.'
        : 'Chưa có phòng nào đang mở. Nhập mã phòng bên trái — hoặc tạo phòng.'))
  }
  $('roomList').replaceChildren(...groups)
}
for (const b of document.querySelectorAll('.room-filter .fchip')) {
  b.addEventListener('click', () => {
    kind = b.dataset.kind
    try { localStorage.setItem('vnj-room-filter', kind) } catch {}
    renderRooms()
  })
}
$('roomSearch').addEventListener('input', renderRooms)

// Cột phải theo tab: Tham gia → danh sách phòng; Tạo phòng → giải thích kiểu phòng đang chọn, tạo xong → mã phòng
let created = false, createdCode = null
function showTab(tab) {
  const join = tab === 'join'
  $('roomsPane').hidden = !join
  $('modeExplain').hidden = join || created
  $('created').hidden = join || !created
  $('createdNext').hidden = join || !created
  $('tabJoin').classList.toggle('on', join)
  $('tabCreate').classList.toggle('on', !join)
  $('tabJoin').setAttribute('aria-selected', String(join))
  $('tabCreate').setAttribute('aria-selected', String(!join))
  $('lookupForm').hidden = !join || !!state.lobbyData
  $('joinForm').hidden = !join || !state.lobbyData
  $('createForm').hidden = join || created
  // Không cuộn trang: đang đọc phần giới thiệu thì ô nhập không kéo màn xuống
  ;(join ? (state.lobbyData ? $('playerName') : $('roomCode')) : $('newRoomName')).focus({ preventScroll: true })
}
$('tabJoin').addEventListener('click', () => {
  showTab('join')
  loadRooms() // vừa tạo phòng công khai: hiện ngay, không chờ lượt tự cập nhật 10 giây
})
// Link "Phòng đang mở" / "Vào chơi" (thanh trên, đầu trang): xuống khu Vào chơi ở tab Tham gia, danh sách mới nhất
for (const a of $('entry').querySelectorAll('a[href="#play"]')) {
  a.addEventListener('click', () => {
    if (!$('roomsPane').hidden) return
    showTab('join')
    loadRooms()
  })
}
$('tabCreate').addEventListener('click', () => showTab('create'))

export async function lookup(code) {
  $('lookupError').textContent = ''
  try {
    state.lobbyData = await api('/api/rooms/lookup', { code })
  } catch (err) {
    $('lookupError').textContent = err.message
    return
  }
  if (state.lobbyData.status === 'ended') {
    $('lookupError').textContent = 'Trận đấu ở phòng này đã kết thúc'
    state.lobbyData = null
    return
  }
  renderLobby()
  showTab('join')
  renderRooms()
  $('joinForm').scrollIntoView({ block: 'nearest' }) // bấm Vào ở danh sách / link mời: đưa ô nhập tên vào tầm nhìn (điện thoại: nằm trên danh sách)
}

function renderLobby() {
  $('joinRoomName').textContent = state.lobbyData.name
  $('joinRoomCode').textContent = `· mã ${state.lobbyData.code}${state.lobbyData.status !== 'waiting' ? ' · đang chơi' : ''}`
  const home = $('playerHome')
  if (home.options.length <= 1) home.append(...state.lobbyData.provinces.map(p => el('option', { value: p.id }, p.name)))
  // Phòng đơn: không chọn team — mỗi người một hành trình
  const solo = state.lobbyData.mode === 'solo'
  $('ownerNote').hidden = !createdCode || createdCode !== state.lobbyData.code
  $('teamPick').hidden = $('teamPickLabel').hidden = solo
  $('soloNote').hidden = !solo
  $('soloNote').textContent = !solo ? ''
    : `Phòng chơi đơn · ${state.lobbyData.players}/${state.lobbyData.maxPlayers} người. Tên của bạn hiện trên màn chiếu (chủ phòng có thể sửa).`
      + (state.lobbyData.preset && !state.lobbyData.hasHost ? ' Phòng chưa có chủ phòng — bạn vào trước sẽ làm chủ phòng: bắt đầu trận, tung sự kiện, sửa tên.' : '')
  $('homeNoteText').textContent = solo
    ? 'Có tem ở tỉnh quê của bạn được +50 "Về quê". Chỉ bạn thấy quê của mình; không đổi được sau khi trận bắt đầu.'
    : 'Team cắm cờ ở tỉnh quê của bạn được +50 "Về quê" (tối đa 3 tỉnh mỗi team). Chỉ đồng đội thấy quê của bạn; không đổi được sau khi trận bắt đầu.'
  const selected = $('teamPick').querySelector('input:checked')?.value
  $('teamPick').replaceChildren(...state.lobbyData.teams.map(t => {
    const full = t.members >= state.lobbyData.maxPlayersPerTeam
    const input = el('input', { type: 'radio', name: 'team', value: String(t.id), required: true, disabled: full, checked: selected === String(t.id) })
    return el('label', { class: full ? 'team-option full' : 'team-option' },
      input, mascotIcon(t.mascot, t.color, 30), el('b', {}, t.name), el('span', { class: 'muted' }, full ? 'Đủ người' : `${t.members} người`))
  }))
}

$('lookupForm').addEventListener('submit', e => {
  e.preventDefault()
  lookup($('roomCode').value.trim())
})
$('joinBack').addEventListener('click', () => {
  state.lobbyData = null
  showTab('join')
  renderRooms()
})
$('joinForm').addEventListener('submit', async e => {
  e.preventDefault()
  $('joinError').textContent = ''
  const solo = state.lobbyData.mode === 'solo'
  const teamId = solo ? null : Number($('teamPick').querySelector('input:checked')?.value)
  if (!solo && !teamId) return void ($('joinError').textContent = 'Chọn một team')
  try {
    await api('/api/join', { code: state.lobbyData.code, name: $('playerName').value.trim(), teamId, home: $('playerHome').value })
    state.lobbyData = null
    await enter()
  } catch (err) {
    $('joinError').textContent = err.message
    if (['team-full', 'no-team', 'room-full'].includes(err.code)) lookup(state.lobbyData.code)
  }
})

// Kiểu phòng: chơi đơn thì không có số team, thêm tùy chọn tem Tiên phong; Team gọn thêm tùy chọn Cho đấu, mặc định 30 phút
const formMode = () => $('createForm').querySelector('input[name="mode"]:checked')?.value ?? 'team'
const soloMode = () => formMode() === 'solo'
function syncMode() {
  const mode = formMode()
  $('teamCountField').hidden = mode === 'solo'
  $('pioneerField').hidden = mode !== 'solo'
  $('duelField').hidden = mode !== 'compact'
  for (const d of $('modeExplain').querySelectorAll('[data-mode]')) d.hidden = d.dataset.mode !== mode
}
$('createForm').addEventListener('change', e => {
  if (e.target.name !== 'mode') return
  $('newDuration').value = e.target.value === 'compact' ? '30' : '45'
  $('newDuration').dispatchEvent(new Event('change')) // ô chọn sticker (shared/select.js) vẽ lại theo giá trị mới
  syncMode()
})

$('createForm').addEventListener('submit', async e => {
  e.preventDefault()
  $('createError').textContent = ''
  try {
    const r = await api('/api/rooms', {
      name: $('newRoomName').value.trim(),
      teamCount: Number($('newTeamCount').value),
      durationMin: Number($('newDuration').value),
      topicChoice: $('newTopicChoice').checked,
      betChoice: $('newBetChoice').checked,
      mode: formMode(),
      duel: $('newDuel').checked,
      pioneer: $('newPioneer').checked,
      quizCount: Number($('newQuizCount').value),
      listed: $('createForm').querySelector('input[name="access"]:checked')?.value === 'public',
    })
    created = true
    createdCode = r.code
    showTab('create')
    $('createdCode').textContent = r.code
    $('createdLink').textContent = `${location.origin}/?room=${r.code}`
    $('createdOwnerKey').textContent = r.ownerKey
    $('createdScreenCode').textContent = r.screenCode
    loadRooms()
  } catch (err) {
    $('createError').textContent = err.message
  }
})

export async function enter() {
  await requireRole('player')
  const view = await api('/api/me')
  $('entry').hidden = true
  $('app').hidden = false
  if (!state.map) {
    const [geo, provinces] = await Promise.all([
      fetch('/data/map-geo.json', { cache: 'no-store' }).then(r => r.json()),
      api('/api/provinces'),
    ])
    state.map = createMap($('mapWrap'), { geo, provinces, onSelect: moveTo, tipExtra })
  }
  state.notes = []
  state.me = null
  apply(view)
  state.stream = connectStream({
    view: 'team',
    onState: apply,
    onStatus: s => { $('conn').hidden = s === 'online' },
    onUnauthorized: () => showEntry('Bạn đã rời phòng hoặc phiên đã hết hạn. Vào lại bằng đúng tên + team cũ để tiếp tục.'),
  })
}

// Thoát: giữ chỗ trong team (vào lại bằng đúng tên + team). Trước khi bắt đầu thì rời hẳn để đổi team được.
$('logoutBtn').addEventListener('click', async () => {
  const code = state.me?.room.code
  try {
    const r = await api(state.me?.status === 'waiting' ? '/api/leave' : '/api/logout', {})
    if (r?.owner) createdCode = code // người tạo phòng đổi team: vẫn là chủ phòng khi vào lại
  } catch {}
  showEntry()
  if (code) lookup(code)
})

// Danh sách phòng đang mở tự cập nhật số người khi đang ở trang chủ
setInterval(() => { if (!$('entry').hidden && !state.lobbyData) loadRooms() }, 10_000)

// Người tạo phòng vào chơi luôn: sang bước nhập tên / chọn team của phòng vừa tạo (server thấy phiên chủ phòng → giữ quyền chủ phòng)
$('playNowBtn').addEventListener('click', () => lookup(createdCode))

// Người tạo phòng mở màn chơi từ trang chủ phòng ("Vào chơi"): hiện dòng nhắc vẫn giữ quyền chủ phòng
export function markOwnerRoom(code) { createdCode = code.toUpperCase() }
