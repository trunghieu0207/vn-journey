// Trang quản trị (/quan-tri): đăng nhập tài khoản admin, tổng quan, mọi phòng (tạo / sửa / xem mã / điều khiển / xóa),
// người chơi, bảng xếp hạng cá nhân, tài khoản admin, nhật ký. Dữ liệu động đưa vào bằng textContent (el()), không innerHTML.

import { api } from '/shared/api.js'
import { $, el, button } from '/shared/dom.js'
import { icon, fillIcons, ICON_NAMES } from '/shared/icons.js'
import { mascotIcon } from '/shared/mascots.js'

const REFRESH_MS = 10_000
const state = { me: null, sec: 'dash', rooms: [], players: [], board: [], admins: [], timer: null,
  q: { list: [], topics: {}, provinces: [], province: '', current: null, loaded: false }, settings: null }
const Q_TARGET = 30 // mục tiêu mỗi tỉnh: 22 câu thường + 8 câu thử tài
const Q_SHOW = 150  // số dòng hiện một lúc (910 câu — lọc / tìm để thu hẹp)
const fmt = n => Number(n).toLocaleString('vi-VN')
const clock = t => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
const when = t => {
  if (!t) return '—'
  const d = new Date(t), today = new Date().toDateString() === d.toDateString()
  return today ? `hôm nay ${clock(t)}` : `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${clock(t)}`
}
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

// ---------- Thông báo + hộp thoại ----------
let toastTimer = null
function toast(msg, bad = false) {
  const t = $('toast')
  t.textContent = msg
  t.classList.toggle('bad', bad)
  t.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { t.hidden = true }, 3200)
}

/**
 * Hộp thoại: body = phần tử nội dung; onOk(form) trả về false để giữ hộp mở (vd. lỗi kiểm tra), ném lỗi thì hiện lỗi.
 * okText null = chỉ có nút Đóng.
 */
function dialog({ title, body, okText = 'OK', danger = false, onOk = () => {} }) {
  const dlg = $('dlg')
  $('dlgTitle').textContent = title
  $('dlgBody').replaceChildren(body)
  $('dlgError').textContent = ''
  $('dlgYes').hidden = okText == null
  $('dlgYes').textContent = okText ?? ''
  $('dlgYes').className = `btn ${danger ? 'danger' : 'green'}`
  $('dlgNo').textContent = okText == null ? 'Đóng' : 'Hủy'
  $('dlgNo').onclick = () => dlg.close()
  $('dlgForm').onsubmit = async e => {
    e.preventDefault()
    $('dlgYes').disabled = true
    try {
      if ((await onOk()) !== false) dlg.close()
    } catch (err) {
      $('dlgError').textContent = err.message
    } finally {
      $('dlgYes').disabled = false
    }
  }
  dlg.showModal()
  ;(body.querySelector('input, select') ?? $(okText == null ? 'dlgNo' : 'dlgYes')).focus()
}
const confirmBox = (title, text, okText, onOk) => dialog({ title, body: el('p', {}, text), okText, danger: true, onOk })

async function act(fn, okMsg) {
  try {
    const r = await fn()
    if (okMsg) toast(okMsg)
    await refresh()
    return r
  } catch (err) {
    toast(err.message, true)
  }
}

// ---------- Đăng nhập / đổi mật khẩu ----------
function show(view) {
  $('bootMsg').hidden = true
  for (const id of ['entry', 'pwView', 'app']) $(id).hidden = id !== view
}

async function boot() {
  fillIcons()
  const { admin } = await api('/api/sys/session').catch(() => ({ admin: null }))
  state.me = admin
  if (!admin) return showEntry()
  if (admin.mustChange) return showPassword(true)
  enterApp()
}

function showEntry(message = '') {
  stopTimer()
  show('entry')
  $('loginError').textContent = message
  $('username').focus()
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault()
  $('loginError').textContent = ''
  try {
    await api('/api/sys/login', { username: $('username').value.trim(), password: $('password').value })
    $('password').value = ''
    boot()
  } catch (err) {
    $('loginError').textContent = err.message
  }
})

function showPassword(forced) {
  stopTimer()
  show('pwView')
  $('pwHint').hidden = !forced
  $('pwCancel').hidden = forced
  $('pwError').textContent = ''
  $('pwForm').reset()
  $('pwCurrent').focus()
}

$('pwForm').addEventListener('submit', async e => {
  e.preventDefault()
  if ($('pwNext').value !== $('pwAgain').value) return void ($('pwError').textContent = 'Hai lần nhập mật khẩu mới không khớp')
  try {
    await api('/api/sys/password', { current: $('pwCurrent').value, next: $('pwNext').value })
    $('pwForm').reset()
    toast('Đã đổi mật khẩu')
    boot()
  } catch (err) {
    $('pwError').textContent = err.message
  }
})
$('pwCancel').addEventListener('click', () => enterApp())
$('pwBtn').addEventListener('click', () => showPassword(false))
$('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/sys/logout', {}) } catch {}
  showEntry()
})

function enterApp() {
  show('app')
  $('meName').textContent = state.me.displayName
  $('meUser').textContent = state.me.username
  go(state.sec)
}

// ---------- Điều hướng + làm mới ----------
const LOADERS = { dash: loadDash, rooms: loadRooms, players: loadPlayers, questions: loadQuestions, board: loadBoard, system: loadSystem, settings: loadSettings, accounts: loadAccounts, log: loadLog }
// Mục không tự làm mới 10 giây (đang sửa dở thì không bị vẽ lại)
const NO_POLL = new Set(['questions', 'settings', 'accounts'])

function go(sec) {
  state.sec = sec
  for (const b of document.querySelectorAll('.qt-nav')) b.classList.toggle('on', b.dataset.sec === sec)
  for (const s of document.querySelectorAll('.qt-sec')) s.classList.toggle('on', s.id === `sec-${sec}`)
  stopTimer()
  refresh()
  if (!NO_POLL.has(sec)) state.timer = setInterval(() => { if (!document.hidden && !$('dlg').open) refresh() }, REFRESH_MS)
}
function stopTimer() {
  clearInterval(state.timer)
  state.timer = null
}

async function refresh() {
  try {
    await LOADERS[state.sec]()
    $('conn').hidden = true
  } catch (err) {
    if (err.status === 401) return showEntry('Phiên đã hết hạn, đăng nhập lại.')
    if (err.code === 'must-change') return showPassword(true)
    $('conn').hidden = err.status !== 0
    if (err.status !== 0) toast(err.message, true)
  }
}

document.addEventListener('click', e => {
  const nav = e.target.closest('[data-sec]')
  if (nav) return go(nav.dataset.sec)
  const link = e.target.closest('[data-go]')
  if (link) return go(link.dataset.go)
  const seg = e.target.closest('.seg button')
  if (seg) {
    for (const b of seg.parentElement.querySelectorAll('button')) b.classList.toggle('on', b === seg)
    renderSection()
  }
})
for (const id of ['roomSearch', 'playerSearch', 'boardSearch', 'playerRoom', 'qTopic', 'qDiff', 'qSrc', 'qSearch']) $(id).addEventListener('input', () => renderSection())
const segValue = id => $(id).querySelector('.on')?.dataset.v ?? ''
function renderSection() {
  ;({ rooms: renderRooms, players: renderPlayers, board: renderBoard, questions: renderQuestions }[state.sec] ?? (() => {}))()
}

// ---------- Tổng quan ----------
async function loadDash() {
  const v = await api('/api/sys/overview')
  $('dashTime').textContent = `${new Date(v.serverNow).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })} · ${clock(v.serverNow)} · tự cập nhật 10 giây`
  const kpi = (ic, label, value, sub, cls = '') =>
    el('div', { class: `kpi ${cls}` }, el('span', { class: 't' }, icon(ic), label), el('b', {}, fmt(value)), el('small', {}, sub))
  $('kpis').replaceChildren(
    kpi('play', 'Phòng đang chơi', v.rooms.running, 'gồm cả đang tạm dừng', 'good'),
    kpi('timer', 'Phòng đang chờ', v.rooms.waiting, `tối đa ${v.rooms.max} phòng mở`),
    kpi('finish', 'Phòng đã xong', v.rooms.ended, 'tự xóa sau 24 giờ'),
    kpi('flag', 'Người chơi', v.players, 'trong mọi phòng'),
    kpi('screen', 'Kết nối realtime', v.online, 'trang đang mở', 'good'),
    kpi('trophy', 'Lượt chơi đơn hôm nay', v.playsToday, 'đã ghi bảng xếp hạng'),
  )
  renderLog($('dashLog'), v.log)
  const q = v.questions
  const todo = (cls, text, sub, sec) => el('div', { class: 'todo' }, el('span', { class: `dot ${cls}` }),
    el('div', {}, el('p', {}, text), el('small', {}, sub)), sec ? button('Mở', 'sm', () => go(sec)) : '')
  const items = [
    v.flaggedNames && todo('', `${v.flaggedNames} tên người chơi chứa từ cấm`, 'Mục Người chơi / Bảng xếp hạng có gắn cờ', 'players'),
    q.fix && todo('', `${q.fix} câu hỏi đánh dấu "Cần sửa"`, 'Lọc "Cần sửa" ở mục Câu hỏi', 'questions'),
    q.weakSources && todo('y', `${q.weakSources} câu hỏi chưa đủ 2 nguồn`, 'Luật nguồn: ≥ 2 nguồn độc lập, ít nhất 1 nguồn chính thống', 'questions'),
    q.total - q.approved - q.hidden > 0 && todo('y', `${q.total - q.approved - q.hidden} câu hỏi chưa duyệt`, `Đã duyệt ${q.approved}/${q.total}`, 'questions'),
  ].filter(Boolean)
  $('todos').replaceChildren(...(items.length ? items : [el('p', { class: 'muted' }, 'Không có việc gì cần xử lý.')]))
}

// ---------- Phòng ----------
async function loadRooms() {
  state.rooms = await api('/api/sys/rooms')
  const active = state.rooms.filter(r => r.status !== 'ended').length
  $('navRooms').textContent = state.rooms.length || ''
  $('roomsSub').textContent = `${state.rooms.length} phòng · ${active} chưa xong · gồm cả phòng riêng tư`
  renderRooms()
}

const STATUS = { waiting: ['wait', 'Đang chờ'], running: ['run', 'Đang chơi'], paused: ['wait', 'Tạm dừng'], ended: ['end', 'Đã xong'] }
const tag = (cls, text) => el('span', { class: `tag ${cls}` }, text)
// Kiểu phòng hiển thị: Team gọn lưu là phòng team (compact)
const roomKind = r => (r.compact ? 'compact' : r.mode)
const modeTag = r => r.mode === 'solo' ? tag('solo', 'Chơi đơn') : r.compact ? tag('team', r.duel ? 'Team gọn · có đấu' : 'Team gọn') : tag('team', 'Theo team')
function roomTime(r) {
  if (r.status === 'waiting') return `${r.durationMin} phút`
  if (r.status === 'ended') return `xong ${clock(r.endsAt ?? r.createdAt)}`
  const left = (r.pausedAt ? r.endsAt - r.pausedAt : r.endsAt - Date.now()) / 60_000
  return `còn ${Math.max(0, Math.ceil(left))} phút`
}

function renderRooms() {
  const st = segValue('roomStatus'), mode = segValue('roomMode'), q = norm($('roomSearch').value.trim())
  const rows = state.rooms.filter(r => (!st || (st === 'run' ? ['running', 'paused'].includes(r.status) : r.status === st))
    && (!mode || roomKind(r) === mode) && (!q || norm(`${r.name} ${r.code}`).includes(q)))
  $('roomRows').replaceChildren(...rows.map(r => el('tr', {},
    el('td', { class: 'mono' }, r.code),
    el('td', {}, r.name, r.preset ? tag('', 'có sẵn') : ''),
    el('td', {}, modeTag(r)),
    el('td', {}, tag(...STATUS[r.status])),
    el('td', { class: 'r' }, `${r.players}${r.online ? ` · ${r.online} mở` : ''}`),
    el('td', { class: 'muted' }, roomTime(r)),
    el('td', {}, r.listed || r.preset ? tag('', 'Công khai') : tag('priv', 'Riêng tư')),
    el('td', {}, el('div', { class: 'acts' },
      button('Điều khiển', 'primary sm', () => controlRoom(r)),
      button('Mã', 'sm', () => showCodes(r)),
      button('Sửa', 'sm', () => roomForm(r)),
      button('Xóa', 'sm', () => confirmBox('Xóa phòng?', `Xóa hẳn phòng "${r.name}" (${r.code}) cùng ${r.players} người chơi. Không hoàn tác được. Bảng xếp hạng cá nhân đã ghi vẫn giữ.`, 'Xóa phòng',
        () => act(() => api('/api/sys/room/delete', { roomId: r.id }), 'Đã xóa phòng'))),
    )),
  )))
  if (!rows.length) $('roomRows').append(emptyRow(8, state.rooms.length ? 'Không có phòng khớp bộ lọc.' : 'Chưa có phòng nào.'))
}
const emptyRow = (cols, text) => el('tr', {}, el('td', { colspan: cols, class: 'muted empty' }, text))

async function controlRoom(r) {
  try {
    await api('/api/sys/room/control', { roomId: r.id })
    location.href = '/admin.html?from=quan-tri' // trang chủ phòng — đủ chức năng điều khiển trận; nút Quay lại của trình duyệt về đây
  } catch (err) {
    toast(err.message, true)
  }
}

function codeRow(label, value, note = '') {
  const v = value ?? '—'
  return el('div', { class: 'code' }, el('span', { class: 'k' }, label), el('b', {}, v),
    value ? button('Sao chép', 'sm', () => navigator.clipboard?.writeText(value).then(() => toast('Đã sao chép'))) : el('span', { class: 'muted' }, note))
}

async function showCodes(r) {
  try {
    const c = await api('/api/sys/room/codes', { roomId: r.id })
    const body = el('div', { class: 'codes' },
      codeRow('Mã phòng', c.code),
      codeRow('Link mời', `${location.origin}/?room=${c.code}`),
      codeRow('Mã màn chiếu', c.screenCode),
      codeRow('Mã chủ phòng', c.ownerKey, 'không mở được (phòng tạo trước khi có trang quản trị)'),
      el('p', { class: 'muted hint' }, 'Xem mã được ghi vào nhật ký. Lộ mã chủ phòng thì bấm "Tạo mã chủ phòng mới" — mã cũ và các phiên chủ phòng đang mở hết hiệu lực.'),
      button('Tạo mã chủ phòng mới', 'danger sm', () => confirmBox('Tạo mã chủ phòng mới?', 'Mã cũ hết hiệu lực, ai đang mở trang chủ phòng phòng này sẽ bị đăng xuất.', 'Tạo mã mới',
        async () => {
          const k = await api('/api/sys/room/owner-key', { roomId: r.id })
          toast(`Mã chủ phòng mới: ${k.ownerKey}`)
        })),
    )
    dialog({ title: `Mã của phòng "${r.name}"`, body, okText: null })
  } catch (err) {
    toast(err.message, true)
  }
}

// Form tạo phòng (r = null) hoặc sửa phòng. Đang chơi chỉ sửa tên, hiển thị, đặt cược, chọn chủ đề
function roomForm(r = null) {
  const waiting = !r || r.status === 'waiting'
  const field = (label, input, note = '') => el('label', {}, label, input, note ? el('small', { class: 'lockn' }, note) : '')
  const name = el('input', { class: 'qt-input', maxlength: 40, required: true, value: r?.name ?? '' })
  const mode = el('select', { class: 'qt-input', disabled: !!r }, el('option', { value: 'team' }, 'Theo team'), el('option', { value: 'compact' }, 'Team gọn'),
    el('option', { value: 'solo' }, 'Chơi đơn'))
  mode.value = r ? roomKind(r) : 'team'
  const teams = el('select', { class: 'qt-input', disabled: !!r }, ...[2, 3, 4, 5, 6, 7, 8].map(n => el('option', { value: n }, `${n} team`)))
  teams.value = String(r?.teams || 4)
  const duration = el('input', { class: 'qt-input', type: 'number', min: 10, max: 90, value: r?.durationMin ?? 45, disabled: !waiting })
  const quiz = el('select', { class: 'qt-input', disabled: !waiting }, ...[1, 2, 3].map(n => el('option', { value: n }, `${n} câu`)))
  quiz.value = String(r?.quizCount ?? 1)
  const listed = el('select', { class: 'qt-input', disabled: !!r?.preset }, el('option', { value: '1' }, 'Công khai — hiện ở danh sách phòng'), el('option', { value: '0' }, 'Riêng tư — cần mã phòng'))
  listed.value = r ? (r.listed || r.preset ? '1' : '0') : '0'
  const check = (label, on) => {
    const box = el('input', { type: 'checkbox' })
    box.checked = on
    return [el('label', { class: 'chk' }, box, label), box]
  }
  const [betLabel, bet] = check('Đặt cược (Mạo hiểm)', r?.betChoice ?? true)
  const [topicLabel, topic] = check('Cho chọn chủ đề', r?.topicChoice ?? false)
  const [duelLabel, duel] = check('Cho đấu (thử tài tỉnh team khác)', r?.duel ?? false)
  duel.disabled = !!r
  const teamField = field('Số team', teams, r ? 'Không đổi sau khi tạo' : '')
  const syncMode = () => {
    teamField.hidden = mode.value === 'solo'
    duelLabel.hidden = mode.value !== 'compact'
  }
  mode.addEventListener('change', () => {
    if (!r) duration.value = mode.value === 'compact' ? 30 : 45
    syncMode()
  })
  syncMode()
  const lock = r && !waiting ? 'Khóa khi đã bắt đầu' : ''
  const body = el('div', { class: 'rf' },
    el('label', { class: 'full' }, 'Tên phòng', name),
    field('Kiểu phòng', mode, r ? 'Không đổi sau khi tạo' : ''), teamField,
    field('Thời lượng (phút)', duration, lock), field('Số câu mỗi tỉnh', quiz, lock),
    el('label', { class: 'full' }, 'Hiển thị', listed),
    el('div', { class: 'full chks' }, betLabel, topicLabel, duelLabel),
  )
  dialog({
    title: r ? `Sửa phòng ${r.code}` : 'Tạo phòng', body, okText: r ? 'Lưu' : 'Tạo phòng',
    onOk: async () => {
      const data = { name: name.value, listed: listed.value === '1', betChoice: bet.checked, topicChoice: topic.checked }
      if (waiting) Object.assign(data, { durationMin: Number(duration.value), quizCount: Number(quiz.value) })
      if (r) {
        if (r.preset) delete data.listed
        await api('/api/sys/room/update', { roomId: r.id, ...data })
        toast('Đã lưu phòng')
        return refresh()
      }
      const c = await api('/api/sys/rooms', { ...data, mode: mode.value, duel: duel.checked, teamCount: Number(teams.value) })
      await refresh()
      // Hiện mã ngay sau khi tạo (mã chủ phòng xem lại được ở nút Mã)
      setTimeout(() => dialog({
        title: 'Đã tạo phòng', okText: null,
        body: el('div', { class: 'codes' }, codeRow('Mã phòng', c.code), codeRow('Link mời', `${location.origin}/?room=${c.code}`),
          codeRow('Mã màn chiếu', c.screenCode), codeRow('Mã chủ phòng', c.ownerKey)),
      }), 0)
    },
  })
}
$('newRoomBtn').addEventListener('click', () => roomForm())

// ---------- Người chơi ----------
async function loadPlayers() {
  state.players = await api('/api/sys/players')
  $('navPlayers').textContent = state.players.length || ''
  const online = state.players.filter(p => p.online).length
  $('playersSub').textContent = `${state.players.length} người · ${online} đang trực tuyến`
  const sel = $('playerRoom'), keep = sel.value
  const rooms = [...new Map(state.players.map(p => [p.roomId, `${p.roomName} (${p.roomCode})`]))]
  sel.replaceChildren(el('option', { value: '' }, 'Mọi phòng'), ...rooms.map(([id, label]) => el('option', { value: id }, label)))
  sel.value = rooms.some(([id]) => String(id) === keep) ? keep : ''
  renderPlayers()
}

function avatar(p) {
  if (p.mode === 'solo') return el('span', { class: 'av', 'data-color': p.color }, [...p.name][0]?.toLocaleUpperCase('vi') ?? '?')
  return el('span', { class: 'ms' }, mascotIcon(p.mascot, p.color, 24))
}
function paintAvatars(root) {
  for (const a of root.querySelectorAll('.av[data-color]')) a.style.background = a.dataset.color // CSSOM: CSP chặn thuộc tính style viết sẵn, không chặn gán qua JS
}

function renderPlayers() {
  const only = segValue('playerFilter'), room = $('playerRoom').value, q = norm($('playerSearch').value.trim())
  const rows = state.players.filter(p => (!only || p.online) && (!room || String(p.roomId) === room) && (!q || norm(p.name).includes(q)))
  $('playerRows').replaceChildren(...rows.map(p => el('tr', {},
    el('td', {}, el('span', { class: 'who' }, avatar(p), p.name), p.flagged ? tag('priv', 'từ cấm') : ''),
    el('td', {}, `${p.roomName} `, el('span', { class: 'mono muted' }, p.roomCode)),
    el('td', {}, p.mode === 'solo' ? el('span', { class: 'muted' }, '—') : p.teamName),
    el('td', { class: 'r' }, fmt(p.score)),
    el('td', {}, el('span', { class: `online${p.online ? '' : ' off'}` }), p.online ? 'Trực tuyến' : 'Không mở trang'),
    el('td', { class: 'muted' }, when(p.joinedAt)),
    el('td', {}, el('div', { class: 'acts' },
      button('Sửa tên', 'sm', () => renamePlayer(p)),
      button('Mời ra', 'sm', () => confirmBox('Mời ra khỏi phòng?', `"${p.name}" bị đưa ra khỏi phòng ${p.roomCode} ngay (máy người đó về màn vào phòng).`, 'Mời ra',
        () => act(() => api('/api/sys/player/kick', { playerId: p.id }), 'Đã mời ra'))),
    )),
  )))
  if (!rows.length) $('playerRows').append(emptyRow(7, state.players.length ? 'Không có người chơi khớp bộ lọc.' : 'Chưa có người chơi nào.'))
  paintAvatars($('playerRows'))
}

function nameDialog(title, current, onSave) {
  const input = el('input', { class: 'qt-input', maxlength: 24, value: current, required: true })
  dialog({ title, body: el('label', { class: 'rf-one' }, 'Tên mới', input), okText: 'Lưu', onOk: () => onSave(input.value.trim()) })
}
const renamePlayer = p => nameDialog(`Đổi tên "${p.name}"`, p.name, name => act(() => api('/api/sys/player/rename', { playerId: p.id, name }), 'Đã đổi tên'))

// ---------- Bảng xếp hạng ----------
async function loadBoard() {
  state.board = await api('/api/sys/leaderboard')
  renderBoard()
}

function renderBoard() {
  const only = segValue('boardFilter'), q = norm($('boardSearch').value.trim())
  let rank = 0
  const ranked = state.board.map(e => ({ ...e, rank: e.hidden ? null : ++rank }))
  const rows = ranked.filter(e => (!only || e.hidden) && (!q || norm(e.name).includes(q)))
  $('boardRows').replaceChildren(...rows.map(e => el('tr', { class: e.hidden ? 'dim' : '' },
    el('td', { class: 'r' }, e.rank ?? '—'),
    el('td', {}, e.name, e.hidden ? tag('hide', 'đang ẩn') : '', e.flagged ? tag('priv', 'từ cấm') : ''),
    el('td', { class: 'r' }, fmt(e.score)), el('td', { class: 'r' }, e.stamps), el('td', { class: 'r' }, e.games),
    el('td', { class: 'muted' }, when(e.lastPlayed)),
    el('td', {}, el('div', { class: 'acts' },
      button('Đổi tên', 'sm', () => nameDialog(`Đổi tên "${e.name}" trên bảng xếp hạng`, e.name,
        name => act(() => api('/api/sys/leaderboard/rename', { nameKey: e.nameKey, name }), 'Đã đổi tên'))),
      button(e.hidden ? 'Hiện lại' : 'Ẩn', 'sm', () => act(() => api('/api/sys/leaderboard/hide', { nameKey: e.nameKey, hidden: !e.hidden }), e.hidden ? 'Đã hiện lại' : 'Đã ẩn')),
      button('Xóa', 'sm', () => confirmBox('Xóa khỏi bảng xếp hạng?', `Xóa hẳn ${e.games} trận của "${e.name}". Không hoàn tác được.`, 'Xóa',
        () => act(() => api('/api/sys/leaderboard/delete', { nameKey: e.nameKey }), 'Đã xóa'))),
    )),
  )))
  if (!rows.length) $('boardRows').append(emptyRow(7, state.board.length ? 'Không có tên khớp bộ lọc.' : 'Chưa có trận chơi đơn nào kết thúc.'))
}

// ---------- Tài khoản admin ----------
async function loadAccounts() {
  state.admins = await api('/api/sys/admins')
  $('accSub').textContent = `${state.admins.length} tài khoản · cùng một quyền quản trị`
  $('accRows').replaceChildren(...state.admins.map(a => {
    const self = a.username === state.me.username
    const status = a.disabled ? tag('hide', 'Đã khóa') : a.locked ? tag('priv', 'Khóa tạm (sai mật khẩu)') : a.mustChange ? tag('wait', 'Chưa đổi mật khẩu tạm') : tag('ok', 'Hoạt động')
    return el('tr', {},
      el('td', {}, el('b', {}, a.displayName), self ? tag('team', 'bạn') : ''),
      el('td', { class: 'mono' }, a.username),
      el('td', { class: 'muted' }, when(a.lastLoginAt)),
      el('td', {}, status),
      el('td', {}, el('div', { class: 'acts' }, ...(self ? [button('Đổi mật khẩu', 'sm', () => showPassword(false))] : [
        button('Đặt lại mật khẩu', 'sm', () => confirmBox('Đặt lại mật khẩu?', `${a.displayName} bị đăng xuất và nhận mật khẩu tạm mới.`, 'Đặt lại', async () => {
          const r = await api('/api/sys/admins/reset', { id: a.id })
          await refresh()
          setTimeout(() => tempPasswordDialog(a.username, r.tempPassword), 0)
        })),
        button(a.disabled ? 'Mở khóa' : 'Khóa', 'sm', () => a.disabled
          ? act(() => api('/api/sys/admins/disable', { id: a.id, disabled: false }), 'Đã mở khóa')
          : confirmBox('Khóa tài khoản?', `${a.displayName} bị đăng xuất ngay và không đăng nhập được tới khi mở khóa.`, 'Khóa',
            () => act(() => api('/api/sys/admins/disable', { id: a.id, disabled: true }), 'Đã khóa'))),
      ]))),
    )
  }))
}

function tempPasswordDialog(username, password) {
  dialog({
    title: `Mật khẩu tạm của ${username}`, okText: null,
    body: el('div', { class: 'codes' }, codeRow('Mật khẩu tạm', password),
      el('p', { class: 'muted hint' }, 'Chỉ hiện một lần — gửi riêng cho người đó. Lần đầu đăng nhập phải đổi mật khẩu.')),
  })
}

$('accForm').addEventListener('submit', async e => {
  e.preventDefault()
  $('accError').textContent = ''
  try {
    const r = await api('/api/sys/admins', { username: $('accUser').value.trim(), displayName: $('accName').value.trim() })
    $('accForm').reset()
    await refresh()
    tempPasswordDialog(r.username, r.tempPassword)
  } catch (err) {
    $('accError').textContent = err.message
  }
})

// ---------- Câu hỏi ----------
const LEVELS = { 1: 'Dễ', 2: 'Vừa', 3: 'Khó' }
const QSTATUS = { new: ['wait', 'Chờ duyệt'], fix: ['priv', 'Cần sửa'], ok: ['ok', 'Đã duyệt'] }
const rate = q => (q.answers ? Math.round(q.correct / q.answers * 100) : null)
// Mức đề xuất theo số liệu thật (PLAN 7.9): ≥ 3 lượt; đúng > 70% Dễ, 40–70% Vừa, < 40% Khó
const suggestLevel = q => (q.answers < 3 ? null : q.correct / q.answers > 0.7 ? 1 : q.correct / q.answers >= 0.4 ? 2 : 3)

async function loadQuestions() {
  const r = await api('/api/sys/questions')
  Object.assign(state.q, { list: r.questions, topics: r.topics, provinces: r.provinces })
  if (!state.q.loaded) {
    $('qTopic').append(...Object.entries(r.topics).map(([k, v]) => el('option', { value: k }, v)))
    state.q.loaded = true
  }
  const visible = r.questions.filter(q => !q.hidden)
  $('qSub').textContent = `${fmt(visible.length)} câu đang dùng · ${r.questions.filter(q => q.status === 'ok').length} đã duyệt · ${r.questions.length - visible.length} đang ẩn`
  $('navQuestions').textContent = r.questions.filter(q => q.status === 'fix').length || ''
  renderCoverage()
  renderQuestions()
}

function renderCoverage() {
  const by = new Map(state.q.provinces.map(p => [p.id, { n: 0, weak: 0 }]))
  for (const q of state.q.list) {
    if (q.hidden) continue
    const c = by.get(q.province)
    c.n++
    if (q.sourceCount < 2) c.weak++
  }
  $('cov').replaceChildren(...state.q.provinces.map(p => {
    const c = by.get(p.id)
    const bar = el('i', { class: c.n < Q_TARGET ? 'y' : '' })
    bar.style.width = `${Math.min(100, c.n / Q_TARGET * 100)}%`
    return el('button', { type: 'button', class: state.q.province === p.id ? 'on' : '', title: `${c.n} câu đang dùng · ${c.weak} chưa đủ 2 nguồn`,
      onclick: () => { state.q.province = state.q.province === p.id ? '' : p.id; renderCoverage(); renderQuestions() } },
    el('span', {}, p.name), el('span', { class: 'm' }, bar), el('small', {}, `${c.n}/${Q_TARGET}${c.weak ? ` · ${c.weak} thiếu nguồn` : ''}`))
  }))
}

function renderQuestions() {
  const st = segValue('qStatus'), topic = $('qTopic').value, diff = $('qDiff').value, src = $('qSrc').value, k = norm($('qSearch').value.trim())
  const prov = new Map(state.q.provinces.map(p => [p.id, p.name]))
  const rows = state.q.list.filter(q => (!state.q.province || q.province === state.q.province)
    && (!st || (st === 'hidden' ? q.hidden : !q.hidden && q.status === st)) && (!topic || q.topic === topic) && (!diff || q.difficulty === diff)
    && (src === '' || Math.min(2, q.sourceCount) === Number(src)) && (!k || norm(`${q.id} ${q.content}`).includes(k)))
  $('qRows').replaceChildren(...rows.slice(0, Q_SHOW).map(q => {
    const pct = rate(q)
    const srcBox = el('span', { class: `src${q.sourceCount === 0 ? ' none' : q.sourceCount === 1 ? ' weak' : ''}`, title: `${q.sourceCount} nguồn` },
      ...[0, 1, 2].map(i => el('i', { class: i < q.sourceCount ? 'on' : '' })))
    return el('tr', { class: `click${state.q.current?.id === q.id ? ' sel' : ''}${q.hidden ? ' dim' : ''}`, onclick: () => openQuestion(q.id) },
      el('td', { class: 'mono' }, q.id),
      el('td', {}, el('span', { class: 'qtext' }, q.content), el('small', { class: 'muted' }, `${prov.get(q.province)}${q.difficulty === 'siege' ? ' · thử tài' : ''}`)),
      // Chủ đề chưa có icon riêng (vd. Địa lý) thì hiện tên ngắn
      el('td', {}, el('span', { title: state.q.topics[q.topic] ?? q.topic },
        ICON_NAMES.includes(`topic-${q.topic}`) ? icon(`topic-${q.topic}`) : el('small', { class: 'muted' }, (state.q.topics[q.topic] ?? q.topic).split(/[ ,&]/)[0]))),
      el('td', {}, LEVELS[q.level]),
      el('td', {}, srcBox),
      el('td', { class: `r${pct == null ? '' : pct < 20 ? ' lo' : pct > 85 ? ' hi' : ''}`, title: `${q.answers} lượt trả lời` }, pct == null ? '—' : `${pct}%`),
      el('td', {}, q.hidden ? tag('hide', 'Đang ẩn') : tag(...QSTATUS[q.status])))
  }))
  if (!rows.length) $('qRows').append(emptyRow(7, 'Không có câu nào khớp bộ lọc.'))
  $('qMore').textContent = rows.length > Q_SHOW ? `Đang hiện ${Q_SHOW}/${fmt(rows.length)} câu — chọn tỉnh ở trên hoặc tìm để thu hẹp.` : `${fmt(rows.length)} câu`
}

async function openQuestion(id) {
  try {
    const q = await api('/api/sys/question/get', { id })
    state.q.current = q
    renderQuestions()
    renderEditor(q)
  } catch (err) {
    toast(err.message, true)
  }
}
$('qNew').addEventListener('click', () => {
  state.q.current = null
  renderQuestions()
  renderEditor({ province: state.q.province || state.q.provinces[0]?.id, difficulty: 'normal', topic: 'am-thuc', kind: 'choice', level: 2,
    content: '', options: ['', '', '', ''], answer: 0, explanation: '', sources: [], status: 'new' })
})

// Trình sửa: đọc lại toàn bộ form khi lưu; kiểm tra nhanh ngay khi gõ (server kiểm tra lại đầy đủ)
function renderEditor(q) {
  const isNew = !q.id
  const sel = (opts, value, attrs = {}) => {
    const s = el('select', { class: 'qt-input', ...attrs }, ...opts.map(([v, t]) => el('option', { value: v }, t)))
    s.value = String(value)
    return s
  }
  const field = (label, input, cls = '') => el('label', { class: cls }, label, input)
  const province = sel(state.q.provinces.map(p => [p.id, p.name]), q.province, { disabled: !isNew })
  const difficulty = sel([['normal', 'Câu thường'], ['siege', 'Câu thử tài']], q.difficulty, { disabled: !isNew })
  const topic = sel(Object.entries(state.q.topics), q.topic)
  const level = sel(Object.entries(LEVELS), q.level)
  const kind = sel([['choice', 'Trắc nghiệm'], ['truefalse', 'Đúng / Sai'], ['text', 'Tự điền']], q.kind)
  const status = sel(Object.entries(QSTATUS).map(([k, [, t]]) => [k, t]), q.status)
  const content = el('textarea', { class: 'qt-input wide', rows: 3, maxlength: 500 })
  content.value = q.content
  const explanation = el('textarea', { class: 'qt-input wide', rows: 3, maxlength: 800 })
  explanation.value = q.explanation ?? ''
  const sources = el('textarea', { class: 'qt-input wide', rows: 3, placeholder: 'Mỗi dòng một link https://…' })
  sources.value = (q.sources ?? []).join('\n')

  // Phần đáp án đổi theo kiểu câu
  const answerBox = el('div', { class: 'answers' })
  let opts = q.kind === 'choice' ? [...q.options, '', '', '', ''].slice(0, 4) : ['', '', '', '']
  let right = q.kind === 'choice' ? q.answer : 0
  let tf = q.kind === 'truefalse' ? q.answer : true
  let texts = q.kind === 'text' ? q.answer.join('\n') : ''
  function drawAnswers() {
    if (kind.value === 'choice') {
      answerBox.replaceChildren(el('span', { class: 'lbl' }, 'Lựa chọn — chấm tròn là đáp án đúng (2–4 lựa chọn)'), ...opts.map((o, i) => {
        const radio = el('input', { type: 'radio', name: 'qRight', 'aria-label': `Đáp án đúng ${i + 1}` })
        radio.checked = i === right
        radio.addEventListener('change', () => { right = i; drawAnswers(); check() })
        const input = el('input', { class: 'qt-input', maxlength: 120, value: o, 'aria-label': `Lựa chọn ${i + 1}` })
        input.addEventListener('input', () => { opts[i] = input.value; check() })
        return el('div', { class: `opt${i === right ? ' right' : ''}` }, radio, input)
      }))
    } else if (kind.value === 'truefalse') {
      const pick = sel([['true', 'Đúng'], ['false', 'Sai']], tf)
      pick.addEventListener('change', () => { tf = pick.value === 'true' })
      answerBox.replaceChildren(field('Đáp án', pick))
    } else {
      const area = el('textarea', { class: 'qt-input wide', rows: 3, placeholder: 'Mỗi dòng một cách viết được chấp nhận (không phân biệt dấu, hoa thường)' })
      area.value = texts
      area.addEventListener('input', () => { texts = area.value; check() })
      answerBox.replaceChildren(field('Đáp án chấp nhận', area))
    }
  }
  kind.addEventListener('change', () => { drawAnswers(); check() })
  drawAnswers()

  const checks = el('div', { class: 'checks' })
  const warnBox = el('div', { class: 'checks' })
  warnBox.hidden = true
  const links = () => sources.value.split('\n').map(s => s.trim()).filter(Boolean)
  function check() {
    const list = links()
    const https = list.every(u => /^https:\/\/\S+$/.test(u))
    const correct = kind.value === 'choice' ? [opts[right] ?? ''] : kind.value === 'text' ? texts.split('\n') : []
    const leak = correct.some(a => a.trim().length >= 3 && norm(content.value).includes(norm(a.trim()))) || /\([^)]*cũ\)/i.test(content.value)
    checks.replaceChildren(
      el('span', { class: list.length >= 2 ? 'ok' : 'bad' }, list.length >= 2 ? `✓ ${list.length} nguồn` : `✕ Mới ${list.length} nguồn — cần ≥ 2 nguồn độc lập`),
      el('span', { class: https ? 'ok' : 'bad' }, https ? '✓ Link đều https' : '✕ Có link không phải https'),
      el('span', { class: leak ? 'bad' : 'ok' }, leak ? '✕ Có thể lộ đáp án (đáp án nằm trong câu hỏi, hoặc có "(… cũ)")' : '✓ Không thấy lộ đáp án'),
    )
  }
  for (const i of [content, sources]) i.addEventListener('input', check)
  check()

  // Số liệu thật + mức đề xuất
  const stat = state.q.list.find(x => x.id === q.id)
  const stats = el('div', { class: 'qstat' })
  if (stat) {
    const pct = rate(stat), sug = suggestLevel(stat)
    stats.append(el('span', {}, 'Đã phát ', el('b', {}, fmt(stat.asked)), ' lần'), el('span', {}, 'Trả lời ', el('b', {}, fmt(stat.answers))),
      el('span', {}, 'Đúng ', el('b', {}, pct == null ? '—' : `${pct}%`)))
    if (sug && sug !== q.level) {
      stats.append(el('span', { class: 'suggest' }, `Đề xuất mức ${LEVELS[sug]} (theo số liệu thật) `,
        button('Áp dụng', 'sm', () => { level.value = String(sug); toast(`Đã chọn mức ${LEVELS[sug]} — bấm Lưu để ghi`) })))
    }
  }

  async function save() {
    const body = { id: q.id, province: province.value, difficulty: difficulty.value, topic: topic.value, kind: kind.value, level: Number(level.value),
      content: content.value, explanation: explanation.value, sources: links(), status: status.value }
    if (kind.value === 'choice') {
      // Bỏ ô trống ở cuối, giữ đúng vị trí đáp án
      const filled = opts.map(o => o.trim())
      while (filled.length > 2 && !filled.at(-1) && right < filled.length - 1) filled.pop()
      Object.assign(body, { options: filled, answer: right })
    } else if (kind.value === 'truefalse') body.answer = tf
    else body.answer = texts.split('\n').map(s => s.trim()).filter(Boolean)
    try {
      const r = await api('/api/sys/question/save', body)
      warnBox.hidden = !r.warnings.length
      warnBox.replaceChildren(...r.warnings.map(w => el('span', { class: 'mid' }, `! ${w}`)))
      toast(isNew ? `Đã thêm câu ${r.id}` : 'Đã lưu')
      await loadQuestions()
      const fresh = await api('/api/sys/question/get', { id: r.id })
      state.q.current = fresh
      renderQuestions()
      if (isNew || !r.warnings.length) renderEditor(fresh)
    } catch (err) {
      toast(err.message, true)
    }
  }

  const head = el('div', { class: 'hd' }, el('b', {}, isNew ? 'Thêm câu' : 'Sửa câu'), el('span', { class: 'mono muted' }, q.id ?? 'mã tự đặt'),
    q.hidden ? tag('hide', 'Đang ẩn') : '', q.updatedBy ? el('small', { class: 'muted' }, `sửa bởi ${q.updatedBy} · ${when(q.updatedAt)}`) : '')
  const actions = el('div', { class: 'btn-row' }, button(isNew ? 'Thêm câu' : 'Lưu', 'green', save),
    !isNew ? button(q.hidden ? 'Hiện lại' : 'Ẩn câu', '', async () => {
      try {
        await api('/api/sys/question/hide', { id: q.id, hidden: !q.hidden })
        toast(q.hidden ? 'Đã hiện lại' : 'Đã ẩn — không phát cho phòng nào nữa')
        await loadQuestions()
        openQuestion(q.id)
      } catch (err) {
        toast(err.message, true)
      }
    }) : '')
  $('qEditor').replaceChildren(head,
    el('div', { class: 'row3' }, field('Tỉnh', province), field('Loại', difficulty), field('Trạng thái', status)),
    el('div', { class: 'row3' }, field('Chủ đề', topic), field('Mức', level), field('Kiểu câu', kind)),
    field('Nội dung', content), answerBox, field('Lời giải (người chơi thấy sau khi trả lời đúng)', explanation),
    field('Nguồn kiểm chứng', sources), checks, warnBox, stats, actions,
    !isNew ? el('p', { class: 'muted hint' }, 'Đổi tỉnh / loại câu: thêm câu mới rồi ẩn câu này.') : '')
}
$('qEditor').addEventListener('submit', e => e.preventDefault())

// ---------- Hệ thống ----------
const bytes = n => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)
function duration(ms) {
  const m = Math.floor(ms / 60_000), h = Math.floor(m / 60)
  return h ? `${h} giờ ${m % 60} phút` : `${m} phút`
}

async function loadSystem() {
  const v = await api('/api/sys/system')
  $('sysSub').textContent = `Server chạy ${duration(v.serverNow - v.startedAt)} · Node ${v.node} · tự cập nhật 10 giây`
  $('navSystem').textContent = v.errors.length + v.blocks.length || ''
  const kpi = (label, value, sub, cls = '') => el('div', { class: `kpi ${cls}` }, el('span', { class: 't' }, label), el('b', {}, value), sub)
  const spark = el('div', { class: 'spark' }, ...v.requests.map(n => {
    const i = el('i')
    i.style.height = `${Math.max(4, n / Math.max(1, ...v.requests) * 100)}%`
    return i
  }))
  $('sysKpis').replaceChildren(
    kpi('Kết nối realtime', fmt(v.connections), el('small', {}, 'trang đang mở'), 'good'),
    kpi('Yêu cầu / phút', fmt(v.requests.at(-2) ?? 0), spark),
    kpi('Thời gian phản hồi', v.responseMs ? `${Math.round(v.responseMs.median)} ms` : '—', el('small', {}, v.responseMs ? `95%: ${Math.round(v.responseMs.p95)} ms · chậm nhất ${Math.round(v.responseMs.max)} ms` : 'chưa có số liệu')),
    kpi('Bộ nhớ server', bytes(v.memory.rss), el('small', {}, `máy còn trống ${bytes(v.memory.free)} / ${bytes(v.memory.total)}`)),
    kpi('Bị chặn (15 phút)', fmt(v.blocks.reduce((s, b) => s + b.count, 0)), el('small', {}, `${v.blocks.length} nguồn`), v.blocks.length ? 'warn' : ''),
    kpi('Lỗi máy chủ', fmt(v.errors.length), el('small', {}, 'từ lúc khởi động'), v.errors.length ? 'warn' : ''),
  )
  $('errRows').replaceChildren(...(v.errors.length ? v.errors.map(e => el('div', { class: 'err' }, el('time', { class: 'muted' }, when(e.at)),
    el('span', { class: 'mono' }, `${e.method} ${e.path}`), el('code', {}, e.message))) : [el('p', { class: 'muted' }, 'Chưa có lỗi nào.')]))
  $('blockRows').replaceChildren(...v.blocks.map(b => el('tr', {},
    el('td', { class: 'mono' }, b.key.startsWith('t:') ? 'một phiên đăng nhập' : b.key.replace(/^ip:/, '')),
    el('td', {}, b.label), el('td', { class: 'r' }, fmt(b.count)), el('td', { class: 'muted' }, when(b.last)),
    el('td', {}, el('div', { class: 'acts' }, button('Bỏ chặn', 'sm', () => act(() => api('/api/sys/system/unblock', { limiter: b.limiter, key: b.key }), 'Đã bỏ chặn')))))))
  if (!v.blocks.length) $('blockRows').append(emptyRow(5, 'Không ai bị chặn.'))
  const row = (label, sub, extra = '') => el('div', { class: 'set-row' }, el('span', {}, label, el('small', {}, sub)), extra)
  $('dataRows').replaceChildren(
    v.db ? row('Database', `var/game.db · ${bytes(v.db.size)} · WAL ${bytes(v.db.wal)}`) : row('Database', 'không rõ (chạy trong test)'),
    row('Sao lưu tự động', v.backups.length ? `${v.backups.length} bản · gần nhất ${when(v.backups[0].at)} · ${bytes(v.backups[0].size)}` : 'chưa có bản nào (5 phút sau khi server chạy)',
      el('a', { class: 'btn sm', href: '/api/sys/backup' }, 'Tải bản mới nhất')),
  )
}

// ---------- Cài đặt ----------
async function loadSettings() {
  state.settings = await api('/api/sys/settings')
  const s = state.settings
  $('setCreate').checked = s.allowCreate
  $('setPreset').checked = s.presetRooms
  $('setCompact').checked = s.allowCompact
  $('setNotice').value = s.notice
  $('setNoticeOn').checked = s.noticeOn
  $('words').replaceChildren(...(s.bannedWords.length ? s.bannedWords.map(w => el('span', { class: 'tag word' }, w,
    el('button', { type: 'button', 'aria-label': `Bỏ từ ${w}`, onclick: () => saveSettings({ bannedWords: s.bannedWords.filter(x => x !== w) }, 'Đã bỏ từ') }, '✕')))
    : [el('span', { class: 'muted' }, 'Chưa có từ nào.')]))
}
async function saveSettings(patch, msg = 'Đã lưu cài đặt') {
  try {
    state.settings = await api('/api/sys/settings', patch)
    toast(msg)
  } catch (err) {
    toast(err.message, true)
  }
  loadSettings()
}
$('setCreate').addEventListener('change', e => saveSettings({ allowCreate: e.target.checked }, e.target.checked ? 'Đã mở lại tạo phòng' : 'Đã tắt tạo phòng cho mọi người'))
$('setPreset').addEventListener('change', e => saveSettings({ presetRooms: e.target.checked }))
$('setCompact').addEventListener('change', e => saveSettings({ allowCompact: e.target.checked }, e.target.checked ? 'Đã mở kiểu phòng Team gọn' : 'Đã tắt kiểu phòng Team gọn'))
$('saveNotice').addEventListener('click', () => saveSettings({ notice: $('setNotice').value, noticeOn: $('setNoticeOn').checked }, 'Đã lưu thông báo'))
$('setNoticeOn').addEventListener('change', e => saveSettings({ notice: $('setNotice').value, noticeOn: e.target.checked }, e.target.checked ? 'Đang hiện thông báo' : 'Đã tắt thông báo'))
$('wordForm').addEventListener('submit', e => {
  e.preventDefault()
  const w = $('wordInput').value.trim()
  if (!w) return
  $('wordInput').value = ''
  saveSettings({ bannedWords: [...(state.settings?.bannedWords ?? []), w] }, 'Đã thêm từ')
})
$('delEnded').addEventListener('click', () => confirmBox('Xóa mọi phòng đã kết thúc?', 'Xóa hẳn các phòng đã kết thúc cùng người chơi trong đó. Bảng xếp hạng cá nhân giữ nguyên.', 'Xóa',
  async () => { const r = await api('/api/sys/rooms/delete-ended', {}); toast(`Đã xóa ${r.deleted} phòng`) }))

// ---------- Nhật ký ----------
async function loadLog() {
  renderLog($('logRows'), await api('/api/sys/log'))
}
function renderLog(box, rows) {
  box.replaceChildren(...rows.map(l => el('div', {}, el('time', {}, when(l.at)), el('b', {}, l.by || 'Hệ thống'), el('span', {}, l.detail))))
  if (!rows.length) box.append(el('p', { class: 'muted' }, 'Chưa có thao tác nào.'))
}

boot()
