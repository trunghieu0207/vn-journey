// Chuyển 34 file GeoJSON cấp tỉnh thành dữ liệu SVG gọn nhẹ cho game.
// Chỉ dùng module built-in của Node. Không chạy code nào từ dữ liệu đầu vào.
//
// Cách dùng:
//   node scripts/build-map.mjs <thư mục chứa *.geojson> [file đầu ra .json | .js]

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const inputDir = process.argv[2]
const outFile = process.argv[3] || join(ROOT, 'data', 'map-geo.json')
if (!inputDir) {
  console.error('Thiếu thư mục đầu vào: node scripts/build-map.mjs <thư mục geojson>')
  process.exit(1)
}

// Phép chiếu equirectangular, hiệu chỉnh theo vĩ độ trung tâm 16°N
const PROJ = { lon0: 101.8, lat0: 23.6, k: 60, cos: Math.cos(16 * Math.PI / 180) }
const project = ([lon, lat]) => [(lon - PROJ.lon0) * PROJ.cos * PROJ.k, (PROJ.lat0 - lat) * PROJ.k]

const SIMPLIFY_TOLERANCE = 0.5  // đơn vị SVG (~0,9 km)
const ISLET_SIZE = 3            // vòng nhỏ hơn mức này vẽ thành chấm
const ADJ_DISTANCE = 0.003      // độ (~300 m): hai điểm biên coi là trùng
const ADJ_MIN_MATCHES = 5       // số điểm trùng tối thiểu để coi là giáp ranh

// ---------- Đọc dữ liệu ----------
const files = readdirSync(inputDir).filter(f => f.endsWith('.geojson')).sort()
if (files.length !== 34) throw new Error(`Cần 34 file .geojson, tìm thấy ${files.length}`)

const provinces = files.map(file => {
  const fc = JSON.parse(readFileSync(join(inputDir, file), 'utf8'))
  if (fc.type !== 'FeatureCollection' || fc.features?.length !== 1) throw new Error(`${file}: không đúng định dạng`)
  const { properties: pr, geometry: g } = fc.features[0]
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null
  if (!polygons) throw new Error(`${file}: kiểu hình học ${g.type} không hỗ trợ`)
  return {
    id: String(pr.codeName).replace(/_/g, '-'),
    code: String(pr.code),
    name: String(pr.name),
    fullName: String(pr.fullName),
    isCity: String(pr.fullName).startsWith('Thành phố'),
    areaKm2: Number(pr.areaKm2),
    polygons,
  }
})

// ---------- Giáp ranh: so khớp điểm biên gần nhau ----------
const CELL = 0.01
const grid = new Map()
for (const p of provinces) {
  for (const poly of p.polygons) for (const ring of poly) for (const [lon, lat] of ring) {
    const key = `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key).push([lon, lat, p.id])
  }
}
const matches = new Map()
for (const p of provinces) {
  for (const poly of p.polygons) for (const ring of poly) for (const [lon, lat] of ring) {
    const cx = Math.floor(lon / CELL), cy = Math.floor(lat / CELL)
    const seen = new Set()
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const [x, y, id] of grid.get(`${cx + dx},${cy + dy}`) || []) {
        if (id <= p.id || seen.has(id)) continue
        if (Math.hypot(x - lon, y - lat) < ADJ_DISTANCE) {
          seen.add(id)
          const k = `${p.id}|${id}`
          matches.set(k, (matches.get(k) || 0) + 1)
        }
      }
    }
  }
}
const adjacency = [...matches]
  .filter(([, n]) => n >= ADJ_MIN_MATCHES)
  .map(([k, n]) => [...k.split('|'), n])
  .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))

// ---------- Đơn giản hóa đường biên (Douglas–Peucker) ----------
function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}
function simplify(pts, tol) {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    let max = 0, idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e])
      if (d > max) { max = d; idx = i }
    }
    if (max > tol) {
      keep[idx] = 1
      stack.push([s, idx], [idx, e])
    }
  }
  return pts.filter((_, i) => keep[i])
}

const bboxOf = pts => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
const ringArea = pts => Math.abs(pts.reduce((s, [x, y], i) => {
  const [nx, ny] = pts[(i + 1) % pts.length]
  return s + x * ny - nx * y
}, 0)) / 2

function inside([x, y], ring) {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c
  }
  return c
}
function edgeDist(pt, ring) {
  let min = Infinity
  for (let i = 0; i < ring.length - 1; i++) min = Math.min(min, segDist(pt, ring[i], ring[i + 1]))
  return min
}
// Điểm nằm sâu nhất trong vùng (để đặt tên tỉnh): dò lưới thô rồi tinh chỉnh
function labelPoint(ring) {
  let [x0, y0, x1, y1] = bboxOf(ring)
  let best = null, bestD = -1
  for (let pass = 0; pass < 4; pass++) {
    const N = 24
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const pt = [x0 + (x1 - x0) * i / N, y0 + (y1 - y0) * j / N]
      if (!inside(pt, ring)) continue
      const d = edgeDist(pt, ring)
      if (d > bestD) { bestD = d; best = pt }
    }
    const w = (x1 - x0) / 6, h = (y1 - y0) / 6
    ;[x0, y0, x1, y1] = [best[0] - w, best[1] - h, best[0] + w, best[1] + h]
  }
  return best
}

const r1 = n => Math.round(n * 10) / 10
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
const out = provinces.map(p => {
  const parts = [], islets = []
  let mainRing = null, mainArea = 0
  for (const poly of p.polygons) {
    poly.forEach((ring, ri) => {
      const proj = ring.map(project)
      const [bx0, by0, bx1, by1] = bboxOf(proj)
      minX = Math.min(minX, bx0); minY = Math.min(minY, by0)
      maxX = Math.max(maxX, bx1); maxY = Math.max(maxY, by1)
      if (ri === 0 && Math.max(bx1 - bx0, by1 - by0) < ISLET_SIZE) {
        const c = [r1((bx0 + bx1) / 2), r1((by0 + by1) / 2)]
        if (!islets.some(([x, y]) => Math.hypot(x - c[0], y - c[1]) < 2)) islets.push(c)
        return
      }
      const simp = simplify(proj, SIMPLIFY_TOLERANCE)
      if (simp.length < 4) return
      parts.push('M' + simp.slice(0, -1).map(([x, y]) => `${r1(x)},${r1(y)}`).join('L') + 'Z')
      if (ri === 0) {
        const a = ringArea(proj)
        if (a > mainArea) { mainArea = a; mainRing = proj }
      }
    })
  }
  const [lx, ly] = labelPoint(mainRing)
  return {
    id: p.id, code: p.code, name: p.name, fullName: p.fullName, isCity: p.isCity,
    areaKm2: p.areaKm2, d: parts.join(''), label: [r1(lx), r1(ly)], islets,
  }
})

const result = {
  source: 'ThangLeQuoc/vietnamese-provinces-database v5.2.0 (MIT) — dữ liệu gốc từ sapnhap.bando.com.vn',
  generatedAt: new Date().toISOString(),
  projection: PROJ,
  bounds: [r1(minX), r1(minY), r1(maxX), r1(maxY)],
  provinces: out,
  adjacency,
}

mkdirSync(dirname(outFile), { recursive: true })
// Đuôi .js → bọc thành biến toàn cục để mở được trực tiếp bằng file:// (dùng cho mockup)
writeFileSync(outFile, outFile.endsWith('.js')
  ? `window.MAP_DATA = ${JSON.stringify(result)};\n`
  : JSON.stringify(result))
const kb = Math.round(Buffer.byteLength(JSON.stringify(result)) / 1024)
console.log(`Đã ghi ${outFile} (${kb} KB): ${out.length} tỉnh, ${adjacency.length} cặp giáp ranh, ${out.reduce((s, p) => s + p.islets.length, 0)} chấm đảo nhỏ`)
