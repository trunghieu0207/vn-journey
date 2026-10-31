// Tiện ích DOM dùng chung cho 3 màn. Dữ liệu động luôn đưa vào bằng textContent / append (không innerHTML) để chống XSS.

export const $ = id => document.getElementById(id)

/** Tạo phần tử: attrs `onclick`… thành sự kiện, `true` thành thuộc tính rỗng, `false` / null bỏ qua. */
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v)
  }
  e.append(...children)
  return e
}

export const button = (text, cls, onclick, extra = {}) => el('button', { type: 'button', class: `btn ${cls}`, onclick, ...extra }, text)
