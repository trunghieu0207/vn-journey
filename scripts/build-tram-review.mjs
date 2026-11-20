// Dựng docs/tram-review.html (trang tĩnh để chủ dự án duyệt nội dung chế độ "Chạy trạm")
// từ data/key-hints.json, data/periods.json, data/provinces.json và data/tram-verify-notes.json.
// Mọi văn bản đều được escape; không gọi mạng.
//
// Cách dùng: pnpm run tram:review

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = name => JSON.parse(readFileSync(join(ROOT, 'data', name), 'utf8'))
const { provinces } = readJson('provinces.json')
const { hints } = readJson('key-hints.json')
const { periods } = readJson('periods.json')
const vn = existsSync(join(ROOT, 'data', 'tram-verify-notes.json')) ? readJson('tram-verify-notes.json') : {}
const notes = vn.current || {}
const removed = vn.removed || []

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
// Chỉ cho link http(s) bấm được; còn lại hiện dạng chữ thường
const link = u => /^https?:\/\//i.test(u)
  ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0])}</a>`
  : esc(u)
const sources = list => `<div class="src">Nguồn: ${(list || []).map(link).join(' · ') || '<b class="bad">chưa có</b>'}</div>`
const status = o => o.reviewed ? '<span class="st ok">đã duyệt</span>' : '<span class="st wait">chờ duyệt</span>'
const lv = n => `<span class="lv lv${esc(n)}">Mức ${esc(n)}</span>`

const VLABEL = { ok: 'ok', fixed: 'đã sửa', new: 'câu mới' }
const verdictOf = id => {
  const n = notes[id]
  if (!n) return ''
  const issues = (n.issues || []).map(i => `<li>${esc(i)}</li>`).join('')
  const flag = n.verdict !== 'ok' || issues
  return `<div class="vnote${flag ? ' flag' : ''}"><b>Kiểm chứng: ${esc(VLABEL[n.verdict] || n.verdict)}</b>${n.origin ? ` <small>(từ ${esc(n.origin)})</small>` : ''}${issues ? `<ul>${issues}</ul>` : ''}</div>`
}

const provSections = provinces.map(p => {
  const hs = hints[p.id] || []
  const merged = (p.mergedFrom || []).filter(x => x !== p.name)
  return `<section class="card" id="p-${esc(p.id)}">
  <h3>${esc(p.name)} <small>${esc(p.id)}</small></h3>
  <div class="meta">Đáp án: <b>${esc(p.name)}</b>${merged.length ? ` · gồm các tỉnh cũ: ${merged.map(esc).join(', ')}` : ''}</div>
  ${hs.length ? hs.map(h => `<div class="q">
    <div class="meta">${lv(h.level)} ${status(h)}${h.basedOn?.length ? ` · dựa trên: ${h.basedOn.map(esc).join(', ')}` : ''}</div>
    <div class="content">${esc(h.text)}</div>${sources(h.sources)}</div>`).join('') : '<p class="note">Chưa có gợi ý.</p>'}
</section>`
}).join('\n')

const periodSections = periods.map(pe => {
  const sc = pe.scene || {}
  const qs = pe.questions.map((q, i) => `<div class="q">
    <div class="meta"><b>${i + 1}.</b> <span class="tag">${esc(q.id)}</span> ${lv(q.level)}</div>
    <div class="content">${esc(q.content)}</div>
    <ol class="opts" type="A">${(q.options || []).map((o, k) => `<li class="${k === q.answer ? 'ok' : ''}">${esc(o)}${k === q.answer ? ' (đáp án)' : ''}</li>`).join('')}</ol>
    <div class="exp">${esc(q.explanation)}</div>${sources(q.sources)}${verdictOf(q.id)}</div>`).join('')
  const pz = pe.puzzle || {}
  const splits = Object.keys(pz.splits || {}).sort().map(k => `<tr><th>${esc(k)} mảnh</th><td>${pz.splits[k].map((s, i) => `<span class="piece">${i + 1}. ${esc(s)}</span>`).join(' ')}</td></tr>`).join('')
  return `<section class="card" id="t-${esc(pe.id)}">
  <h2>${esc(pe.name)} <small>${esc(pe.id)} · ${esc(pe.years)}</small> ${status(pe)}</h2>
  <div class="meta">Màu nền: <span class="sw" style="background:${/^#[0-9a-fA-F]{3,8}$/.test(sc.color || '') ? sc.color : '#fff'}"></span> ${esc(sc.color)} · icon: ${(sc.icons || []).map(esc).join(', ')}</div>
  <div class="exp">${esc(sc.blurb)}</div>
  <h3>Câu hỏi (${pe.questions.length})</h3>${qs}
  <h3>Câu ghép</h3>
  <div class="q"><div class="content">${esc(pz.text)}</div><div class="exp">${esc(pz.explanation)}</div>${sources(pz.sources)}${verdictOf(pe.id + '-puzzle')}
    <div class="tbl"><table>${splits}</table></div></div>
</section>`
}).join('\n')

const nHints = Object.values(hints).flat()
const nWait = nHints.filter(h => !h.reviewed).length + periods.filter(p => !p.reviewed).length
const removedHtml = removed.length ? `<div class="card"><h2>Câu đã bỏ khi kiểm chứng</h2><ul>${removed.map(r => `<li><span class="tag">${esc(r.originalId)}</span> ${esc(r.reason)}</li>`).join('')}</ul></div>` : ''

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Duyệt nội dung Chạy trạm – Hành trình 3 miền</title>
<style>
  :root { --bg:#F7F7F7; --card:#fff; --ink:#3C3C3C; --muted:#777; --line:#E5E5E5; --l1:#58CC02; --l1bg:#D7FFB8; --l2:#E5A800; --l2bg:#FFF4C2; --l3:#FF4B4B; --l3bg:#FFDFE0; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 ui-rounded,"SF Pro Rounded","Segoe UI",system-ui,sans-serif; }
  .wrap { max-width:1000px; margin:0 auto; padding:20px 16px 60px; }
  h1 { margin:0 0 4px; color:var(--l1); font-size:26px; font-weight:900; }
  h2 { margin:0 0 8px; font-size:20px; font-weight:900; }
  h3 { margin:14px 0 8px; font-size:16px; font-weight:900; }
  small { color:var(--muted); font-weight:400; font-size:12px; }
  .card { background:var(--card); border:2px solid var(--line); border-radius:18px; box-shadow:0 4px 0 var(--line); padding:14px 16px; margin-bottom:14px; }
  .q { border:2px solid var(--line); border-radius:14px; padding:10px 12px; margin-bottom:10px; }
  .meta { display:flex; flex-wrap:wrap; gap:6px; align-items:center; font-size:13px; color:var(--muted); margin-bottom:6px; }
  .tag { padding:1px 8px; border-radius:999px; background:#F0F0F0; font-size:12px; }
  .content { font-weight:700; margin-bottom:6px; }
  .opts { margin:0 0 6px; padding-left:24px; }
  .opts li { padding:1px 6px; border-radius:8px; }
  .opts li.ok { background:var(--l1bg); font-weight:800; }
  .exp { font-size:13px; color:var(--muted); margin-top:4px; }
  .src { margin-top:6px; font-size:13px; color:var(--muted); word-break:break-word; }
  .src a { color:#1899D6; font-weight:700; text-decoration:none; } .src a:hover { text-decoration:underline; }
  .bad, .note { color:#c22; }
  .lv { padding:2px 10px; border-radius:999px; font-weight:800; font-size:12px; white-space:nowrap; }
  .lv1 { background:var(--l1bg); color:#3a8a00; } .lv2 { background:var(--l2bg); color:#9a6f00; } .lv3 { background:var(--l3bg); color:#c22; }
  .st { padding:2px 10px; border-radius:999px; font-size:12px; font-weight:800; white-space:nowrap; }
  .st.wait { background:var(--l2bg); color:#9a6f00; } .st.ok { background:var(--l1bg); color:#3a8a00; }
  .vnote { margin-top:8px; padding:6px 10px; border-radius:10px; background:#F0F7FF; font-size:13px; }
  .vnote.flag { background:var(--l3bg); }
  .vnote ul { margin:4px 0 0; padding-left:20px; }
  .sw { display:inline-block; width:16px; height:16px; border-radius:4px; border:1px solid var(--line); vertical-align:middle; }
  .tbl { overflow-x:auto; } table { border-collapse:collapse; width:100%; }
  th, td { padding:6px 8px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; } th { white-space:nowrap; font-size:13px; color:var(--muted); }
  .piece { display:inline-block; margin:2px 4px 2px 0; padding:1px 8px; border-radius:8px; background:#F0F0F0; }
  nav a { color:#1899D6; font-weight:700; margin-right:10px; text-decoration:none; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Duyệt nội dung Chạy trạm</h1>
  <div class="card">
    <h2>Cách duyệt</h2>
    <p>Đọc từng mục bên dưới, bấm nguồn để đối chiếu. Duyệt theo hai mức: (1) <b>thời kỳ</b> &mdash; đặt <code>"reviewed": true</code> ở đối tượng thời kỳ trong <code>data/periods.json</code> để duyệt cả thời kỳ (mọi câu hỏi + câu ghép); muốn loại một câu thì xóa câu đó hoặc yêu cầu sửa trước khi duyệt; (2) <b>gợi ý</b> &mdash; đặt <code>"reviewed": true</code> ở từng gợi ý trong <code>data/key-hints.json</code>. Sau đó chạy <code>pnpm run data:check</code> (phải 0 lỗi) và <code>pnpm run tram:review</code> để dựng lại trang. Chỉ mục đã duyệt mới được dùng trong game.</p>
    <p>Hiện còn <b>${nWait}</b> mục chờ duyệt: ${nHints.filter(h => !h.reviewed).length} gợi ý (${provinces.length} tỉnh) và ${periods.filter(p => !p.reviewed).length} thời kỳ. Ô kiểm chứng màu đỏ là chỗ đã sửa, câu mới hoặc có lưu ý.</p>
    <nav>${periods.map(p => `<a href="#t-${esc(p.id)}">${esc(p.name)}</a>`).join('')}<a href="#hints">Gợi ý theo tỉnh</a></nav>
  </div>
${removedHtml}
${periodSections}
  <h2 id="hints" style="margin-top:28px">Gợi ý theo tỉnh (${provinces.length} tỉnh x 2)</h2>
${provSections}
</div>
</body>
</html>
`
writeFileSync(join(ROOT, 'docs', 'tram-review.html'), html)
console.log(`Đã ghi docs/tram-review.html: ${provinces.length} tỉnh, ${nHints.length} gợi ý, ${periods.length} thời kỳ, ${periods.reduce((a, p) => a + p.questions.length, 0)} câu`)
