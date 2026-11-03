// Chống sao chép câu hỏi (chốt 4/11): trong vùng [data-nocopy] không bôi đen / nhấn giữ / chuột phải / kéo chữ / Ctrl+C được;
// lỡ copy được (vd. qua công cụ của trình duyệt) thì thứ dán ra chỉ là một dòng nhắc. Ô nhập (câu tự điền) vẫn dùng bình thường.
// Chỉ gây khó cho kiểu "bôi đen rồi dán vào Google / ChatGPT" — chụp màn hình thì không chặn được; lớp chặn chính là luật
// thưởng nhanh + đồng hồ + trượt giảm điểm tỉnh.

const NOTE = 'Câu hỏi Hành trình 3 miền — không sao chép được'
const typing = el => !!el?.closest?.('input, textarea, [contenteditable]')
const elementOf = node => (node?.nodeType === 1 ? node : node?.parentElement)
// Phần tử thuộc vùng chặn (trừ ô nhập)
const guarded = node => {
  const el = elementOf(node)
  return !!el?.closest('[data-nocopy]') && !typing(el)
}
// Vùng đang bôi đen có chạm vào vùng chặn không (kể cả Ctrl+A cả trang)
function selectionTouches() {
  const s = getSelection()
  if (!s || s.isCollapsed) return false
  return [...document.querySelectorAll('[data-nocopy]')].some(el => s.containsNode(el, true))
}

for (const type of ['copy', 'cut']) {
  document.addEventListener(type, e => {
    if (typing(document.activeElement)) return // đang gõ đáp án: copy / dán như thường
    if (!guarded(e.target) && !selectionTouches()) return
    e.preventDefault()
    e.clipboardData?.setData('text/plain', NOTE)
  })
}
for (const type of ['contextmenu', 'selectstart', 'dragstart']) {
  document.addEventListener(type, e => { if (guarded(e.target)) e.preventDefault() })
}
