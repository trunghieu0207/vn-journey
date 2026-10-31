// Server-Sent Events: đẩy trạng thái realtime. Mỗi kết nối chỉ nhận dữ liệu theo quyền của mình
// (người chơi chỉ thấy team mình; màn chiếu thấy bản ẩn danh; chủ phòng thấy toàn bộ phòng của mình).

const HEARTBEAT_MS = 15_000
// Mỗi phiên tối đa vài kết nối (vài tab cùng trình duyệt); mở thêm thì đóng kết nối cũ nhất — mỗi lần phát tin
// server dựng dữ liệu cho từng kết nối, nên một phiên mở hàng nghìn kết nối sẽ làm chậm cả server
const MAX_PER_SESSION = 4

// isValid(session): phiên còn hiệu lực không (bị kick / đăng xuất / phòng bị xóa → đóng kết nối)
export function createHub(viewFor, isValid = () => true) {
  const clients = new Set()

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
    // Gọi sau mỗi thay đổi: gửi lại trạng thái cho mọi kết nối của phòng đó (không truyền = mọi phòng)
    broadcast(roomId = null) {
      for (const c of clients) if (roomId == null || c.session.room_id === roomId) send(c)
    },
    size: () => clients.size,
    // Người chơi của team đang mở trang (có kết nối realtime) — để bỏ phiếu đáp án biết khi nào cả team đã đồng ý
    onlinePlayers(teamId) {
      const ids = new Set()
      for (const c of clients) if (c.session.role === 'player' && c.session.team_id === teamId) ids.add(c.session.player_id)
      return [...ids]
    },
    // Người chơi này đang mở trang ở đâu đó không (vào lại bằng tên chỉ được khi máy cũ đã đóng)
    isOnline(playerId) {
      for (const c of clients) if (c.session.role === 'player' && c.session.player_id === playerId) return true
      return false
    },
    close() {
      clearInterval(heartbeat)
      for (const c of clients) c.res.end()
      clients.clear()
    },
  }
}
