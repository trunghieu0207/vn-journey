// Kiểm tra một câu hỏi trước khi lưu (trang quản trị) — cùng luật với scripts/validate-data.mjs:
// lỗi (errors) chặn lưu; cảnh báo (warnings) chỉ hiện cho người sửa.

export const QUESTION_KINDS = ['choice', 'truefalse', 'text']
export const QUESTION_STATUS = ['new', 'ok', 'fix']

const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

// q: { province, difficulty, topic, kind, level, content, options, answer, explanation, sources }
// ctx: { provinces: Map(id → { name, mergedFrom }), topics: { id: name } }
export function checkQuestion(q, { provinces, topics }) {
  const errors = [], warnings = []
  const prov = provinces.get(q.province)
  if (!prov) errors.push('Tỉnh không hợp lệ')
  if (!['normal', 'siege'].includes(q.difficulty)) errors.push('Loại câu phải là câu thường hoặc câu thử tài')
  if (!Object.hasOwn(topics, q.topic ?? '')) errors.push('Chủ đề không hợp lệ')
  if (!QUESTION_KINDS.includes(q.kind)) errors.push('Kiểu câu không hợp lệ')
  if (![1, 2, 3].includes(q.level)) errors.push('Mức độ phải là 1, 2 hoặc 3')
  else if (q.difficulty === 'siege' && q.level === 1) warnings.push('Câu thử tài nhưng mức Dễ')
  if (typeof q.content !== 'string' || q.content.trim().length < 10) errors.push('Nội dung câu hỏi quá ngắn (ít nhất 10 ký tự)')
  if (String(q.content ?? '').length > 500) errors.push('Nội dung câu hỏi quá dài (tối đa 500 ký tự)')
  if (!q.explanation?.trim()) warnings.push('Chưa có lời giải')
  if (String(q.explanation ?? '').length > 800) errors.push('Lời giải quá dài (tối đa 800 ký tự)')

  let correct = []
  if (q.kind === 'choice') {
    const opts = Array.isArray(q.options) ? q.options : []
    if (opts.length < 2 || opts.length > 4) errors.push('Câu trắc nghiệm cần 2–4 lựa chọn')
    if (opts.some(o => typeof o !== 'string' || !o.trim() || o.length > 120)) errors.push('Lựa chọn không được trống, tối đa 120 ký tự')
    else if (new Set(opts.map(o => norm(o.trim()))).size !== opts.length) errors.push('Các lựa chọn bị trùng nhau')
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= opts.length) errors.push('Chưa chọn đáp án đúng')
    else correct = [opts[q.answer]]
  } else if (q.kind === 'truefalse') {
    if (typeof q.answer !== 'boolean') errors.push('Đáp án phải là Đúng hoặc Sai')
  } else if (q.kind === 'text') {
    if (!Array.isArray(q.answer) || !q.answer.length || q.answer.some(a => typeof a !== 'string' || !a.trim() || a.length > 80)) {
      errors.push('Cần ít nhất một cách viết đáp án (mỗi cách tối đa 80 ký tự)')
    } else correct = q.answer
  }

  // Nguồn: ≥ 2 link https (luật đợt 3); thiếu chỉ cảnh báo — câu cũ chưa có nguồn vẫn sửa được
  const sources = q.sources ?? []
  if (!Array.isArray(sources) || sources.length > 6) errors.push('Tối đa 6 link nguồn')
  else {
    for (const u of sources) {
      let ok = false
      try { ok = new URL(u).protocol === 'https:' && u.length <= 400 } catch {}
      if (!ok) errors.push(`Link nguồn không hợp lệ (chỉ nhận https): ${String(u).slice(0, 80)}`)
    }
    if (sources.length < 2) warnings.push('Chưa đủ 2 nguồn kiểm chứng độc lập')
  }

  // Lộ đáp án: đáp án đúng nằm trong nội dung câu, chứa tên tỉnh đang đứng, hoặc nội dung nhắc "(… cũ)"
  if (prov && correct.length) {
    const content = norm(q.content ?? '')
    if (correct.some(a => a.trim().length >= 3 && content.includes(norm(a.trim())))) warnings.push('Đáp án đúng xuất hiện ngay trong nội dung câu hỏi')
    if (correct.some(a => norm(a).includes(norm(prov.name)))) warnings.push(`Đáp án đúng chứa tên tỉnh "${prov.name}" — người chơi đang đứng ở đây nên dễ đoán`)
  }
  if (/\([^)]*\bcũ\)/i.test(q.content ?? '')) warnings.push('Nội dung có "(… cũ)" — dễ lộ tỉnh cũ là đáp án')
  return { errors, warnings }
}
