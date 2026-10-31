// Định tuyến HTTP. Tách khỏi index.js để test gọi trực tiếp được.
// Mọi phiên gắn với một phòng: người chơi / chủ phòng / màn chiếu chỉ thấy dữ liệu phòng của mình.

import { createGame, GameError } from './game.js'
import { createAuth, hashSecret, verifySecret, safeEqual } from './auth.js'
import { randomCode } from './config.js'
import { createHub } from './sse.js'
import { serveStatic } from './static.js'
import {
  securityHeaders, sendJson, sendError, readJson, parseCookies, SESSION_COOKIES,
  sessionCookie, clearCookie, originAllowed, createRateLimiter,
} from './security.js'

// Băm sẵn một mã giả để khi mã phòng sai vẫn tốn thời gian như khi mã phòng đúng (không dò được phòng tồn tại)
const DUMMY_HASH = hashSecret('dummy-owner-key')

export function createApp({ db, config, now = Date.now, random = Math.random }) {
  const game = createGame(db, {
    now, random,
    newCode: randomCode,
    hashSecret,
    defaultDurationMin: config.gameDurationMin,
    freezeBeforeEndMin: config.freezeBeforeEndMin,
  })
  const auth = createAuth(db, { now })
  // Loại dữ liệu realtime mỗi vai được xem. Trang tự chọn bằng ?view= (chủ phòng mở màn chiếu cần dữ liệu màn chiếu)
  const STREAM_VIEWS = { team: ['player'], screen: ['screen', 'owner'], owner: ['owner'] }
  const DEFAULT_VIEW = { player: 'team', screen: 'screen', owner: 'owner' }
  // Mỗi vai một cookie (security.js). Trang nào dùng phiên vai nào, theo thứ tự ưu tiên: header X-Vnj-Page do shared/api.js gửi,
  // kênh realtime suy từ ?view=. Không có header (test, công cụ dòng lệnh) thì thử mọi vai
  const PAGE_ROLES = { team: ['player'], admin: ['owner', 'player'], screen: ['screen', 'owner'] }
  const ALL_ROLES = ['player', 'owner', 'screen']
  const VIEW_PAGE = { team: 'team', owner: 'admin', screen: 'screen' }
  const hub = createHub((session, view) => {
    const room = game.room(session.room_id)
    return view === 'team' ? room.teamView(session.team_id)
      : view === 'owner' ? room.ownerView()
      : room.screenView()
  }, session => auth.isValid(session))

  // Cả văn phòng thường ra Internet chung 1 IP → giới hạn theo IP phải đủ rộng cho ~100 người vào phòng cùng lúc
  const createLimiter = createRateLimiter({ windowMs: 60_000, max: 5, now })
  const joinLimiter = createRateLimiter({ windowMs: 60_000, max: 150, now })
  const listLimiter = createRateLimiter({ windowMs: 60_000, max: 300, now })
  const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 10, now })
  const apiLimiter = createRateLimiter({ windowMs: 10_000, max: 60, now })
  const limiters = [createLimiter, joinLimiter, loginLimiter, apiLimiter]
  const cookieOpts = { secure: config.cookieSecure }

  const ipOf = req => (config.trustProxy && req.headers['x-real-ip']) || req.socket.remoteAddress || 'unknown'
  const setSession = (res, role, s) => res.appendHeader('Set-Cookie', sessionCookie(role, s.token, s.maxAgeSec, cookieOpts))
  const dropSession = (res, role) => res.appendHeader('Set-Cookie', clearCookie(role, cookieOpts))

  // Các phiên còn hiệu lực của request, theo vai (cookie của vai nào chỉ nhận phiên đúng vai đó)
  function sessionsOf(req) {
    const cookies = parseCookies(req.headers.cookie)
    const out = {}
    for (const role of ALL_ROLES) {
      const s = auth.getSession(cookies[SESSION_COOKIES[role]])
      if (s?.role === role) out[role] = { ...s, token: cookies[SESSION_COOKIES[role]] }
    }
    return out
  }

  // Các phiên trang `page` được dùng, theo thứ tự ưu tiên
  const pageList = (sessions, page) => (Object.hasOwn(PAGE_ROLES, page ?? '') ? PAGE_ROLES[page] : ALL_ROLES).map(r => sessions[r]).filter(Boolean)

  // Phiên dùng cho request: phiên đầu tiên của trang có một trong các quyền `allowed` (không có thì phiên đầu tiên)
  function pickSession(sessions, page, allowed) {
    const list = pageList(sessions, page)
    return list.find(s => allowed && rolesOf(s).some(r => allowed.includes(r))) ?? list[0] ?? null
  }
  const roomOf = session => game.room(session.room_id)

  // ---------- Bảng định tuyến ----------
  // auth: null = công khai; mảng = các role được phép. limit: bộ giới hạn theo IP cho route công khai.
  const routes = {
    'GET /api/health': { auth: null, run: () => ({ ok: true }) },

    // ----- Phòng (công khai) -----
    'POST /api/rooms': {
      auth: null, limit: createLimiter,
      run: ({ body, res }) => {
        const r = game.createRoom({ name: body.name, teamCount: body.teamCount, durationMin: body.durationMin, topicChoice: body.topicChoice === true, betChoice: body.betChoice !== false,
          mode: body.mode === 'solo' ? 'solo' : 'team', pioneer: body.pioneer !== false, quizCount: body.quizCount, listed: body.listed === true })
        setSession(res, 'owner', auth.createSession('owner', { roomId: r.roomId }))
        return { role: 'owner', code: r.code, ownerKey: r.ownerKey, screenCode: r.screenCode }
      },
    },
    // Phòng chơi đơn có sẵn: ai vào trước làm chủ phòng
    'GET /api/rooms/preset': { auth: null, limit: joinLimiter, run: () => game.presetRooms() },
    // Màn Tham gia (tự làm mới 10 giây): phòng có sẵn + phòng tự tạo bật "hiện trong danh sách". Hạn mức riêng để không ăn vào lượt vào phòng
    'GET /api/rooms/list': { auth: null, limit: listLimiter, run: () => ({ preset: game.presetRooms(), open: game.publicRooms() }) },
    // Bảng xếp hạng cá nhân cả sự kiện (phòng chơi đơn) — trang /leaderboard và màn chiếu
    'GET /api/leaderboard': { auth: null, limit: listLimiter, run: () => game.leaderboard() },
    'POST /api/rooms/lookup': { auth: null, limit: joinLimiter, run: ({ body }) => game.lobby(body.code) },
    'POST /api/join': {
      auth: null, limit: joinLimiter,
      run: ({ body, res, sessions }) => {
        // Người tạo phòng (có phiên chủ phòng) vào chơi luôn phòng của mình: phiên người chơi mới giữ quyền chủ phòng.
        // Cookie chủ phòng vẫn giữ nguyên (mỗi vai một cookie)
        const p = game.joinRoom(body.code, body.name, body.teamId, typeof body.home === 'string' ? body.home : null,
          { ownerRoomId: sessions.owner?.room_id ?? null, isOnline: hub.isOnline })
        setSession(res, 'player', auth.createSession('player', { roomId: p.roomId, teamId: p.teamId, playerId: p.playerId, noHost: p.noHost }))
        hub.broadcast(p.roomId) // chủ phòng + màn chiếu thấy người mới ngay
        return { role: 'player', teamId: p.teamId, name: p.name, host: p.host }
      },
    },
    'POST /api/owner/login': {
      auth: null, limit: loginLimiter,
      run: ({ body, res }) => {
        const room = db.prepare('SELECT id, owner_key_hash FROM rooms WHERE code = ?').get(String(body.code ?? '').trim().toUpperCase())
        const ok = verifySecret(String(body.ownerKey ?? '').trim().toUpperCase(), room?.owner_key_hash ?? DUMMY_HASH)
        if (!room || !ok) throw new GameError('bad-owner', 'Mã phòng hoặc mã chủ phòng không đúng', 401)
        setSession(res, 'owner', auth.createSession('owner', { roomId: room.id }))
        return { role: 'owner' }
      },
    },
    'POST /api/screen/login': {
      auth: null, limit: loginLimiter,
      run: ({ body, res }) => {
        const room = db.prepare('SELECT id, screen_code FROM rooms WHERE code = ?').get(String(body.code ?? '').trim().toUpperCase())
        const ok = safeEqual(String(body.screenCode ?? '').trim().toUpperCase(), room?.screen_code ?? '')
        if (!room || !ok) throw new GameError('bad-code', 'Mã phòng hoặc mã màn chiếu không đúng', 401)
        setSession(res, 'screen', auth.createSession('screen', { roomId: room.id }))
        return { role: 'screen' }
      },
    },
    'POST /api/logout': {
      auth: ['player', 'screen', 'owner'],
      // Chỉ thoát vai của trang đang mở (trang chủ phòng thoát chủ phòng, màn chơi thoát người chơi)
      run: ({ res, session }) => {
        if (session.role === 'player' && rolesOf(session).includes('owner')) roomOf(session).releaseHost(session.player_id)
        auth.destroySession(session.token)
        dropSession(res, session.role)
        return { ok: true }
      },
    },
    // Đang có phiên gì (luôn 200): trang mở ra hỏi trước, chưa đăng nhập thì hiện màn vào — không gọi API cần đăng nhập
    // rồi nhận 401 (trình duyệt in lỗi đỏ trong console dù đó là đường đi bình thường)
    'GET /api/session': { auth: null, run: ({ pageSessions }) => ({ roles: [...new Set(pageSessions.flatMap(rolesOf))] }) },
    'GET /api/provinces': { auth: ['player', 'screen', 'owner'], run: () => game.provinceList() },

    // ----- Người chơi -----
    'GET /api/me': {
      auth: ['player'],
      run: ({ session }) => ({ ...roomOf(session).teamView(session.team_id), me: { id: session.player_id, name: session.player_name } }),
    },
    // Sổ tay hành trình (phòng đơn): của chính người chơi
    'GET /api/journal': { auth: ['player'], run: ({ session }) => roomOf(session).journal(session.team_id, session.player_id) },
    'POST /api/leave': {
      auth: ['player'], change: true,
      run: ({ session, sessions, res }) => {
        roomOf(session).leave(session.player_id) // xóa người chơi → phiên bị xóa theo
        dropSession(res, 'player')
        // Người tạo phòng rời để đổi team: cookie chủ phòng vẫn còn — vào lại team khác vẫn giữ quyền
        return { ok: true, owner: sessions.owner?.room_id === session.room_id }
      },
    },
    'POST /api/move': {
      auth: ['player'], change: true,
      run: ({ session, body }) => roomOf(session).move(session.team_id, String(body.provinceId ?? ''), session.player_name),
    },
    'POST /api/retry': { auth: ['player'], change: true, run: ({ session }) => roomOf(session).retry(session.team_id, session.player_name) },
    'POST /api/siege': { auth: ['player'], change: true, run: ({ session }) => roomOf(session).siege(session.team_id, session.player_name) },
    'POST /api/question': {
      auth: ['player'], change: true,
      run: ({ session, body }) => roomOf(session).chooseTopic(session.team_id, String(body.topic ?? ''), session.player_name, body.bet === true),
    },
    'POST /api/defend': {
      auth: ['player'], change: true,
      run: ({ session, body }) => roomOf(session).defend(session.team_id, Number(body.duelId), body.answer, session.player_name, body.round ?? null),
    },
    // Cược số hiệp khi thử tài (đội công thành hoặc đội giữ tỉnh)
    'POST /api/siege-bet': {
      auth: ['player'], change: true,
      run: ({ session, body }) => roomOf(session).betSiege(session.team_id, Number(body.duelId), body.rounds, session.player_name),
    },
    'POST /api/vote': {
      auth: ['player'], change: true,
      run: ({ session, body }) => roomOf(session).vote(session.team_id, session.player_id, String(body.questionId ?? ''), body.answer,
        session.player_name, hub.onlinePlayers(session.team_id)),
    },
    // "Đã từng / Muốn thử": mỗi người tự chọn, chỉ trả về số đếm gộp
    'POST /api/react': {
      auth: ['player'],
      run: ({ session, body }) => roomOf(session).react(session.team_id, session.player_id, String(body.province ?? ''),
        String(body.kind ?? ''), body.value === 'been' || body.value === 'want' ? body.value : body.value == null ? null : 'bad'),
    },
    // Câu hỏi chung cả phòng: mỗi người một phiếu (không gửi tên, không lưu theo team)
    'POST /api/shared-vote': {
      auth: ['player'], change: true,
      run: ({ session, body }) => roomOf(session).voteShared(session.player_id, body.answer),
    },
    'POST /api/skip': { auth: ['player'], change: true, run: ({ session }) => roomOf(session).skip(session.team_id, session.player_name) },
    'POST /api/retreat': { auth: ['player'], change: true, run: ({ session }) => roomOf(session).retreat(session.team_id, session.player_name) },
    'POST /api/answer': {
      auth: ['player'], change: true,
      run: ({ session, body }) => roomOf(session).answer(session.team_id, String(body.questionId ?? ''), body.answer, session.player_name),
    },
    'POST /api/card': {
      auth: ['player'], change: true,
      run: ({ session, body }) => roomOf(session).useCard(session.team_id, Number(body.cardId), String(body.target ?? ''), session.player_name),
    },

    // ----- Màn chiếu -----
    'GET /api/screen': { auth: ['screen', 'owner'], run: ({ session }) => roomOf(session).screenView() },
    // Toàn bộ diễn biến + điểm chi tiết: chỉ mở sau khi kết thúc (lúc đó người chơi cũng được xem tổng kết)
    'GET /api/replay': { auth: ['player', 'screen', 'owner'], run: ({ session }) => roomOf(session).replay() },

    // ----- Chủ phòng (MC) -----
    // playing: phiên này là người chơi giữ quyền chủ phòng (trang chủ phòng hiện nút "Quay lại chơi" thay cho "Vào chơi")
    'GET /api/owner/overview': {
      auth: ['owner'],
      run: ({ session, sessions }) => ({ ...roomOf(session).ownerView(), playing: sessions.player?.room_id === session.room_id }),
    },
    'GET /api/owner/question-stats': { auth: ['owner'], run: ({ session }) => roomOf(session).questionStats() },
    'POST /api/owner/game': {
      auth: ['owner'], change: true,
      run: ({ session, body }) => {
        const room = roomOf(session)
        const actions = { start: room.start, pause: room.pause, resume: room.resume, end: room.end, reset: room.reset }
        const fn = Object.hasOwn(actions, body.action) ? actions[body.action] : null
        if (!fn) throw new GameError('bad-action', 'Hành động không hợp lệ')
        fn()
        return { status: room.state().status }
      },
    },
    'POST /api/owner/event': {
      auth: ['owner'], change: true,
      run: ({ session, body }) => roomOf(session).triggerEvent(String(body.kind ?? ''), String(body.region ?? '')),
    },
    'POST /api/owner/shared': {
      auth: ['owner'], change: true,
      run: ({ session, body }) => {
        const room = roomOf(session)
        if (body.action === 'start') return room.startShared()
        if (body.action === 'reveal') return { ok: room.settleShared(true) }
        throw new GameError('bad-action', 'Hành động không hợp lệ')
      },
    },
    'POST /api/owner/score': {
      auth: ['owner'], change: true,
      run: ({ session, body }) => {
        roomOf(session).adjustScore(Number(body.teamId), Number(body.delta), body.reason)
        return { ok: true }
      },
    },
    'POST /api/owner/settings': {
      auth: ['owner'], change: true,
      run: ({ session, body }) => {
        const room = roomOf(session)
        if ('topicChoice' in body) room.setTopicChoice(body.topicChoice === true)
        if ('betChoice' in body) room.setBetChoice(body.betChoice === true)
        return { ok: true }
      },
    },
    'POST /api/owner/rename': {
      auth: ['owner'], change: true,
      run: ({ session, body }) => roomOf(session).renamePlayer(body.playerId, body.name),
    },
    'POST /api/owner/kick': {
      auth: ['owner'], change: true,
      run: ({ session, body }) => {
        roomOf(session).kickPlayer(body.playerId)
        return { ok: true }
      },
    },
  }

  // Quyền của phiên: người chơi đang giữ quyền chủ phòng (phòng có sẵn, vào trước) có thêm quyền chủ phòng của phòng mình.
  // Phiên có được nhờ vào lại bằng tên của chủ phòng (no_host) thì không
  function rolesOf(session) {
    if (session.role !== 'player' || session.no_host) return [session.role]
    try {
      return game.room(session.room_id).state().host_player_id === session.player_id ? ['player', 'owner'] : ['player']
    } catch {
      return ['player'] // phòng vừa bị xóa
    }
  }

  async function handle(req, res) {
    securityHeaders(res, { https: config.cookieSecure })
    const url = new URL(req.url, 'http://localhost')
    const pathname = url.pathname

    if (!pathname.startsWith('/api/')) {
      if (await serveStatic(req, res, pathname)) return
      return sendError(res, 404, 'not-found', 'Không tìm thấy')
    }

    const sessions = sessionsOf(req)
    // Đã đăng nhập: giới hạn theo phiên (nhiều người chung IP văn phòng); chưa đăng nhập: theo IP
    const any = Object.values(sessions)[0]
    if (!apiLimiter.allow(any ? `t:${any.token_hash}` : `ip:${ipOf(req)}`)) {
      return sendError(res, 429, 'too-many', 'Thao tác quá nhanh, thử lại sau giây lát')
    }

    // Kết nối realtime
    if (pathname === '/api/stream' && req.method === 'GET') {
      const asked = url.searchParams.get('view')
      const valid = asked != null && Object.hasOwn(STREAM_VIEWS, asked)
      const session = pickSession(sessions, valid ? VIEW_PAGE[asked] : null, valid ? STREAM_VIEWS[asked] : null)
      if (!session) return sendError(res, 401, 'unauthorized', 'Chưa đăng nhập')
      const view = asked || DEFAULT_VIEW[session.role]
      if (!Object.hasOwn(STREAM_VIEWS, view) || !rolesOf(session).some(r => STREAM_VIEWS[view].includes(r))) {
        return sendError(res, 403, 'unauthorized', 'Không có quyền')
      }
      return hub.connect(req, res, session, view)
    }

    const route = Object.hasOwn(routes, `${req.method} ${pathname}`) ? routes[`${req.method} ${pathname}`] : null
    if (!route) return sendError(res, 404, 'not-found', 'Không tìm thấy')

    if (req.method === 'POST' && !originAllowed(req, config.allowedOrigin)) {
      return sendError(res, 403, 'bad-origin', 'Yêu cầu không hợp lệ')
    }
    const page = req.headers['x-vnj-page']
    const session = pickSession(sessions, page, route.auth)
    const pageSessions = pageList(sessions, page)
    if (route.limit && !route.limit.allow(ipOf(req))) {
      return sendError(res, 429, 'too-many', 'Thử quá nhiều lần, thử lại sau 1 phút')
    }
    if (route.auth && (!session || !rolesOf(session).some(r => route.auth.includes(r)))) {
      return sendError(res, session ? 403 : 401, 'unauthorized', 'Không có quyền')
    }

    try {
      const body = req.method === 'POST' ? await readJson(req) : {}
      const result = route.run({ req, res, body, session, sessions, pageSessions })
      sendJson(res, 200, result ?? { ok: true })
      if (route.change) hub.broadcast(session.room_id)
    } catch (e) {
      if (e instanceof GameError) return sendError(res, e.status, e.code, e.message)
      if (e.status === 413) res.setHeader('Connection', 'close')
      if (e.status) return sendError(res, e.status, 'bad-request', e.message)
      console.error(e) // chi tiết lỗi chỉ ghi ở server, không gửi về client
      sendError(res, 500, 'server-error', 'Lỗi máy chủ')
    }
  }

  // Theo dõi các thay đổi theo thời gian (hết giờ, hết sự kiện, câu hỏi quá giờ) để đẩy cập nhật từng phòng
  const lastSignature = new Map()
  let ticks = 0
  function tick() {
    const changed = new Set(game.expireQuestions())
    for (const roomId of game.activeRoomIds()) {
      const room = game.room(roomId)
      if (room.settleShared()) changed.add(roomId) // câu hỏi chung hết giờ → công bố
      if (room.settleSiegeBets()) changed.add(roomId) // hết hạn cược thử tài → vào hiệp 1
      const s = room.state()
      const ev = s.active_event && JSON.parse(s.active_event)
      const signature = `${s.status}|${ev && ev.until > now() ? s.active_event : ''}|${s.freeze_at && now() >= s.freeze_at}`
      if (signature !== lastSignature.get(roomId)) {
        lastSignature.set(roomId, signature)
        changed.add(roomId)
      }
    }
    for (const roomId of changed) hub.broadcast(roomId)
    if (++ticks % 60 === 0) {
      game.cleanupRooms()
      if (config.presetRooms) game.ensurePresetRooms()
      for (const id of lastSignature.keys()) if (!game.activeRoomIds().includes(id)) lastSignature.delete(id)
    }
    for (const l of limiters) l.cleanup()
    auth.cleanup()
  }

  return { handle, tick, hub, game, auth }
}
