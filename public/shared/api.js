// Gọi API + kênh realtime (SSE) dùng chung cho các màn hình.

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

// Trang đang mở — server dùng phiên của đúng vai trang này (mỗi vai một cookie: chủ phòng, người chơi, màn chiếu không đè nhau)
const PAGE = location.pathname.startsWith('/admin') ? 'admin' : location.pathname.startsWith('/screen') ? 'screen' : 'team'

export async function api(path, body) {
  const opts = body === undefined
    ? { method: 'GET', headers: { 'X-Vnj-Page': PAGE } }
    : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vnj-Page': PAGE }, body: JSON.stringify(body) }
  let res
  try {
    res = await fetch(path, { ...opts, credentials: 'same-origin', cache: 'no-store' })
  } catch {
    throw new ApiError(0, 'network', 'Mất kết nối tới máy chủ, đang thử lại…')
  }
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) throw new ApiError(res.status, data?.error || 'error', data?.message || 'Có lỗi xảy ra, thử lại sau')
  return data
}

// Phiên của trang phải có một trong các vai `wanted`, không thì ném lỗi 401 như API cần đăng nhập (người gọi hiện màn vào)
export async function requireRole(...wanted) {
  const { roles } = await api('/api/session')
  if (!wanted.some(r => roles.includes(r))) throw new ApiError(401, 'unauthorized', 'Chưa đăng nhập')
}

/**
 * Mở kênh SSE `/api/stream`, tự kết nối lại khi rớt mạng.
 * view: loại dữ liệu trang cần ('team' | 'screen' | 'owner') — server kiểm tra vai có được xem không.
 * onState(data): mỗi lần server đẩy trạng thái. onStatus('online' | 'offline'). onUnauthorized(): phiên hết hạn.
 */
export function connectStream({ view, onState, onStatus = () => {}, onUnauthorized = () => {} }) {
  const url = `/api/stream?view=${encodeURIComponent(view)}`
  let es = null
  let retryTimer = null
  let closed = false

  function open() {
    es = new EventSource(url)
    es.addEventListener('state', e => {
      onStatus('online')
      try { onState(JSON.parse(e.data)) } catch (err) { console.error(err) }
    })
    es.addEventListener('error', async () => {
      onStatus('offline')
      // Trình duyệt tự kết nối lại nếu chỉ rớt mạng; nếu bị đóng hẳn (vd. 401) thì kiểm tra phiên rồi mở lại
      if (es.readyState !== EventSource.CLOSED || closed) return
      const ctrl = new AbortController()
      const probe = await fetch(url, { signal: ctrl.signal, cache: 'no-store' }).catch(() => null)
      ctrl.abort()
      if (probe?.status === 401 || probe?.status === 403) return onUnauthorized()
      clearTimeout(retryTimer)
      retryTimer = setTimeout(open, 2000)
    })
  }
  open()

  return {
    close() {
      closed = true
      clearTimeout(retryTimer)
      es?.close()
    },
  }
}

// Đồng hồ theo giờ server (bù lệch giờ máy khách)
export function serverClock() {
  let offset = 0
  return {
    sync(serverNow) { offset = serverNow - Date.now() },
    now: () => Date.now() + offset,
  }
}

export function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
