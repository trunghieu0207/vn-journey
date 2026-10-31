// Thông báo chung của ban tổ chức (bật trong trang quản trị): dải chữ trên cùng mọi trang, hỏi lại mỗi phút.
// Không cần đăng nhập; chữ đưa vào bằng textContent.

const POLL_MS = 60_000
let bar = null

async function check() {
  let text = null
  try {
    const res = await fetch('/api/notice', { cache: 'no-store', credentials: 'same-origin' })
    if (res.ok) text = (await res.json()).text
  } catch {}
  if (!text) {
    bar?.remove()
    bar = null
    return
  }
  if (!bar) {
    bar = document.createElement('div')
    bar.className = 'notice-bar'
    bar.setAttribute('role', 'status')
    document.body.prepend(bar)
  }
  bar.textContent = text
}

check()
setInterval(() => { if (!document.hidden) check() }, POLL_MS)
