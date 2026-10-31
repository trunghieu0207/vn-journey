// Phục vụ file tĩnh theo danh sách cho phép cố định — không ghép đường dẫn từ URL,
// nên không thể truy cập file ngoài danh sách (chống path traversal).

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT } from './db.js'

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

export async function serveStatic(req, res, pathname) {
  const rel = Object.hasOwn(FILES, pathname) ? FILES[pathname] : null
  if (!rel || !['GET', 'HEAD'].includes(req.method)) return false
  let body
  try {
    body = await readFile(join(ROOT, rel))
  } catch {
    return false
  }
  const ext = rel.slice(rel.lastIndexOf('.'))
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  })
  res.end(req.method === 'HEAD' ? undefined : body)
  return true
}
