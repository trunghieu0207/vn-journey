// Phục vụ file tĩnh theo danh sách cho phép cố định — không ghép đường dẫn từ URL,
// nên không thể truy cập file ngoài danh sách (chống path traversal).

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { brotliCompress, gzip, constants as zlib } from 'node:zlib'
import { ROOT } from './db.js'

const brotli = promisify(brotliCompress)
const gzipAsync = promisify(gzip)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
}

// URL → file trong project
const FILES = {
  '/': 'public/team.html',
  '/favicon.svg': 'public/favicon.svg',
  '/favicon.png': 'public/favicon.png',
  '/favicon.ico': 'public/favicon.png', // trình duyệt tự hỏi /favicon.ico — trả PNG (trình duyệt nhận theo nội dung)
  '/apple-touch-icon.png': 'public/apple-touch-icon.png',
  '/team.html': 'public/team.html',
  '/screen.html': 'public/screen.html',
  '/admin.html': 'public/admin.html',
  '/quan-tri': 'public/quan-tri.html',
  '/sysadmin.js': 'public/sysadmin.js',
  '/css/sysadmin.css': 'public/css/sysadmin.css',
  '/rules': 'public/rules.html',
  '/rules.html': 'public/rules.html',
  '/rules.js': 'public/rules.js',
  '/leaderboard': 'public/leaderboard.html',
  '/leaderboard.html': 'public/leaderboard.html',
  '/leaderboard.js': 'public/leaderboard.js',
  '/css/leaderboard.css': 'public/css/leaderboard.css',
  '/css/rules.css': 'public/css/rules.css',
  '/team.js': 'public/team.js',
  '/screen.js': 'public/screen.js',
  '/admin.js': 'public/admin.js',
  '/style.css': 'public/style.css',
  '/css/base.css': 'public/css/base.css',
  '/css/team.css': 'public/css/team.css',
  '/css/map.css': 'public/css/map.css',
  '/css/pages.css': 'public/css/pages.css',
  '/css/landing.css': 'public/css/landing.css',
  '/css/play.css': 'public/css/play.css',
  '/css/hand.css': 'public/css/hand.css',
  '/css/motion.css': 'public/css/motion.css',
  '/css/mobile.css': 'public/css/mobile.css',
  '/shared/map.js': 'public/shared/map.js',
  '/shared/api.js': 'public/shared/api.js',
  '/shared/sound.js': 'public/shared/sound.js',
  '/shared/music.js': 'public/shared/music.js',
  '/shared/nocopy.js': 'public/shared/nocopy.js',
  '/shared/results.js': 'public/shared/results.js',
  '/shared/mascots.js': 'public/shared/mascots.js',
  '/shared/icons.js': 'public/shared/icons.js',
  '/shared/fx.js': 'public/shared/fx.js',
  '/shared/dom.js': 'public/shared/dom.js',
  '/shared/select.js': 'public/shared/select.js',
  '/shared/events.js': 'public/shared/events.js',
  '/shared/shared-q.js': 'public/shared/shared-q.js',
  '/shared/facts.js': 'public/shared/facts.js',
  '/shared/culture.js': 'public/shared/culture.js',
  '/shared/notice.js': 'public/shared/notice.js',
  '/shared/map/assets.js': 'public/shared/map/assets.js',
  '/shared/map/geometry.js': 'public/shared/map/geometry.js',
  '/shared/map/camera-path.js': 'public/shared/map/camera-path.js',
  '/shared/map/effects.js': 'public/shared/map/effects.js',
  '/shared/map/tooltip.js': 'public/shared/map/tooltip.js',
  '/team/state.js': 'public/team/state.js',
  '/team/notify.js': 'public/team/notify.js',
  '/team/entry.js': 'public/team/entry.js',
  '/team/render.js': 'public/team/render.js',
  '/team/dialogs.js': 'public/team/dialogs.js',
  '/team/actions.js': 'public/team/actions.js',
  '/team/question.js': 'public/team/question.js',
  '/team/defense.js': 'public/team/defense.js',
  '/team/siege-fx.js': 'public/team/siege-fx.js',
  '/team/final.js': 'public/team/final.js',
  '/team/cards.js': 'public/team/cards.js',
  '/team/shared.js': 'public/team/shared.js',
  '/team/journey.js': 'public/team/journey.js',
  '/team/host.js': 'public/team/host.js',
  '/team/menu.js': 'public/team/menu.js',
  '/team/siege-bet.js': 'public/team/siege-bet.js',
  '/data/map-geo.json': 'data/map-geo.json',
  '/fonts/nunito.ttf': 'public/fonts/nunito.ttf',
}

// Nội dung đã đọc + đã nén, theo file (cả project ~1 MB). Đọc lại khi file đổi (so mtime) — sửa public/* không cần khởi động lại
const cache = new Map()
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg', '.ttf'])

async function load(rel) {
  const path = join(ROOT, rel)
  const { mtimeMs } = await stat(path)
  const hit = cache.get(rel)
  if (hit?.mtimeMs === mtimeMs) return hit
  const body = await readFile(path)
  const ext = rel.slice(rel.lastIndexOf('.'))
  const entry = {
    mtimeMs, body, ext,
    etag: `"${createHash('sha1').update(body).digest('base64url').slice(0, 22)}"`,
    // Nén một lần (luồng nền của zlib, không chặn server), dùng lại cho mọi lượt tải
    br: COMPRESS.has(ext) ? await brotli(body, { params: { [zlib.BROTLI_PARAM_QUALITY]: 9, [zlib.BROTLI_PARAM_SIZE_HINT]: body.length } }) : null,
    gz: COMPRESS.has(ext) ? await gzipAsync(body, { level: 9 }) : null,
  }
  cache.set(rel, entry)
  return entry
}

export async function serveStatic(req, res, pathname) {
  const rel = Object.hasOwn(FILES, pathname) ? FILES[pathname] : null
  if (!rel || !['GET', 'HEAD'].includes(req.method)) return false
  let f
  try {
    f = await load(rel)
  } catch {
    return false
  }
  // no-cache = trình duyệt giữ bản cũ nhưng hỏi lại mỗi lần; ETag khớp → 304 không kèm nội dung (deploy xong thấy bản mới ngay)
  const head = { 'Cache-Control': 'no-cache', ETag: f.etag, Vary: 'Accept-Encoding' }
  if (req.headers['if-none-match'] === f.etag) {
    res.writeHead(304, head)
    res.end()
    return true
  }
  const accept = String(req.headers['accept-encoding'] ?? '')
  const [body, encoding] = f.br && /\bbr\b/.test(accept) ? [f.br, 'br']
    : f.gz && /\bgzip\b/.test(accept) ? [f.gz, 'gzip']
    : [f.body, null]
  res.writeHead(200, {
    ...head,
    'Content-Type': TYPES[f.ext] || 'application/octet-stream',
    'Content-Length': body.length,
    ...(encoding ? { 'Content-Encoding': encoding } : {}),
  })
  res.end(req.method === 'HEAD' ? undefined : body)
  return true
}
