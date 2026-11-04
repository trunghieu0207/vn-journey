// Server-Sent Events: đẩy trạng thái realtime. Mỗi kết nối chỉ nhận dữ liệu theo quyền của mình
// (người chơi chỉ thấy team mình; màn chiếu thấy bản ẩn danh; chủ phòng thấy toàn bộ phòng của mình).
// Long-polling (dự phòng khi proxy công ty giữ luồng SSE lại): trang hỏi kèm số phiên bản đã có, server giữ request
// tới khi phòng có thay đổi (tối đa POLL_HOLD_MS) rồi trả trạng thái — mỗi lần là một phản hồi trọn vẹn nên proxy chuyển ngay.

const HEARTBEAT_MS = 15_000
// Mỗi phiên tối đa vài kết nối (vài tab cùng trình duyệt); mở thêm thì đóng kết nối cũ nhất — mỗi lần phát tin
// server dựng dữ liệu cho từng kết nối, nên một phiên mở hàng nghìn kết nối sẽ làm chậm cả server
const MAX_PER_SESSION = 4
// Giữ request long-poll tối đa 25 giây (dưới proxy_read_timeout 30 giây của Nginx)
const POLL_HOLD_MS = 25_000
// Người dùng long-poll được tính là đang mở trang nếu đã hỏi trong khoảng này (giữa hai lượt có khe nhỏ)
const POLL_ALIVE_MS = 35_000

// isValid(session): phiên còn hiệu lực không (bị kick / đăng xuất / phòng bị xóa → đóng kết nối)
// now: đồng hồ (test truyền đồng hồ giả)
export function createHub(viewFor, isValid = () => true, now = Date.now) {
  const clients = new Set()
  const waiters = new Set()   // request long-poll đang giữ: { session, view, reply, timer }
  const pollers = new Map()   // token_hash → { session, at } — lần hỏi gần nhất, để biết ai đang mở trang
  // Phiên bản dữ liệu của phòng: tăng mỗi lần phát tin (phát cho mọi phòng thì tăng `everyone`)
  const versions = new Map()
  let everyone = 0
  const versionOf = roomId => `${everyone}.${versions.get(roomId) ?? 0}`

  function send(client) {
    if (!isValid(client.session)) {
      clients.delete(client)
      client.res.end()
      return
    }
    let data
    try {
      data = viewFor(client.session, client.view)
    } catch {
      return // ví dụ team vừa bị xóa: bỏ qua, phiên sẽ hết hạn
    }
    client.res.write(`event: state\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // Trả lời một request long-poll: phiên hết hạn → 401 (trang về màn vào); không dựng được dữ liệu → 409, trang hỏi lại sau
  function answer(w) {
    waiters.delete(w)
    clearTimeout(w.timer)
    if (!isValid(w.session)) return w.reply(401, { error: 'unauthorized', message: 'Chưa đăng nhập' })
    pollers.set(w.session.token_hash, { session: w.session, at: now() })
    let data
    try {
      data = viewFor(w.session, w.view)
    } catch {
      return w.reply(409, { error: 'retry', message: 'Thử lại sau' })
    }
    w.reply(200, { v: versionOf(w.session.room_id), data })
  }

  // Phiên đang mở trang: kết nối SSE + người long-poll còn hỏi gần đây (phiên đã hết hiệu lực thì bỏ)
  function* present() {
    for (const c of clients) yield c.session
    const t = now()
    for (const [key, p] of pollers) {
      if (t - p.at > POLL_ALIVE_MS || !isValid(p.session)) pollers.delete(key)
      else yield p.session
    }
  }

  const heartbeat = setInterval(() => {
    for (const c of clients) c.res.write(': ping\n\n')
  }, HEARTBEAT_MS)
  heartbeat.unref()

  return {
    connect(req, res, session, view) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // tắt buffering khi chạy sau Nginx
      })
      res.write('retry: 2000\n\n')
      const same = [...clients].filter(c => c.session.token_hash === session.token_hash)
      for (const old of same.slice(0, Math.max(0, same.length - MAX_PER_SESSION + 1))) {
        clients.delete(old)
        old.res.end()
      }
      const client = { res, session, view }
      clients.add(client)
      send(client)
      req.on('close', () => clients.delete(client))
    },
    // Long-poll: `since` khác phiên bản hiện tại (hoặc chưa có) → trả ngay; trùng → giữ tới khi phòng đổi / hết POLL_HOLD_MS.
    // reply(status, body) do app ghi (kèm header bảo mật như mọi API)
    poll(req, session, view, since, reply) {
      pollers.set(session.token_hash, { session, at: now() })
      const w = { session, view, reply, timer: null }
      if (since !== versionOf(session.room_id)) return answer(w)
      // Mỗi phiên giữ tối đa vài request (vài tab): thêm nữa thì trả request cũ nhất ngay
      const same = [...waiters].filter(x => x.session.token_hash === session.token_hash)
      for (const old of same.slice(0, Math.max(0, same.length - MAX_PER_SESSION + 1))) answer(old)
      w.timer = setTimeout(() => answer(w), POLL_HOLD_MS)
      waiters.add(w)
      req.on('close', () => { waiters.delete(w); clearTimeout(w.timer) })
    },
    // Gọi sau mỗi thay đổi: gửi lại trạng thái cho mọi kết nối của phòng đó (không truyền = mọi phòng)
    broadcast(roomId = null) {
      if (roomId == null) everyone++
      else versions.set(roomId, (versions.get(roomId) ?? 0) + 1)
      for (const c of clients) if (roomId == null || c.session.room_id === roomId) send(c)
      for (const w of [...waiters]) if (roomId == null || w.session.room_id === roomId) answer(w)
    },
    size: () => clients.size + waiters.size,
    // Số kết nối realtime đang mở của một phòng (trang quản trị) — tính cả người long-poll
    roomOnline(roomId) {
      let n = 0
      for (const s of present()) if (s.room_id === roomId) n++
      return n
    },
    // Người chơi của team đang mở trang — để bỏ phiếu đáp án biết khi nào cả team đã đồng ý
    onlinePlayers(teamId) {
      const ids = new Set()
      for (const s of present()) if (s.role === 'player' && s.team_id === teamId) ids.add(s.player_id)
      return [...ids]
    },
    // Người chơi này đang mở trang ở đâu đó không (vào lại bằng tên chỉ được khi máy cũ đã đóng)
    isOnline(playerId) {
      for (const s of present()) if (s.role === 'player' && s.player_id === playerId) return true
      return false
    },
    close() {
      clearInterval(heartbeat)
      for (const c of clients) c.res.end()
      clients.clear()
      for (const w of waiters) { clearTimeout(w.timer); w.reply(503, { error: 'closing', message: 'Máy chủ đang khởi động lại' }) }
      waiters.clear()
      pollers.clear()
    },
  }
}
