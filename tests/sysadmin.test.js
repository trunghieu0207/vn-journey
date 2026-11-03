// Test trang quản trị (/quan-tri): tài khoản, đăng nhập, phân quyền, phòng, người chơi, bảng xếp hạng.
// Server tạm chỉ mở ở 127.0.0.1, cổng ngẫu nhiên — giống tests/app.test.js.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { createApp } from '../server/app.js'
import { createSealer } from '../server/auth.js'
import { memoryDb } from './helpers.js'

async function startServer() {
  const db = memoryDb()
  const config = { cookieSecure: false, allowedOrigin: 'http://127.0.0.1', gameDurationMin: 45, freezeBeforeEndMin: 10, secretKey: randomBytes(32) }
  const app = createApp({ db, config })
  const server = createServer((req, res) => app.handle(req, res))
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const jar = {}
  const cookieOf = as => Object.entries(jar[as] ?? {}).map(([k, v]) => `${k}=${v}`).join('; ')
  async function call(path, { method = 'GET', body, as, headers = {}, page } = {}) {
    const h = { ...headers }
    if (body !== undefined) h['content-type'] = 'application/json'
    if (as && jar[as]) h.cookie = cookieOf(as)
    if (page) h['x-vnj-page'] = page
    const res = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined })
    if (as) {
      for (const c of res.headers.getSetCookie()) {
        const [k, v] = c.split(';')[0].split('=')
        jar[as] ??= {}
        if (/Max-Age=0\b/.test(c)) delete jar[as][k]
        else jar[as][k] = v
      }
    }
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { status: res.status, json, text }
  }
  const post = (path, body, as, page) => call(path, { method: 'POST', body, as, page })
  const close = () => { app.hub.close(); return new Promise(r => server.close(r)) }
  return { call, post, close, db, app, jar }
}

const NEW_PASSWORD = 'mat-khau-moi-2026'

// Tạo tài khoản + đăng nhập + đổi mật khẩu tạm → phiên quản trị dùng được
async function loginAdmin(s, as = 'adm', username = 'boss') {
  const a = s.app.sys.createAdmin({ username, displayName: 'Ban tổ chức' })
  assert.equal((await s.post('/api/sys/login', { username, password: a.tempPassword }, as)).status, 200)
  assert.equal((await s.post('/api/sys/password', { current: a.tempPassword, next: NEW_PASSWORD }, as)).status, 200)
  return a
}

test('quản trị: /quan-tri trả 404 khi chưa có tài khoản; có tài khoản thì mở được', async t => {
  const s = await startServer(); t.after(s.close)
  assert.equal((await s.call('/quan-tri')).status, 404)
  s.app.sys.createAdmin({ username: 'boss', displayName: 'Boss' })
  const page = await s.call('/quan-tri')
  assert.equal(page.status, 200)
  assert.match(page.text, /id="loginForm"/)
  assert.equal((await s.call('/sysadmin.js')).status, 200)
  assert.equal((await s.call('/css/sysadmin.css')).status, 200)
})

test('quản trị: đăng nhập sai — cùng một thông báo cho tên không tồn tại; sai 5 lần thì khóa tài khoản', async t => {
  const s = await startServer(); t.after(s.close)
  const a = s.app.sys.createAdmin({ username: 'boss', displayName: 'Boss' })
  const unknown = await s.post('/api/sys/login', { username: 'khong-co', password: 'abc' })
  const wrong = await s.post('/api/sys/login', { username: 'boss', password: 'sai-mat-khau' })
  assert.equal(unknown.status, 401)
  assert.equal(wrong.status, 401)
  assert.equal(unknown.json.message, wrong.json.message)
  for (let i = 0; i < 4; i++) await s.post('/api/sys/login', { username: 'boss', password: 'sai-mat-khau' })
  // Đã sai 5 lần: mật khẩu đúng cũng bị từ chối trong lúc khóa
  const locked = await s.post('/api/sys/login', { username: 'boss', password: a.tempPassword })
  assert.equal(locked.status, 429)
  assert.equal(locked.json.error, 'locked')
  assert.ok(s.app.sys.listLog().some(l => l.action === 'admin-locked'))
})

test('quản trị: mật khẩu tạm phải đổi trước khi dùng; mật khẩu mới ít nhất 12 ký tự', async t => {
  const s = await startServer(); t.after(s.close)
  const a = s.app.sys.createAdmin({ username: 'boss', displayName: 'Boss' })
  const login = await s.post('/api/sys/login', { username: 'BOSS', password: a.tempPassword }, 'adm')
  assert.equal(login.status, 200)
  assert.equal(login.json.mustChange, true)
  assert.equal((await s.call('/api/sys/session', { as: 'adm' })).json.admin.mustChange, true)
  assert.equal((await s.call('/api/sys/rooms', { as: 'adm' })).json.error, 'must-change')
  assert.equal((await s.post('/api/sys/password', { current: a.tempPassword, next: 'ngan' }, 'adm')).json.error, 'weak-password')
  assert.equal((await s.post('/api/sys/password', { current: 'sai', next: NEW_PASSWORD }, 'adm')).json.error, 'bad-password')
  assert.equal((await s.post('/api/sys/password', { current: a.tempPassword, next: NEW_PASSWORD }, 'adm')).status, 200)
  assert.equal((await s.call('/api/sys/rooms', { as: 'adm' })).status, 200)
  // Đăng xuất → phiên hết hiệu lực
  await s.post('/api/sys/logout', {}, 'adm')
  assert.equal((await s.call('/api/sys/rooms', { as: 'adm' })).status, 401)
  assert.equal((await s.post('/api/sys/login', { username: 'boss', password: NEW_PASSWORD }, 'adm')).json.mustChange, false)
})

test('quản trị: phiên chủ phòng / người chơi không gọi được API quản trị; POST từ trang khác bị chặn', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await s.post('/api/rooms', { name: 'Phòng', teamCount: 2 }, 'owner')
  assert.equal(room.status, 200)
  for (const path of ['/api/sys/rooms', '/api/sys/admins', '/api/sys/players', '/api/sys/overview']) {
    assert.equal((await s.call(path, { as: 'owner' })).status, 401)
    assert.equal((await s.call(path)).status, 401)
  }
  assert.equal((await s.post('/api/sys/room/codes', { roomId: 1 }, 'owner')).status, 401)
  const cross = await s.call('/api/sys/login', { method: 'POST', body: { username: 'x', password: 'y' }, headers: { origin: 'https://evil.example' } })
  assert.equal(cross.status, 403)
})

test('quản trị: xem mọi phòng (cả riêng tư) + mã chủ phòng; tạo mã mới thì mã cũ và phiên chủ phòng cũ hết hiệu lực', async t => {
  const s = await startServer(); t.after(s.close)
  const created = await s.post('/api/rooms', { name: 'Phòng kín', teamCount: 2 }, 'owner')
  await loginAdmin(s)
  const rooms = (await s.call('/api/sys/rooms', { as: 'adm' })).json
  assert.equal(rooms.length, 1)
  assert.equal(rooms[0].listed, false)
  const codes = (await s.post('/api/sys/room/codes', { roomId: rooms[0].id }, 'adm')).json
  assert.deepEqual(codes, { code: created.json.code, screenCode: created.json.screenCode, ownerKey: created.json.ownerKey })
  // DB chỉ có bản mã hóa, không có mã gốc
  const stored = s.db.prepare('SELECT owner_key_sealed FROM rooms').get().owner_key_sealed
  assert.ok(!stored.includes(created.json.ownerKey))

  const rotated = (await s.post('/api/sys/room/owner-key', { roomId: rooms[0].id }, 'adm')).json
  assert.notEqual(rotated.ownerKey, created.json.ownerKey)
  assert.equal((await s.call('/api/owner/overview', { as: 'owner', page: 'admin' })).status, 401) // phiên chủ phòng cũ bị đăng xuất
  assert.equal((await s.post('/api/owner/login', { code: created.json.code, ownerKey: created.json.ownerKey })).status, 401)
  assert.equal((await s.post('/api/owner/login', { code: created.json.code, ownerKey: rotated.ownerKey })).status, 200)
  assert.equal((await s.post('/api/sys/room/codes', { roomId: rooms[0].id }, 'adm')).json.ownerKey, rotated.ownerKey)
  assert.ok(s.app.sys.listLog().some(l => l.action === 'room-codes' && l.by === 'boss'))
})

test('quản trị: mã hóa sai khóa → không mở được (trả null, không lỗi)', () => {
  const a = createSealer(randomBytes(32)), b = createSealer(randomBytes(32))
  const sealed = a.seal('ABCD2345')
  assert.equal(a.open(sealed), 'ABCD2345')
  assert.equal(b.open(sealed), null)
  assert.equal(a.open('rác'), null)
})

test('quản trị: điều khiển phòng = nhận phiên chủ phòng của phòng đó (không cần mã chủ phòng)', async t => {
  const s = await startServer(); t.after(s.close)
  await s.post('/api/rooms', { name: 'Phòng', teamCount: 2 })
  await loginAdmin(s)
  const roomId = (await s.call('/api/sys/rooms', { as: 'adm' })).json[0].id
  assert.equal((await s.call('/api/owner/overview', { as: 'adm', page: 'admin' })).status, 401)
  assert.equal((await s.post('/api/sys/room/control', { roomId }, 'adm')).status, 200)
  const ov = await s.call('/api/owner/overview', { as: 'adm', page: 'admin' })
  assert.equal(ov.status, 200)
  assert.equal(ov.json.room.name, 'Phòng')
  assert.equal((await s.post('/api/owner/game', { action: 'start' }, 'adm', 'admin')).status, 200)
  assert.equal((await s.post('/api/sys/room/control', { roomId: 999 }, 'adm')).status, 404)
})

test('quản trị: tạo phòng; sửa tên / hiển thị lúc nào cũng được, thời lượng chỉ trước khi bắt đầu; xóa phòng', async t => {
  const s = await startServer(); t.after(s.close)
  await loginAdmin(s)
  const r = await s.post('/api/sys/rooms', { name: 'Phòng HR', teamCount: 4, durationMin: 30, listed: true }, 'adm')
  assert.equal(r.status, 200)
  assert.ok(r.json.ownerKey && r.json.screenCode)
  const id = r.json.roomId
  assert.equal((await s.post('/api/sys/room/update', { roomId: id, name: 'Phòng HR tầng 5', durationMin: 40, listed: false }, 'adm')).status, 200)
  let room = (await s.call('/api/sys/rooms', { as: 'adm' })).json[0]
  assert.deepEqual([room.name, room.durationMin, room.listed, room.teams], ['Phòng HR tầng 5', 40, false, 4])
  assert.equal((await s.post('/api/sys/room/update', { roomId: id, durationMin: 5 }, 'adm')).status, 400)

  s.app.game.room(id).start()
  assert.equal((await s.post('/api/sys/room/update', { roomId: id, durationMin: 60 }, 'adm')).json.error, 'started')
  assert.equal((await s.post('/api/sys/room/update', { roomId: id, name: 'Đổi lúc đang chơi' }, 'adm')).status, 200)

  assert.equal((await s.post('/api/sys/room/delete', { roomId: id }, 'adm')).status, 200)
  assert.deepEqual((await s.call('/api/sys/rooms', { as: 'adm' })).json, [])
  assert.equal((await s.post('/api/sys/room/delete', { roomId: id }, 'adm')).status, 404)
})

test('quản trị: người chơi mọi phòng; sửa tên, mời ra', async t => {
  const s = await startServer(); t.after(s.close)
  const created = await s.post('/api/rooms', { name: 'Phòng', teamCount: 2 })
  const lobby = (await s.post('/api/rooms/lookup', { code: created.json.code })).json
  await s.post('/api/join', { code: created.json.code, name: 'Lan', teamId: lobby.teams[0].id }, 'lan')
  await loginAdmin(s)
  let list = (await s.call('/api/sys/players', { as: 'adm' })).json
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'Lan')
  assert.equal(list[0].roomCode, created.json.code)
  assert.equal((await s.post('/api/sys/player/rename', { playerId: list[0].id, name: 'Lan Anh' }, 'adm')).status, 200)
  assert.equal((await s.call('/api/me', { as: 'lan', page: 'team' })).json.me.name, 'Lan Anh')
  assert.equal((await s.post('/api/sys/player/kick', { playerId: list[0].id }, 'adm')).status, 200)
  assert.equal((await s.call('/api/me', { as: 'lan', page: 'team' })).status, 401)
  list = (await s.call('/api/sys/players', { as: 'adm' })).json
  assert.equal(list.length, 0)
})

test('quản trị: bảng xếp hạng — ẩn khỏi bảng công khai, đổi tên (gộp nếu trùng), xóa', async t => {
  const s = await startServer(); t.after(s.close)
  const add = (name, key, score) => s.db.prepare('INSERT INTO leaderboard (room_id, name, name_key, color, score, stamps, played_at) VALUES (1, ?, ?, ?, ?, 1, ?)')
    .run(name, key, '#C0392B', score, Date.now())
  add('xxx', 'xxx', 900)
  add('Lan', 'lan', 500)
  add('Lan A', 'lan a', 300)
  await loginAdmin(s)
  const pub = async () => (await s.call('/api/leaderboard')).json.entries.map(e => [e.name, e.score])

  assert.equal((await s.post('/api/sys/leaderboard/hide', { nameKey: 'xxx', hidden: true }, 'adm')).status, 200)
  assert.deepEqual(await pub(), [['Lan', 500], ['Lan A', 300]])
  assert.equal((await s.call('/api/sys/leaderboard', { as: 'adm' })).json.find(e => e.nameKey === 'xxx').hidden, true)

  // Đổi "Lan A" thành "Lan" → gộp với Lan (cộng dồn)
  assert.equal((await s.post('/api/sys/leaderboard/rename', { nameKey: 'lan a', name: 'Lan' }, 'adm')).status, 200)
  assert.deepEqual(await pub(), [['Lan', 800]])

  assert.equal((await s.post('/api/sys/leaderboard/delete', { nameKey: 'lan' }, 'adm')).status, 200)
  assert.deepEqual(await pub(), [])
  assert.equal((await s.post('/api/sys/leaderboard/delete', { nameKey: 'lan' }, 'adm')).status, 404)
})

test('quản trị: tài khoản — tạo, đặt lại mật khẩu, khóa (phiên của người bị khóa hết hiệu lực); không tự khóa mình', async t => {
  const s = await startServer(); t.after(s.close)
  const me = await loginAdmin(s)
  const r = await s.post('/api/sys/admins', { username: 'thuha', displayName: 'Thu Hà' }, 'adm')
  assert.equal(r.status, 200)
  assert.match(r.json.tempPassword, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.equal((await s.post('/api/sys/admins', { username: 'thuha', displayName: 'Trùng' }, 'adm')).status, 409)
  assert.equal((await s.post('/api/sys/admins', { username: 'Có Dấu', displayName: 'x' }, 'adm')).json.error, 'bad-username')

  // Thu Hà đăng nhập, đổi mật khẩu
  await s.post('/api/sys/login', { username: 'thuha', password: r.json.tempPassword }, 'ha')
  await s.post('/api/sys/password', { current: r.json.tempPassword, next: NEW_PASSWORD }, 'ha')
  assert.equal((await s.call('/api/sys/rooms', { as: 'ha' })).status, 200)

  // Khóa Thu Hà → phiên đang mở hết hiệu lực, đăng nhập lại không được
  assert.equal((await s.post('/api/sys/admins/disable', { id: r.json.id, disabled: true }, 'adm')).status, 200)
  assert.equal((await s.call('/api/sys/rooms', { as: 'ha' })).status, 401)
  assert.equal((await s.post('/api/sys/login', { username: 'thuha', password: NEW_PASSWORD })).status, 401)
  assert.equal((await s.post('/api/sys/admins/disable', { id: me.id, disabled: true }, 'adm')).json.error, 'self')

  // Mở khóa + đặt lại mật khẩu → mật khẩu cũ hết hiệu lực, phải đổi mật khẩu tạm
  await s.post('/api/sys/admins/disable', { id: r.json.id, disabled: false }, 'adm')
  const reset = (await s.post('/api/sys/admins/reset', { id: r.json.id }, 'adm')).json
  assert.equal((await s.post('/api/sys/login', { username: 'thuha', password: NEW_PASSWORD })).status, 401)
  assert.equal((await s.post('/api/sys/login', { username: 'thuha', password: reset.tempPassword })).json.mustChange, true)

  const admins = (await s.call('/api/sys/admins', { as: 'adm' })).json
  assert.deepEqual(admins.map(a => a.username), ['boss', 'thuha'])
  assert.ok(!JSON.stringify(admins).includes('scrypt')) // không trả mật khẩu băm
  const log = (await s.call('/api/sys/log', { as: 'adm' })).json
  assert.ok(log.some(l => l.action === 'admin-create' && l.by === 'boss'))
})

test('quản trị câu hỏi: sửa, duyệt, thêm câu (mã tự đặt), lỗi kiểm tra, không đổi tỉnh câu đã có', async t => {
  const s = await startServer(); t.after(s.close)
  await loginAdmin(s)
  const list = (await s.call('/api/sys/questions', { as: 'adm' })).json
  assert.equal(list.questions.length, s.db.prepare('SELECT COUNT(*) AS n FROM questions').get().n)
  assert.equal(list.provinces.length, 34)
  assert.ok(!JSON.stringify(list.questions[0]).includes('"answer"')) // danh sách không kèm đáp án

  const q = (await s.post('/api/sys/question/get', { id: 'hue-12' }, 'adm')).json
  assert.equal(q.sources.length, 2)
  const saved = await s.post('/api/sys/question/save', { ...q, content: `${q.content} (sửa)`, status: 'ok' }, 'adm')
  assert.equal(saved.status, 200)
  const row = s.db.prepare('SELECT content, status, updated_by FROM questions WHERE id = ?').get('hue-12')
  assert.deepEqual([row.content.endsWith('(sửa)'), row.status, row.updated_by], [true, 'ok', 'boss'])

  const base = { province: 'hue', difficulty: 'normal', topic: 'am-thuc', kind: 'choice', level: 2, content: 'Món bánh nào của Huế gói lá chuối, hấp chín?',
    options: ['Bánh bột lọc', 'Bánh pía', 'Bánh tét', 'Bánh xèo'], answer: 0, explanation: 'Bánh bột lọc Huế.', sources: ['https://example.vn/a'] }
  const added = await s.post('/api/sys/question/save', base, 'adm')
  assert.equal(added.status, 200)
  assert.match(added.json.id, /^hue-\d{2}$/)
  assert.ok(added.json.warnings.some(w => w.includes('2 nguồn')))
  assert.equal(s.db.prepare('SELECT status FROM questions WHERE id = ?').get(added.json.id).status, 'new')

  assert.equal((await s.post('/api/sys/question/save', { ...base, options: ['Một'], answer: 0 }, 'adm')).json.error, 'bad-question')
  assert.equal((await s.post('/api/sys/question/save', { ...base, sources: ['http://khong-an-toan.vn'] }, 'adm')).json.error, 'bad-question')
  assert.equal((await s.post('/api/sys/question/save', { ...base, id: 'hue-12', province: 'ha-noi' }, 'adm')).json.error, 'bad-question')
  assert.ok(s.app.sys.listLog().some(l => l.action === 'question-add'))
})

test('quản trị câu hỏi: câu bị ẩn không phát nữa; không ẩn được câu cuối cùng của tỉnh', async t => {
  const s = await startServer(); t.after(s.close)
  await loginAdmin(s)
  const ids = s.db.prepare("SELECT id FROM questions WHERE province_id = 'hue' AND difficulty = 'normal' ORDER BY id").all().map(r => r.id)
  const keep = ids.pop()
  for (const id of ids) assert.equal((await s.post('/api/sys/question/hide', { id, hidden: true }, 'adm')).status, 200)
  assert.equal((await s.post('/api/sys/question/hide', { id: keep, hidden: true }, 'adm')).json.error, 'last-question')

  // Team tới Huế chỉ nhận được câu còn hiện
  const r = await s.post('/api/sys/rooms', { name: 'Phòng', teamCount: 2, betChoice: false }, 'adm')
  const room = s.app.game.room(r.json.roomId)
  room.start()
  s.db.prepare('UPDATE rooms SET started_at = started_at - 10000, ends_at = ends_at - 10000').run() // qua đếm ngược
  const team = s.db.prepare('SELECT id FROM teams WHERE room_id = ? ORDER BY id').get(r.json.roomId).id
  s.db.prepare("UPDATE teams SET current_province = 'quang-tri', previous_province = NULL WHERE id = ?").run(team)
  s.db.prepare("DELETE FROM ownership WHERE province_id = 'hue'").run()
  const moved = room.move(team, 'hue')
  assert.equal(moved.question.id, keep)
})

test('quản trị câu hỏi: xuất questions.json giống hệt file gốc khi chưa sửa; có sửa thì mang theo trạng thái + câu ẩn', async t => {
  const { readFileSync } = await import('node:fs')
  const s = await startServer(); t.after(s.close)
  await loginAdmin(s)
  const orig = readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8')
  const r = await s.call('/api/sys/questions/export', { as: 'adm' })
  assert.equal(r.status, 200)
  assert.equal(r.text, orig)
  await s.post('/api/sys/question/save', { ...(await s.post('/api/sys/question/get', { id: 'hue-12' }, 'adm')).json, status: 'ok' }, 'adm')
  await s.post('/api/sys/question/hide', { id: 'hue-01', hidden: true }, 'adm')
  const out = JSON.parse((await s.call('/api/sys/questions/export', { as: 'adm' })).text)
  assert.equal(out.questions.find(q => q.id === 'hue-12').status, 'ok')
  assert.equal(out.questions.find(q => q.id === 'hue-01').hidden, true)
  assert.equal(out.questions.length, JSON.parse(orig).questions.length)
  assert.equal((await s.call('/api/sys/questions/export')).status, 401)
})

test('quản trị cài đặt: tắt tạo phòng, tắt phòng có sẵn, thông báo chung, từ cấm', async t => {
  const s = await startServer(); t.after(s.close)
  s.app.game.ensurePresetRooms()
  await loginAdmin(s)
  assert.deepEqual((await s.call('/api/notice')).json, { text: null })

  await s.post('/api/sys/settings', { allowCreate: false, presetRooms: false, notice: '14:45 trao giải', noticeOn: true, bannedWords: ['Xấu', 'xau', ' '] }, 'adm')
  const create = await s.post('/api/rooms', { name: 'Phòng', teamCount: 2 })
  assert.equal(create.status, 403)
  assert.equal(create.json.error, 'create-off')
  const list = (await s.call('/api/rooms/list')).json
  assert.deepEqual([list.preset, list.allowCreate], [[], false])
  assert.equal((await s.post('/api/sys/rooms', { name: 'Ban tổ chức tạo', teamCount: 2 }, 'adm')).status, 200) // quản trị vẫn tạo được
  assert.deepEqual((await s.call('/api/notice')).json, { text: '14:45 trao giải' })
  assert.deepEqual((await s.call('/api/sys/settings', { as: 'adm' })).json.bannedWords, ['xấu', 'xau'])

  // Từ cấm: gắn cờ tên chứa cả từ (bỏ dấu), không gắn cờ tên chỉ chứa một phần chữ
  const code = (await s.call('/api/sys/rooms', { as: 'adm' })).json.find(r => r.name === 'Ban tổ chức tạo').code
  const lobby = (await s.post('/api/rooms/lookup', { code })).json
  await s.post('/api/join', { code, name: 'Bạn Xấu Tính', teamId: lobby.teams[0].id })
  await s.post('/api/join', { code, name: 'Xauxi', teamId: lobby.teams[1].id })
  const flags = Object.fromEntries((await s.call('/api/sys/players', { as: 'adm' })).json.map(p => [p.name, p.flagged]))
  assert.deepEqual(flags, { 'Bạn Xấu Tính': true, Xauxi: false })
  assert.equal((await s.call('/api/sys/overview', { as: 'adm' })).json.flaggedNames, 1)

  await s.post('/api/sys/settings', { allowCreate: true, noticeOn: false }, 'adm')
  assert.equal((await s.post('/api/rooms', { name: 'Phòng', teamCount: 2 })).status, 200)
  // Team gọn tắt riêng: form không tạo được, quản trị vẫn tạo được
  await s.post('/api/sys/settings', { allowCompact: false }, 'adm')
  assert.equal((await s.post('/api/rooms', { name: 'Gọn', teamCount: 2, mode: 'compact' })).json.error, 'compact-off')
  assert.equal((await s.call('/api/rooms/list')).json.allowCompact, false)
  assert.equal((await s.post('/api/sys/rooms', { name: 'Gọn BTC', teamCount: 2, mode: 'compact', duel: true }, 'adm')).status, 200)
  const gon = (await s.call('/api/sys/rooms', { as: 'adm' })).json.find(r => r.name === 'Gọn BTC')
  assert.deepEqual([gon.mode, gon.compact, gon.duel], ['team', true, true])
  assert.deepEqual((await s.call('/api/notice')).json, { text: null })
  assert.equal((await s.call('/shared/notice.js')).status, 200)
})

test('quản trị hệ thống: số liệu, danh sách bị chặn + bỏ chặn, xóa phòng đã xong, CSV bảng xếp hạng', async t => {
  const s = await startServer(); t.after(s.close)
  await loginAdmin(s)
  for (let i = 0; i < 6; i++) await s.post('/api/rooms', { name: `P${i}`, teamCount: 2 })
  assert.equal((await s.post('/api/rooms', { name: 'Bị chặn', teamCount: 2 })).status, 429)
  const sys = (await s.call('/api/sys/system', { as: 'adm' })).json
  assert.equal(sys.requests.length, 30)
  assert.equal(sys.cpu.history.length, 30)
  assert.ok(sys.cpu.cores >= 1 && sys.cpu.load.length === 3)
  assert.ok(sys.cpu.process === null || sys.cpu.process >= 0) // vừa khởi động (< 20 ms) thì chưa có mẫu
  assert.ok(sys.requests.at(-1) > 0)
  const block = sys.blocks.find(b => b.limiter === 'create')
  assert.ok(block.count >= 2)
  assert.equal((await s.post('/api/sys/system/unblock', { limiter: block.limiter, key: block.key }, 'adm')).status, 200)
  assert.equal((await s.post('/api/rooms', { name: 'Sau bỏ chặn', teamCount: 2 })).status, 200)
  assert.equal((await s.post('/api/sys/system/unblock', { limiter: 'khong-co', key: 'x' }, 'adm')).status, 400)

  // Xóa phòng đã xong
  const rooms = (await s.call('/api/sys/rooms', { as: 'adm' })).json
  const ended = s.app.game.room(rooms[0].id)
  ended.start()
  ended.end()
  assert.deepEqual((await s.post('/api/sys/rooms/delete-ended', {}, 'adm')).json, { deleted: 1 })

  // CSV: có BOM, chống công thức Excel
  s.db.prepare("INSERT INTO leaderboard (room_id, name, name_key, color, score, stamps, played_at) VALUES (1, '=CMD()', 'cmd', '#000', 10, 1, ?)").run(Date.now())
  const csv = await s.call('/api/sys/leaderboard.csv', { as: 'adm' })
  assert.equal(csv.status, 200)
  assert.ok(csv.text.startsWith('Hạng,Tên')) // fetch tự bỏ BOM khi đọc chữ — kiểm tra BOM ở dòng dưới
  assert.ok(s.app.sys.leaderboardCsv(null).startsWith('\uFEFF'))
  assert.match(csv.text, /"'=CMD\(\)"/)
  assert.equal((await s.call('/api/sys/backup', { as: 'adm' })).status, 404) // test không cấu hình thư mục sao lưu
})
