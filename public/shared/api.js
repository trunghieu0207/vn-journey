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
 * Mở kênh realtime `/api/stream` (SSE), tự kết nối lại khi rớt mạng.
 * view: loại dữ liệu trang cần ('team' | 'screen' | 'owner') — server kiểm tra vai có được xem không.
 * onState(data): mỗi lần server đẩy trạng thái. onStatus('online' | 'offline'). onUnauthorized(): phiên hết hạn.
 * Dự phòng: proxy / tường lửa công ty hay giữ luồng SSE lại (kết nối mở mà không tin nào tới — server luôn gửi trạng thái
 * ngay khi kết nối). Im lặng STREAM_SILENT_MS → bỏ SSE, chuyển sang long-poll `/api/poll`: server giữ request tới khi
 * phòng có thay đổi rồi trả trọn một phản hồi, nên đi qua proxy vẫn gần như tức thì.
 */
const STREAM_SILENT_MS = 5000
const POLL_GAP_MS = 400    // khoảng nghỉ tối thiểu giữa hai lượt hỏi (phòng đông thay đổi liên tục)
const POLL_RETRY_MS = 2000 // lỗi mạng / máy chủ bận: chờ rồi hỏi lại
const sleep = ms => new Promise(r => setTimeout(r, ms))

export function connectStream({ view, onState, onStatus = () => {}, onUnauthorized = () => {} }) {
  const url = `/api/stream?view=${encodeURIComponent(view)}`
  let es = null
  let retryTimer = null
  let closed = false
  let polling = false
  let gotState = false

  async function longPoll() {
    let version = ''
    while (!closed) {
      const started = Date.now()
      try {
        const r = await api(`/api/poll?view=${encodeURIComponent(view)}&v=${encodeURIComponent(version)}`)
        if (closed) return
        version = r.v
        onStatus('online')
        try { onState(r.data) } catch (err) { console.error(err) }
      } catch (err) {
        if (closed) return
        if (err.status === 401 || err.status === 403) { closed = true; return onUnauthorized() }
        onStatus('offline')
        await sleep(POLL_RETRY_MS)
      }
      await sleep(Math.max(0, POLL_GAP_MS - (Date.now() - started)))
    }
  }

  const silentTimer = setTimeout(() => {
    if (closed || gotState) return
    console.warn('Kênh realtime không nhận được dữ liệu (có thể do proxy) — chuyển sang long-polling')
    polling = true
    clearTimeout(retryTimer)
    es?.close()
    longPoll()
  }, STREAM_SILENT_MS)

  function open() {
    es = new EventSource(url)
    es.addEventListener('state', e => {
      gotState = true
      onStatus('online')
      try { onState(JSON.parse(e.data)) } catch (err) { console.error(err) }
    })
    es.addEventListener('error', async () => {
      if (closed || polling) return
      onStatus('offline')
      // Trình duyệt tự kết nối lại nếu chỉ rớt mạng; nếu bị đóng hẳn (vd. 401) thì kiểm tra phiên rồi mở lại
      if (es.readyState !== EventSource.CLOSED) return
      const ctrl = new AbortController()
      const probe = await fetch(url, { signal: ctrl.signal, cache: 'no-store' }).catch(() => null)
      ctrl.abort()
      if (probe?.status === 401 || probe?.status === 403) return onUnauthorized()
      clearTimeout(retryTimer)
      if (!polling) retryTimer = setTimeout(open, 2000)
    })
  }
  open()

  return {
    close() {
      closed = true
      clearTimeout(retryTimer)
      clearTimeout(silentTimer)
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
