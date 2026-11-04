// Test tầng HTTP + bảo mật. Server tạm chỉ mở ở 127.0.0.1, cổng ngẫu nhiên, đóng sau mỗi test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApp } from '../server/app.js'
import { memoryDb } from './helpers.js'
import { RULES } from '../server/game.js'

async function startServer() {
  const db = memoryDb()
  const config = { cookieSecure: false, allowedOrigin: 'http://127.0.0.1', gameDurationMin: 45, freezeBeforeEndMin: 10 }
  const app = createApp({ db, config })
  const server = createServer((req, res) => app.handle(req, res))
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  // Mỗi "người" (as) một hộp cookie như trình duyệt: mỗi vai một cookie, Max-Age=0 thì xóa
  const jar = {}
  const cookieOf = as => Object.entries(jar[as] ?? {}).map(([k, v]) => `${k}=${v}`).join('; ')
  async function call(path, { method = 'GET', body, as, headers = {}, raw, page } = {}) {
    const h = { ...headers }
    if (body !== undefined && !raw) h['content-type'] = 'application/json'
    if (as && jar[as]) h.cookie = cookieOf(as)
    if (page) h['x-vnj-page'] = page
    const res = await fetch(base + path, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) })
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
    return { status: res.status, headers: res.headers, json, text }
  }
  const post = (path, body, as, page) => call(path, { method: 'POST', body, as, page })
  // Mở kênh SSE; `closed` hoàn thành khi server đóng kết nối
  async function stream(as, view = '') {
    const res = await fetch(base + `/api/stream${view ? `?view=${view}` : ''}`, { headers: { cookie: cookieOf(as) } })
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let text = ''
    // Đợi bản trạng thái đầu tiên (server gửi ngay khi kết nối)
    const first = (async () => {
      while (!text.includes('event: state')) {
        const { value, done } = await reader.read()
        if (done) break
        text += dec.decode(value)
      }
      return JSON.parse(text.split('data: ')[1].split('\n')[0])
    })()
    const closed = first.then(async () => { while (!(await reader.read()).done); })
    return { status: res.status, first, closed, cancel: () => reader.cancel() }
  }
  const close = () => { app.hub.close(); return new Promise(r => server.close(r)) }
  return { call, post, stream, close, db, app, base, jar, cookieOf }
}

// Cookie phiên đăng nhập của một "trình duyệt" (bỏ vnj_creator — cookie đếm phòng mình tạo, không phải phiên)
const sessionCookies = (s, as) => Object.keys(s.jar[as] ?? {}).filter(k => k !== 'vnj_creator').sort()

// Chủ phòng tạo phòng 3 team; trả về mã phòng + các mã bí mật
async function withRoom(s, as = 'owner') {
  const r = await s.post('/api/rooms', { name: 'Phòng test', teamCount: 3 }, as)
  assert.equal(r.status, 200)
  const lobby = (await s.post('/api/rooms/lookup', { code: r.json.code })).json
  return { ...r.json, teams: lobby.teams }
}

test('header bảo mật có mặt trên mọi response', async t => {
  const s = await startServer(); t.after(s.close)
  const r = await s.call('/api/health')
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/)
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(r.headers.get('x-frame-options'), 'DENY')
})

test('file tĩnh: chỉ phục vụ danh sách cho phép — không lộ câu hỏi, DB, mã nguồn', async t => {
  const s = await startServer(); t.after(s.close)
  for (const path of ['/data/questions.json', '/data/provinces.json', '/var/game.db', '/server/app.js',
    '/.env', '/../data/questions.json', '/%2e%2e/data/questions.json', '/package.json']) {
    const r = await s.call(path)
    assert.equal(r.status, 404, path)
  }
  assert.equal((await s.call('/data/map-geo.json')).status, 200)
})

test('file tĩnh: nén br / gzip, ETag → lần sau 304 không kèm nội dung', async t => {
  const s = await startServer(); t.after(s.close)
  const file = (await import('node:fs')).readFileSync(new URL('../public/team.js', import.meta.url), 'utf8')
  const br = await s.call('/team.js', { headers: { 'accept-encoding': 'gzip, deflate, br' } })
  assert.equal(br.status, 200)
  assert.equal(br.headers.get('content-encoding'), 'br')
  assert.equal(br.text, file) // fetch tự giải nén
  assert.ok(Number(br.headers.get('content-length')) < file.length / 2)
  assert.equal((await s.call('/team.js', { headers: { 'accept-encoding': 'gzip' } })).headers.get('content-encoding'), 'gzip')
  assert.equal((await s.call('/favicon.png', { headers: { 'accept-encoding': 'br' } })).headers.get('content-encoding'), null) // ảnh đã nén sẵn
  const etag = br.headers.get('etag')
  assert.match(etag, /^"[\w-]+"$/)
  assert.equal(br.headers.get('cache-control'), 'no-cache')
  const again = await s.call('/team.js', { headers: { 'if-none-match': etag } })
  assert.equal(again.status, 304)
  assert.equal(again.text, '')
  assert.equal((await s.call('/team.js', { headers: { 'if-none-match': '"cu"' } })).status, 200)
})

test('tạo phòng: cookie chủ phòng HttpOnly + SameSite=Strict; mã chủ phòng chỉ trả về 1 lần', async t => {
  const s = await startServer(); t.after(s.close)
  const r = await s.post('/api/rooms', { name: 'Phòng A', teamCount: 2 }, 'owner')
  assert.equal(r.status, 200)
  assert.match(r.json.code, /^[A-Z0-9]{6}$/)
  assert.match(r.json.ownerKey, /^[A-Z0-9]{8}$/)
  const cookie = r.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Strict/)
  const overview = await s.call('/api/owner/overview', { as: 'owner' })
  assert.equal(overview.status, 200)
  assert.equal(overview.json.screenCode, r.json.screenCode)
  assert.ok(!overview.text.includes(r.json.ownerKey))
  assert.equal((await s.post('/api/rooms', { name: 'X', teamCount: 20 })).status, 400)
})

test('đăng nhập lại chủ phòng: sai mã → 401; đúng mã → vào được', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s)
  assert.equal((await s.post('/api/owner/login', { code: room.code, ownerKey: 'SAI12345' })).status, 401)
  assert.equal((await s.post('/api/owner/login', { code: 'KHONGCO', ownerKey: room.ownerKey })).status, 401)
  const ok = await s.post('/api/owner/login', { code: room.code.toLowerCase(), ownerKey: room.ownerKey.toLowerCase() }, 'owner2')
  assert.equal(ok.status, 200)
  assert.equal((await s.call('/api/owner/overview', { as: 'owner2' })).status, 200)
})

test('giới hạn: tạo phòng quá 5 lần/phút; đăng nhập chủ phòng quá 10 lần/phút bị chặn', async t => {
  const s = await startServer(); t.after(s.close)
  let last
  for (let i = 0; i < 6; i++) last = await s.post('/api/rooms', { name: `P${i}`, teamCount: 2 })
  assert.equal(last.status, 429)
  for (let i = 0; i < 11; i++) last = await s.post('/api/owner/login', { code: 'ZZZZZZ', ownerKey: 'ZZZZZZZZ' })
  assert.equal(last.status, 429)
})

test('người chơi vào phòng bằng mã + tên + team; xem được /api/me nhưng không gọi được API chủ phòng', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s)
  const lobby = (await s.post('/api/rooms/lookup', { code: room.code })).json
  assert.equal(lobby.provinces.length, 34) // danh sách chọn quê
  assert.equal((await s.post('/api/join', { code: room.code, name: 'An', teamId: room.teams[0].id, home: 'xyz' })).status, 400)
  const join = await s.post('/api/join', { code: room.code, name: 'An', teamId: room.teams[0].id, home: 'hue' }, 'an')
  assert.equal(join.status, 200)
  const me = (await s.call('/api/me', { as: 'an' })).json
  assert.equal(me.team.name, 'Team Rồng')
  assert.equal(me.me.name, 'An')
  assert.deepEqual(me.members.map(m => [m.name, m.home]), [['An', 'hue']])
  assert.ok(!('screenCode' in me))
  assert.equal((await s.call('/api/owner/overview', { as: 'an' })).status, 403)
  assert.equal((await s.post('/api/owner/game', { action: 'start' }, 'an')).status, 403)
  assert.equal((await s.post('/api/join', { code: room.code, name: 'an', teamId: room.teams[1].id })).status, 409)
})

test('chủ phòng chỉ điều khiển được phòng của mình', async t => {
  const s = await startServer(); t.after(s.close)
  const a = await withRoom(s, 'ownerA')
  await withRoom(s, 'ownerB')
  await s.post('/api/join', { code: a.code, name: 'An', teamId: a.teams[0].id }, 'an')
  // Chủ phòng B kick người chơi phòng A → không tìm thấy
  const playerId = (await s.call('/api/me', { as: 'an' })).json.me.id
  assert.equal((await s.post('/api/owner/kick', { playerId }, 'ownerB')).status, 404)
  await s.post('/api/owner/game', { action: 'start' }, 'ownerB')
  assert.equal((await s.call('/api/me', { as: 'an' })).json.status, 'waiting')
})

test('bị kick: phiên mất hiệu lực ngay, kể cả kết nối realtime', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s)
  await s.post('/api/join', { code: room.code, name: 'An', teamId: room.teams[0].id }, 'an')
  const playerId = (await s.call('/api/me', { as: 'an' })).json.me.id
  const stream = await s.stream('an')
  assert.equal(s.app.hub.size(), 1)
  assert.equal((await s.post('/api/owner/kick', { playerId }, 'owner')).status, 200)
  assert.equal((await s.call('/api/me', { as: 'an' })).status, 401)
  await stream.closed // server đóng kết nối SSE của người bị kick
  assert.equal(s.app.hub.size(), 0)
})

test('realtime: chủ phòng mở màn chiếu nhận dữ liệu màn chiếu; người chơi không xin được dữ liệu khác', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s)
  await s.post('/api/join', { code: room.code, name: 'An', teamId: room.teams[0].id }, 'an')
  const asScreen = await s.stream('owner', 'screen')
  const v = await asScreen.first
  assert.ok(Array.isArray(v.news) && Array.isArray(v.lobby) && !('teams' in v))
  const asOwner = await s.stream('owner')
  assert.ok('teams' in (await asOwner.first))
  const r = await fetch(`${s.base}/api/stream?view=owner`, { headers: { cookie: s.cookieOf('an') } })
  assert.equal(r.status, 403)
  await r.body?.cancel()
  asScreen.cancel()
  asOwner.cancel()
})

test('tổng kết: người chơi chỉ xem được diễn biến toàn trận sau khi kết thúc', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s)
  await s.post('/api/join', { code: room.code, name: 'An', teamId: room.teams[0].id }, 'an')
  await s.post('/api/owner/game', { action: 'start' }, 'owner')
  assert.equal((await s.call('/api/replay', { as: 'an' })).status, 409)
  await s.post('/api/owner/game', { action: 'end' }, 'owner')
  const r = await s.call('/api/replay', { as: 'an' })
  assert.equal(r.status, 200)
  assert.equal(r.json.scores.length, 3)
  assert.ok(!r.text.includes(room.screenCode) && !r.text.includes('"answer"'))
})

test('chọn chủ đề: bật lúc tạo phòng, chủ phòng đổi được, người chơi không đổi được', async t => {
  const s = await startServer(); t.after(s.close)
  const r = await s.post('/api/rooms', { name: 'Chủ đề', teamCount: 2, topicChoice: true }, 'owner')
  assert.equal((await s.call('/api/owner/overview', { as: 'owner' })).json.room.topicChoice, true)
  const lobby = (await s.post('/api/rooms/lookup', { code: r.json.code })).json
  await s.post('/api/join', { code: r.json.code, name: 'An', teamId: lobby.teams[0].id }, 'an')
  assert.equal((await s.post('/api/owner/settings', { topicChoice: false }, 'an')).status, 403)
  assert.equal((await s.post('/api/owner/settings', { topicChoice: false }, 'owner')).status, 200)
  assert.equal((await s.call('/api/me', { as: 'an' })).json.room.topicChoice, false)
})

test('chưa đăng nhập → 401', async t => {
  const s = await startServer(); t.after(s.close)
  assert.equal((await s.call('/api/me')).status, 401)
  assert.equal((await s.call('/api/stream')).status, 401)
})

test('POST từ trang khác (Origin lạ) bị chặn', async t => {
  const s = await startServer(); t.after(s.close)
  const r = await s.call('/api/rooms', { method: 'POST', body: { name: 'A', teamCount: 2 }, headers: { origin: 'https://evil.example' } })
  assert.equal(r.status, 403)
})

test('body không phải JSON → 415; quá 10KB → 413; JSON hỏng → 400', async t => {
  const s = await startServer(); t.after(s.close)
  assert.equal((await s.call('/api/join', { method: 'POST', raw: 'name=1', headers: { 'content-type': 'text/plain' } })).status, 415)
  const big = JSON.stringify({ name: 'x'.repeat(20_000) })
  assert.equal((await s.call('/api/join', { method: 'POST', raw: big, headers: { 'content-type': 'application/json' } })).status, 413)
  assert.equal((await s.call('/api/join', { method: 'POST', raw: '{oops', headers: { 'content-type': 'application/json' } })).status, 400)
})

test('luồng chơi qua HTTP: câu hỏi không chứa đáp án; lỗi không lộ chi tiết nội bộ', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s)
  await s.post('/api/join', { code: room.code, name: 'An', teamId: room.teams[0].id }, 'an')
  await s.post('/api/owner/game', { action: 'start' }, 'owner')
  const me = (await s.call('/api/me', { as: 'an' })).json
  // Đang đếm ngược 3·2·1: chưa đi được
  assert.equal((await s.post('/api/move', { provinceId: me.neighbors[0] }, 'an')).json.error, 'counting')
  s.db.prepare('UPDATE rooms SET started_at = started_at - ?').run(RULES.startCountdownMs) // cho qua đếm ngược
  const r = await s.post('/api/move', { provinceId: me.neighbors[0] }, 'an')
  assert.equal(r.status, 200)
  if (r.json.question) {
    assert.ok(!('answer' in r.json.question))
    const stored = s.db.prepare('SELECT answer FROM questions WHERE id = ?').get(r.json.question.id)
    const meText = (await s.call('/api/me', { as: 'an' })).text
    assert.ok(!meText.includes(`"answer":${stored.answer}`))
  }
  const bad = await s.post('/api/move', { provinceId: 'khong-ton-tai' }, 'an')
  assert.ok(bad.status >= 400 && bad.status < 500)
  assert.ok(!bad.text.includes('at ') && !bad.text.includes('SQL'))
})

test('màn chiếu đăng nhập bằng mã phòng + mã màn chiếu, chỉ xem được dữ liệu ẩn danh', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s)
  assert.equal((await s.post('/api/screen/login', { code: room.code, screenCode: 'sai' })).status, 401)
  await s.post('/api/screen/login', { code: room.code, screenCode: room.screenCode.toLowerCase() }, 'screen')
  const v = await s.call('/api/screen', { as: 'screen' })
  assert.equal(v.status, 200)
  assert.ok(!('teams' in v.json) && !('ownership' in v.json) && !('screenCode' in v.json))
  assert.equal((await s.call('/api/me', { as: 'screen' })).status, 403)
  assert.equal((await s.call('/api/owner/overview', { as: 'screen' })).status, 403)
})

test('danh sách tỉnh: cần đăng nhập, không chứa câu hỏi hay đáp án', async t => {
  const s = await startServer(); t.after(s.close)
  assert.equal((await s.call('/api/provinces')).status, 401)
  await withRoom(s)
  const r = await s.call('/api/provinces', { as: 'owner' })
  assert.equal(r.status, 200)
  assert.equal(r.json.length, 34)
  assert.deepEqual(Object.keys(r.json[0]).sort(),
    ['id', 'isCapital', 'isCity', 'mergedFrom', 'name', 'points', 'region', 'shortName'])
})

test('route không tồn tại → 404', async t => {
  const s = await startServer(); t.after(s.close)
  assert.equal((await s.call('/api/khong-co')).status, 404)
  assert.equal((await s.call('/api/health', { method: 'DELETE' })).status, 404)
})

test('phòng đơn qua API: tạo không cần số team, vào phòng không chọn team, sổ tay chỉ của mình', async t => {
  const s = await startServer(); t.after(s.close)
  const r = await s.post('/api/rooms', { name: 'Phòng đơn', mode: 'solo' }, 'owner')
  assert.equal(r.status, 200)
  const lobby = (await s.post('/api/rooms/lookup', { code: r.json.code })).json
  assert.equal(lobby.mode, 'solo')
  assert.deepEqual(lobby.teams, [])
  assert.equal((await s.post('/api/join', { code: r.json.code, name: 'Xuka' }, 'xuka')).status, 200)
  assert.equal((await s.post('/api/join', { code: r.json.code, name: 'Nobita' }, 'nobita')).status, 200)
  assert.equal((await s.post('/api/rooms/lookup', { code: r.json.code })).json.players, 2)
  assert.equal((await s.post('/api/owner/game', { action: 'start' }, 'owner')).status, 200)
  const me = (await s.call('/api/me', { as: 'xuka' })).json
  assert.equal(me.room.mode, 'solo')
  assert.equal(me.team.name, 'Xuka')
  const j = (await s.call('/api/journal', { as: 'xuka' })).json
  assert.equal(j.name, 'Xuka')
  assert.equal(j.stamps.length, 1)
  assert.ok(j.stamps[0].start)
  assert.equal((await s.call('/api/journal', { as: 'owner' })).status, 403)
})

test('phòng có sẵn: người chơi giữ quyền chủ phòng gọi được API chủ phòng của phòng mình; người khác thì không', async t => {
  const s = await startServer(); t.after(s.close)
  s.app.game.ensurePresetRooms()
  const list = (await s.call('/api/rooms/preset')).json
  assert.equal(list.length, 4)
  const host = await s.post('/api/join', { code: list[0].code, name: 'Xuka' }, 'xuka')
  assert.equal(host.json.host, true)
  assert.equal((await s.post('/api/join', { code: list[0].code, name: 'Nobita' }, 'nobita')).json.host, false)
  assert.equal((await s.call('/api/owner/overview', { as: 'xuka' })).status, 200)
  assert.equal((await s.call('/api/owner/overview', { as: 'nobita' })).status, 403)
  assert.equal((await s.post('/api/owner/game', { action: 'start' }, 'nobita')).status, 403)
  assert.equal((await s.post('/api/owner/game', { action: 'start' }, 'xuka')).status, 200)
  const me = (await s.call('/api/me', { as: 'xuka' })).json
  assert.equal(me.hostId, me.me.id)
})

test('người tạo phòng vào chơi luôn: giữ quyền chủ phòng; đồng đội cùng team thì không có quyền', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s, 'boss')
  const join = await s.post('/api/join', { code: room.code, name: 'Chủ', teamId: room.teams[0].id }, 'boss')
  assert.equal(join.json.host, true)
  await s.post('/api/join', { code: room.code, name: 'Đồng đội', teamId: room.teams[0].id }, 'mate')
  assert.equal((await s.call('/api/owner/overview', { as: 'boss' })).status, 200)
  assert.equal((await s.call('/api/owner/overview', { as: 'mate' })).status, 403)
  const me = (await s.call('/api/me', { as: 'mate' })).json
  assert.notEqual(me.hostId, me.me.id) // cả team thấy hostId nhưng chỉ máy chủ phòng hiện nút
  // Đổi team trước khi bắt đầu: vẫn giữ quyền chủ phòng
  assert.equal((await s.post('/api/leave', {}, 'boss')).json.owner, true)
  assert.equal((await s.post('/api/join', { code: room.code, name: 'Chủ', teamId: room.teams[1].id }, 'boss')).json.host, true)
  assert.equal((await s.post('/api/owner/game', { action: 'start' }, 'boss')).status, 200)
  // Người khác (không có phiên chủ phòng) vào phòng tự tạo không được quyền chủ phòng
  assert.equal((await s.post('/api/join', { code: room.code, name: 'Khách', teamId: room.teams[1].id }, 'guest')).json.host, false)
})

test('vào lại bằng tên: không giành được chỗ của người đang mở trang; không nhận quyền chủ phòng', async t => {
  const s = await startServer(); t.after(s.close)
  s.app.game.ensurePresetRooms()
  const code = (await s.call('/api/rooms/preset')).json[0].code
  assert.equal((await s.post('/api/join', { code, name: 'Xuka' }, 'xuka')).json.host, true)
  const sse = await s.stream('xuka')
  await sse.first
  // Người khác gõ đúng tên trong lúc Xuka đang chơi → từ chối
  const taken = await s.post('/api/join', { code, name: 'xuka' }, 'fake')
  assert.equal(taken.status, 409)
  assert.equal(taken.json.error, 'name-online')
  // Máy cũ đã đóng: nhận lại chỗ, nhưng chỉ là người chơi
  sse.cancel()
  await new Promise(r => setTimeout(r, 50))
  const back = await s.post('/api/join', { code, name: 'xuka' }, 'fake')
  assert.equal(back.status, 200)
  assert.equal(back.json.host, false)
  assert.deepEqual((await s.call('/api/session', { as: 'fake' })).json.roles, ['player'])
  assert.equal((await s.call('/api/owner/overview', { as: 'fake' })).status, 403)
  assert.equal((await s.call('/api/owner/overview', { as: 'xuka' })).status, 200) // phiên gốc vẫn giữ quyền
  // Người tạo phòng (có phiên chủ phòng) vào lại đúng tên thì vẫn là chủ phòng
  const room = await withRoom(s, 'boss')
  await s.post('/api/join', { code: room.code, name: 'Chủ', teamId: room.teams[0].id }, 'boss')
  await s.post('/api/owner/login', { code: room.code, ownerKey: room.ownerKey }, 'boss2')
  assert.equal((await s.post('/api/join', { code: room.code, name: 'chủ', teamId: room.teams[0].id }, 'boss2')).json.host, true)
})

test('cookie lạ sai mã hóa (trang khác cùng máy) không làm hỏng request', async t => {
  const s = await startServer(); t.after(s.close)
  const r = await s.call('/api/session', { headers: { cookie: 'other=%E0%A4%A; x=%' } })
  assert.equal(r.status, 200)
})

test('kênh realtime: một phiên mở quá 4 kết nối thì kết nối cũ nhất bị đóng', async t => {
  const s = await startServer(); t.after(s.close)
  await withRoom(s, 'owner')
  const conns = []
  for (let i = 0; i < 5; i++) {
    conns.push(await s.stream('owner'))
    await conns.at(-1).first
  }
  await conns[0].closed // kết nối đầu bị server đóng
  assert.equal(s.app.hub.size(), 4)
  for (const c of conns.slice(1)) c.cancel()
})

test('tên người chơi: bỏ ký tự đảo chiều / vô hình', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s)
  const r = await s.post('/api/join', { code: room.code, name: '‮An​⁦ Bình', teamId: room.teams[0].id }, 'an')
  assert.equal(r.json.name, 'An Bình')
  assert.equal((await s.post('/api/join', { code: room.code, name: '​‮', teamId: room.teams[0].id })).status, 400)
})

test('phòng có sẵn: chủ phòng bấm Thoát giữa trận rồi vào lại bằng tên → vẫn nhận lại quyền (đã nhả lúc thoát)', async t => {
  const s = await startServer(); t.after(s.close)
  s.app.game.ensurePresetRooms()
  const code = (await s.call('/api/rooms/preset')).json[0].code
  await s.post('/api/join', { code, name: 'Xuka' }, 'xuka')
  await s.post('/api/join', { code, name: 'Nobita' }, 'nobita')
  assert.equal((await s.post('/api/owner/game', { action: 'start' }, 'xuka')).status, 200)
  assert.equal((await s.post('/api/logout', {}, 'xuka')).status, 200)
  assert.equal((await s.call('/api/rooms/preset')).json[0].hasHost, false)
  assert.equal((await s.post('/api/join', { code, name: 'xuka' }, 'xuka')).json.host, true)
  assert.equal((await s.call('/api/owner/overview', { as: 'xuka' })).status, 200)
  // Người chơi thường thoát không ảnh hưởng quyền chủ phòng
  await s.post('/api/logout', {}, 'nobita')
  assert.equal((await s.call('/api/rooms/preset')).json[0].hasHost, true)
})

test('mỗi vai một cookie: cùng một trình duyệt vừa chủ phòng, vừa chơi, vừa mở màn chiếu — không đè nhau', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s, 'me') // cookie chủ phòng
  assert.equal((await s.post('/api/join', { code: room.code, name: 'An', teamId: room.teams[0].id }, 'me')).status, 200) // + cookie người chơi
  assert.equal((await s.post('/api/screen/login', { code: room.code, screenCode: room.screenCode }, 'me')).status, 200) // + cookie màn chiếu
  assert.deepEqual(sessionCookies(s, 'me'), ['vnj_owner', 'vnj_player', 'vnj_screen'])
  // Mỗi trang thấy đúng vai của mình
  assert.deepEqual((await s.call('/api/session', { as: 'me', page: 'team' })).json.roles, ['player', 'owner']) // người tạo phòng chơi luôn: bảng "Chủ phòng ▾" trong màn chơi
  assert.deepEqual((await s.call('/api/session', { as: 'me', page: 'admin' })).json.roles, ['owner', 'player'])
  assert.deepEqual((await s.call('/api/session', { as: 'me', page: 'screen' })).json.roles, ['screen', 'owner'])
  assert.equal((await s.call('/api/me', { as: 'me', page: 'team' })).status, 200)
  const overview = await s.call('/api/owner/overview', { as: 'me', page: 'admin' })
  assert.equal(overview.status, 200)
  assert.equal(overview.json.playing, true) // trang chủ phòng hiện "Quay lại chơi"
  assert.equal((await s.call('/api/screen', { as: 'me', page: 'screen' })).status, 200)
  // Đồng đội (trình duyệt khác) không có quyền chủ phòng
  await s.post('/api/join', { code: room.code, name: 'Bình', teamId: room.teams[0].id }, 'mate', 'team')
  assert.equal((await s.call('/api/owner/overview', { as: 'mate', page: 'team' })).status, 403)
  // Thoát ở màn chơi chỉ xóa cookie người chơi; trang chủ phòng và màn chiếu vẫn chạy
  assert.equal((await s.post('/api/logout', {}, 'me', 'team')).status, 200)
  assert.deepEqual(sessionCookies(s, 'me'), ['vnj_owner', 'vnj_screen'])
  assert.equal((await s.call('/api/owner/overview', { as: 'me', page: 'admin' })).json.playing, false)
  assert.equal((await s.call('/api/screen', { as: 'me', page: 'screen' })).status, 200)
  // Vào lại đúng tên: phiên chủ phòng còn nên vẫn là chủ phòng
  assert.equal((await s.post('/api/join', { code: room.code, name: 'An', teamId: room.teams[0].id }, 'me', 'team')).json.host, true)
  // Thoát ở trang chủ phòng chỉ xóa cookie chủ phòng
  await s.post('/api/logout', {}, 'me', 'admin')
  assert.deepEqual(sessionCookies(s, 'me'), ['vnj_player', 'vnj_screen'])
  assert.equal((await s.call('/api/me', { as: 'me', page: 'team' })).status, 200)
})

test('màn Tham gia: /api/rooms/list trả phòng có sẵn + phòng tự tạo bật "hiện trong danh sách"', async t => {
  const s = await startServer(); t.after(s.close)
  s.app.game.ensurePresetRooms()
  const open = await s.post('/api/rooms', { name: 'Mở', teamCount: 2, listed: true })
  await s.post('/api/rooms', { name: 'Kín', teamCount: 2 })
  const r = await s.call('/api/rooms/list')
  assert.equal(r.status, 200)
  assert.equal(r.json.preset.length, 4)
  assert.deepEqual(r.json.open.map(x => x.code), [open.json.code])
})

test('bảng xếp hạng cá nhân: /api/leaderboard công khai, trang /leaderboard mở được', async t => {
  const s = await startServer(); t.after(s.close)
  const r = await s.call('/api/leaderboard')
  assert.equal(r.status, 200)
  assert.deepEqual(r.json.entries, [])
  assert.equal(r.json.keepDays, 7)
  assert.equal((await s.call('/leaderboard')).status, 200)
})

test('trang chủ dạng landing: / có phần giới thiệu + khu Vào chơi; CSS landing được phục vụ', async t => {
  const s = await startServer(); t.after(s.close)
  const home = await s.call('/')
  assert.equal(home.status, 200)
  for (const id of ['lpTop', 'how', 'modes', 'play', 'heroForm', 'roomList', 'lookupForm', 'createForm']) assert.match(home.text, new RegExp(`id="${id}"`))
  assert.equal((await s.call('/css/landing.css')).status, 200)
})

test('tạo phòng: mỗi trình duyệt tối đa 3 phòng chưa kết thúc (cookie vnj_creator); trình duyệt khác vẫn tạo được', async t => {
  const s = await startServer(); t.after(s.close)
  for (let i = 0; i < RULES.maxRoomsPerCreator; i++) assert.equal((await s.post('/api/rooms', { name: `P${i}`, teamCount: 2 }, 'me')).status, 200)
  assert.ok(s.jar.me.vnj_creator)
  const over = await s.post('/api/rooms', { name: 'Thêm', teamCount: 2 }, 'me')
  assert.equal(over.status, 429)
  assert.equal(over.json.error, 'too-many-own')
  assert.equal((await s.post('/api/rooms', { name: 'Người khác', teamCount: 2 }, 'other')).status, 200)
})

test('POST bị chặn vì Origin sai: trả 403 bad-origin và ghi log (mỗi Origin lạ 1 lần / phút)', async t => {
  const s = await startServer(); t.after(s.close)
  const logs = []
  const warn = console.warn
  console.warn = (...a) => logs.push(a.join(' '))
  t.after(() => { console.warn = warn })
  for (let i = 0; i < 3; i++) {
    const r = await s.call('/api/rooms', { method: 'POST', body: { name: 'P', teamCount: 2 }, headers: { origin: 'https://game.example.vn/' } })
    assert.equal(r.status, 403)
    assert.equal(r.json.error, 'bad-origin')
  }
  assert.equal(logs.length, 1)
  assert.match(logs[0], /Origin "https:\/\/game\.example\.vn\/" khác ALLOWED_ORIGIN "http:\/\/127\.0\.0\.1"/)
})

test('Thoát / rời phòng khi phiên đã hết → vẫn 200 (không báo lỗi đỏ trong console)', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s, 'host')
  await s.post('/api/join', { code: room.code, name: 'An', teamId: room.teams[0].id }, 'an', 'team')
  assert.equal((await s.post('/api/logout', {}, 'an', 'team')).status, 200)
  // Bấm Thoát lần nữa (phiên đã xóa) và máy chưa từng vào phòng
  assert.equal((await s.post('/api/logout', {}, 'an', 'team')).status, 200)
  assert.equal((await s.post('/api/leave', {}, 'an', 'team')).status, 200)
  assert.equal((await s.post('/api/logout', {}, 'la', 'team')).status, 200)
  // API cần đăng nhập vẫn từ chối
  assert.equal((await s.call('/api/me', { as: 'an', page: 'team' })).status, 401)
})

test('long-poll: trả ngay khi chưa có phiên bản, giữ tới khi phòng đổi; tính là đang mở trang; cùng quyền như SSE', async t => {
  const s = await startServer(); t.after(s.close)
  const room = await withRoom(s, 'host')
  await s.post('/api/join', { code: room.code, name: 'An', teamId: room.teams[0].id }, 'an', 'team')
  const player = (await s.call('/api/me', { as: 'an', page: 'team' })).json.me.id
  assert.equal(s.app.hub.isOnline(player), false)

  const first = await s.call('/api/poll?view=team&v=', { as: 'an', page: 'team' })
  assert.equal(first.status, 200)
  assert.equal(first.json.data.room.code, room.code)
  const roomId = s.db.prepare('SELECT id FROM rooms WHERE code = ?').get(room.code).id
  assert.equal(s.app.hub.isOnline(player), true) // dọn phòng / bỏ phiếu đáp án thấy người này
  assert.equal(s.app.hub.roomOnline(roomId), 1)

  // Cùng phiên bản → server giữ; người khác vào phòng (phát tin) → trả bản mới
  let done = false
  const held = s.call(`/api/poll?view=team&v=${first.json.v}`, { as: 'an', page: 'team' }).then(r => { done = true; return r })
  await new Promise(r => setTimeout(r, 150))
  assert.equal(done, false)
  await s.post('/api/join', { code: room.code, name: 'Bình', teamId: room.teams[0].id }, 'binh', 'team')
  const next = await held
  assert.equal(next.status, 200)
  assert.notEqual(next.json.v, first.json.v)
  assert.ok(next.json.data.members.some(m => m.name === 'Bình'))

  // Quyền: chưa đăng nhập 401; người chơi xin dữ liệu chủ phòng 403; màn chiếu chỉ dữ liệu ẩn danh
  assert.equal((await s.call('/api/poll?view=team&v=', { as: 'la', page: 'team' })).status, 401)
  assert.equal((await s.call('/api/poll?view=owner&v=', { as: 'an', page: 'admin' })).status, 403)
  const screen = await s.call('/api/poll?view=screen&v=', { as: 'host', page: 'screen' })
  assert.equal(screen.status, 200)
  assert.equal(screen.json.data.members, undefined)

  // Bị mời ra / thoát → lượt đang giữ trả 401 (trang về màn vào phòng), không còn tính là đang mở trang
  const v = (await s.call('/api/poll?view=team&v=', { as: 'an', page: 'team' })).json.v
  const waiting = s.call(`/api/poll?view=team&v=${v}`, { as: 'an', page: 'team' })
  await new Promise(r => setTimeout(r, 50))
  await s.post('/api/owner/kick', { playerId: player }, 'host', 'admin')
  assert.equal((await waiting).status, 401)
  assert.equal(s.app.hub.isOnline(player), false)
})
