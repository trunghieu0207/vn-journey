// Nội dung giả cho test Chạy trạm: không đọc data/ thật, không chứa tên tỉnh trong gợi ý.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const provinceIds = JSON.parse(readFileSync(fileURLToPath(new URL('../../data/provinces.json', import.meta.url)), 'utf8'))
  .provinces.map(p => p.id)

const SOURCES = ['https://vi.wikipedia.org/wiki/Test_1', 'https://vi.wikipedia.org/wiki/Test_2']

function makePeriod(id, name, years) {
  const questions = Array.from({ length: 6 }, (_, i) => ({
    id: `${id}-${String(i + 1).padStart(2, '0')}`,
    kind: 'choice',
    content: `Câu hỏi số ${i + 1} của thời kỳ ${name}?`,
    options: ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'],
    answer: i % 4,
    explanation: `Giải thích câu ${i + 1}.`,
    level: (i % 3) + 1,
    sources: SOURCES,
  }))
  // 7 mảnh (từ) chia đều cho n = 3..7 theo thứ tự đúng
  const words = ['một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy'].map(w => `${w} ${id}`)
  const text = words.join(' ')
  const splits = {}
  for (let n = 3; n <= 7; n++) {
    const parts = Array.from({ length: n }, () => [])
    words.forEach((w, i) => parts[Math.floor(i * n / words.length)].push(w))
    splits[n] = parts.map(g => g.join(' '))
  }
  return {
    id, name, years,
    scene: { color: '#8a6d3b', icons: ['trong-dong', 'nha-san', 'chim-lac'], blurb: `Bối cảnh ${name}.` },
    questions,
    puzzle: { text, explanation: `Giải thích ghép ${name}.`, sources: SOURCES, splits },
  }
}

export function tramFixtureWith({ hintProvinces = provinceIds } = {}) {
  const periods = new Map([
    ['p-a', makePeriod('p-a', 'Thời kỳ A', '100-200')],
    ['p-b', makePeriod('p-b', 'Thời kỳ B', '200-300')],
  ])
  const hints = new Map()
  hintProvinces.forEach((province, i) => {
    hints.set(province, [1, 2].map(level => ({
      level, text: `Gợi ý số ${i + 1} cấp ${level}`, sources: SOURCES, basedOn: 'kiểm thử',
    })))
  })
  return { periods, hints }
}

export const tramFixture = tramFixtureWith()
