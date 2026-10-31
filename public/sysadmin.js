// Trang quản trị (/quan-tri): đăng nhập tài khoản admin, tổng quan, mọi phòng (tạo / sửa / xem mã / điều khiển / xóa),
// người chơi, bảng xếp hạng cá nhân, tài khoản admin, nhật ký. Dữ liệu động đưa vào bằng textContent (el()), không innerHTML.

import { api } from '/shared/api.js'
import { $, el, button } from '/shared/dom.js'
import { icon, fillIcons } from '/shared/icons.js'
import { mascotIcon } from '/shared/mascots.js'

const REFRESH_MS = 10_000
const state = { me: null, sec: 'dash', rooms: [], players: [], board: [], admins: [], timer: null }
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
const LOADERS = { dash: loadDash, rooms: loadRooms, players: loadPlayers, board: loadBoard, accounts: loadAccounts, log: loadLog }

function go(sec) {
  state.sec = sec
  for (const b of document.querySelectorAll('.ad-nav')) b.classList.toggle('on', b.dataset.sec === sec)
  for (const s of document.querySelectorAll('.ad-sec')) s.classList.toggle('on', s.id === `sec-${sec}`)
  stopTimer()
  refresh()
  state.timer = setInterval(() => { if (!document.hidden && !$('dlg').open) refresh() }, REFRESH_MS)
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
for (const id of ['roomSearch', 'playerSearch', 'boardSearch', 'playerRoom']) $(id).addEventListener('input', () => renderSection())
const segValue = id => $(id).querySelector('.on')?.dataset.v ?? ''
function renderSection() {
  ;({ rooms: renderRooms, players: renderPlayers, board: renderBoard }[state.sec] ?? (() => {}))()
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
const modeTag = mode => mode === 'solo' ? tag('solo', 'Chơi đơn') : tag('team', 'Theo team')
function roomTime(r) {
  if (r.status === 'waiting') return `${r.durationMin} phút`
  if (r.status === 'ended') return `xong ${clock(r.endsAt ?? r.createdAt)}`
  const left = (r.pausedAt ? r.endsAt - r.pausedAt : r.endsAt - Date.now()) / 60_000
  return `còn ${Math.max(0, Math.ceil(left))} phút`
}

function renderRooms() {
  const st = segValue('roomStatus'), mode = segValue('roomMode'), q = norm($('roomSearch').value.trim())
  const rows = state.rooms.filter(r => (!st || (st === 'run' ? ['running', 'paused'].includes(r.status) : r.status === st))
    && (!mode || r.mode === mode) && (!q || norm(`${r.name} ${r.code}`).includes(q)))
  $('roomRows').replaceChildren(...rows.map(r => el('tr', {},
    el('td', { class: 'mono' }, r.code),
    el('td', {}, r.name, r.preset ? tag('', 'có sẵn') : ''),
    el('td', {}, modeTag(r.mode)),
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
  const name = el('input', { class: 'ad-input', maxlength: 40, required: true, value: r?.name ?? '' })
  const mode = el('select', { class: 'ad-input', disabled: !!r }, el('option', { value: 'team' }, 'Theo team'), el('option', { value: 'solo' }, 'Chơi đơn'))
  mode.value = r?.mode ?? 'team'
  const teams = el('select', { class: 'ad-input', disabled: !!r }, ...[2, 3, 4, 5, 6, 7, 8].map(n => el('option', { value: n }, `${n} team`)))
  teams.value = String(r?.teams || 4)
  const duration = el('input', { class: 'ad-input', type: 'number', min: 10, max: 90, value: r?.durationMin ?? 45, disabled: !waiting })
  const quiz = el('select', { class: 'ad-input', disabled: !waiting }, ...[1, 2, 3].map(n => el('option', { value: n }, `${n} câu`)))
  quiz.value = String(r?.quizCount ?? 1)
  const listed = el('select', { class: 'ad-input', disabled: !!r?.preset }, el('option', { value: '1' }, 'Công khai — hiện ở danh sách phòng'), el('option', { value: '0' }, 'Riêng tư — cần mã phòng'))
  listed.value = r ? (r.listed || r.preset ? '1' : '0') : '0'
  const check = (label, on) => {
    const box = el('input', { type: 'checkbox' })
    box.checked = on
    return [el('label', { class: 'chk' }, box, label), box]
  }
  const [betLabel, bet] = check('Đặt cược (Mạo hiểm)', r?.betChoice ?? true)
  const [topicLabel, topic] = check('Cho chọn chủ đề', r?.topicChoice ?? false)
  const teamField = field('Số team', teams, r ? 'Không đổi sau khi tạo' : '')
  const syncMode = () => { teamField.hidden = mode.value === 'solo' }
  mode.addEventListener('change', syncMode)
  syncMode()
  const lock = r && !waiting ? 'Khóa khi đã bắt đầu' : ''
  const body = el('div', { class: 'rf' },
    el('label', { class: 'full' }, 'Tên phòng', name),
    field('Kiểu phòng', mode, r ? 'Không đổi sau khi tạo' : ''), teamField,
    field('Thời lượng (phút)', duration, lock), field('Số câu mỗi tỉnh', quiz, lock),
    el('label', { class: 'full' }, 'Hiển thị', listed),
    el('div', { class: 'full chks' }, betLabel, topicLabel),
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
      const c = await api('/api/sys/rooms', { ...data, mode: mode.value, teamCount: Number(teams.value) })
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
    el('td', {}, el('span', { class: 'who' }, avatar(p), p.name)),
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
  const input = el('input', { class: 'ad-input', maxlength: 24, value: current, required: true })
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
    el('td', {}, e.name, e.hidden ? tag('hide', 'đang ẩn') : ''),
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

// ---------- Nhật ký ----------
async function loadLog() {
  renderLog($('logRows'), await api('/api/sys/log'))
}
function renderLog(box, rows) {
  box.replaceChildren(...rows.map(l => el('div', {}, el('time', {}, when(l.at)), el('b', {}, l.by || 'Hệ thống'), el('span', {}, l.detail))))
  if (!rows.length) box.append(el('p', { class: 'muted' }, 'Chưa có thao tác nào.'))
}

boot()
