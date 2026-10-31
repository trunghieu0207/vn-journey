// Header bảo mật, đọc body có giới hạn, cookie, giới hạn tần suất, kiểm tra Origin.

export const MAX_BODY_BYTES = 10 * 1024

export function securityHeaders(res, { https = false } = {}) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000')
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

export const sendError = (res, status, code, message) => sendJson(res, status, { error: code, message })

// Đọc JSON body: chỉ chấp nhận application/json, tối đa MAX_BODY_BYTES
export function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] || ''
    if (!type.startsWith('application/json')) return reject(Object.assign(new Error('Cần Content-Type: application/json'), { status: 415 }))
    let size = 0
    let tooBig = false
    const chunks = []
    req.on('data', chunk => {
      if (tooBig) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        // Ngừng giữ dữ liệu; app trả 413 kèm "Connection: close" để đóng kết nối sau khi gửi lỗi
        tooBig = true
        chunks.length = 0
        reject(Object.assign(new Error('Dữ liệu gửi lên quá lớn'), { status: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooBig) return
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error()
        resolve(data)
      } catch {
        reject(Object.assign(new Error('JSON không hợp lệ'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

export function parseCookies(header = '') {
  const out = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    // Cookie của trang khác cùng máy (cookie không phân biệt cổng) có thể sai mã hóa: bỏ qua thay vì làm hỏng mọi request
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {}
  }
  return out
}

// Mỗi vai một cookie: cùng một cửa sổ trình duyệt vừa làm chủ phòng, vừa chơi, vừa mở màn chiếu mà không đè phiên nhau
export const SESSION_COOKIES = { player: 'vnj_player', owner: 'vnj_owner', screen: 'vnj_screen', sysadmin: 'vnj_sysadmin' }

export function sessionCookie(role, token, maxAgeSec, { secure }) {
  return [
    `${SESSION_COOKIES[role]}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

export const clearCookie = (role, { secure }) => sessionCookie(role, '', 0, { secure })

// Chặn request POST từ trang khác (chống CSRF, bổ sung cho SameSite=Strict).
// Không có header Origin (công cụ dòng lệnh) thì cho qua — cookie SameSite vẫn bảo vệ trình duyệt.
export function originAllowed(req, allowedOrigin) {
  const origin = req.headers.origin
  return !origin || origin === allowedOrigin
}

// Giới hạn tần suất kiểu "cửa sổ trượt" trong bộ nhớ
export function createRateLimiter({ windowMs, max, now = Date.now }) {
  const hits = new Map()
  return {
    allow(key) {
      const t = now()
      const list = (hits.get(key) || []).filter(x => x > t - windowMs)
      if (list.length >= max) {
        hits.set(key, list)
        return false
      }
      list.push(t)
      hits.set(key, list)
      return true
    },
    cleanup() {
      const t = now()
      for (const [k, list] of hits) if (!list.some(x => x > t - windowMs)) hits.delete(k)
    },
  }
}
