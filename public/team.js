// Màn hình người chơi (Phase 3): tạo phòng / vào phòng, rồi chơi cùng team.
// Mọi luật chơi kiểm tra ở server; client chỉ hiển thị và gửi thao tác.
// Dữ liệu động luôn gán bằng textContent (không innerHTML) để chống XSS.
// Phần còn lại tách theo chức năng trong public/team/ — file này: nhận trạng thái từ server, phím tắt, âm thanh, khởi động.

import { sound } from '/shared/sound.js'
import { music } from '/shared/music.js'
import '/shared/nocopy.js'
import { icon, fillIcons } from '/shared/icons.js'
import { $ } from '/shared/dom.js'
import * as fx from '/shared/fx.js'
import { enhanceSelects } from '/shared/select.js'
import { closeDialog, dlg } from '/team/dialogs.js'
import { enter, lookup, markOwnerRoom, showEntry } from '/team/entry.js'
import { loadFinal } from '/team/final.js'
import { addJournal, eventSign, eventText, showLost, storage, toast } from '/team/notify.js'
import { applyHelp, openQuestion, openTopicPicker, showTeammateResult } from '/team/question.js'
import { defenseEnded, defenseUpdated, openDefense } from '/team/defense.js'
import { siegeTakeover } from '/team/siege-fx.js'
import { betUpdated, defKey, openSiegeBet } from '/team/siege-bet.js'
import { renderAll } from '/team/render.js'
import { renderShared, sharedDlg } from '/team/shared.js'
import '/team/journey.js'
import { toggleCover } from '/team/menu.js'
import { clock, hostBtnWhere, nameOf, now, state } from '/team/state.js'

fillIcons()
enhanceSelects()

// Đếm ngược 3·2·1 tới mốc bắt đầu của server (mọi máy cùng lúc); hết đếm ngược mới đi được → vẽ lại
function startCountdown(view) {
  const ms = view.startedAt - now()
  if (!fx.reducedMotion) fx.countdown('Bắt đầu!', ms)
  setTimeout(renderAll, Math.max(0, ms) + 50)
}

// ---------- Nhận trạng thái từ server ----------
export function apply(view) {
  const prev = state.me
  state.me = { ...view, me: view.me ?? prev?.me }
  const myId = state.me.me?.id
  if (prev && myId && view.hostId === myId && prev.hostId !== myId) toast(`Bạn vừa nhận quyền chủ phòng — bấm "Chủ phòng" (${hostBtnWhere()})`)
  // Chủ phòng sửa tên mình: lấy tên mới từ danh sách thành viên (SSE không gửi lại `me`)
  const self = state.me.me && view.members.find(m => m.id === state.me.me.id)
  if (self && self.name !== state.me.me.name) {
    if (prev) toast(`Chủ phòng đã đổi tên bạn thành ${self.name}`)
    state.me.me = { ...state.me.me, name: self.name }
  }
  clock.sync(view.serverNow)
  setMusicMode(view)
  // Mở / tải lại trang giữa lúc đếm ngược: đếm tiếp phần còn lại
  if (!prev && view.status === 'running' && view.startedAt > now()) startCountdown(view)

  if (prev) {
    // Chiếm được tỉnh mới / mất tỉnh
    const before = new Set(prev.mine.map(m => m.province))
    const after = new Set(view.mine.map(m => m.province))
    for (const id of after) {
      if (!before.has(id)) {
        sound.capture()
        const from = prev.known?.[id] === 'taken' ? 'var(--taken)' : null // công thành: tỉnh xám → màu team
        setTimeout(() => state.map.capture(id, view.team.color, state.map.byId.get(id)?.points, from), 50)
        if (from) siegeTakeover(id, true) // công thành thắng: huy hiệu đội mình húc văng "?" khỏi tỉnh
      }
    }
    for (const id of before) if (!after.has(id)) setTimeout(() => state.map.lose(id, prev.team.color), 50)

    if (prev.status !== view.status) {
      const start = view.status === 'running' && prev.status === 'waiting'
      const msg = { running: prev.status === 'paused' ? 'Trận đấu tiếp tục!' : 'Trận đấu bắt đầu!', paused: view.shared ? 'Câu hỏi chung cả phòng — trận tạm dừng' : 'Chủ phòng tạm dừng trận đấu', ended: 'Hết giờ!', waiting: 'Chủ phòng cho chơi lại từ đầu' }[view.status]
      if (msg) {
        // Bắt đầu trận: đếm ngược 3 · 2 · 1 thay cho thông báo (máy giảm chuyển động: vẫn hiện thông báo)
        if (start) startCountdown(view)
        if (!start || fx.reducedMotion) toast(msg)
        addJournal(msg)
        sound.event()
      }
      if (start) closeDialog()
    }
    const evKey = e => (e ? `${e.kind}|${e.region}|${e.until}` : '')
    if (view.event && evKey(view.event) !== evKey(prev.event)) {
      const text = eventText(view.event)
      if (fx.reducedMotion) toast(text, false, view.event.kind)
      else fx.hangSign(eventSign(view.event))
      addJournal(text)
      sound.event()
    }
    // Thẻ mới nhận: lật thẻ rồi bay vào khay (đợi đóng hộp thoại kết quả)
    const had = new Set(prev.cards.map(c => c.id))
    state.cardQueue.push(...view.cards.filter(c => !had.has(c.id)))
  }

  // Cảnh báo mất tỉnh: chỉ hiện các cảnh báo chưa xem (lưu mốc đã xem trên máy)
  const seenKey = `vnj-alert-${view.team.id}-${state.me.me?.id}`
  const latest = Math.max(0, ...view.alerts.map(a => a.at))
  const seen = storage(seenKey)
  if (seen == null) storage(seenKey, latest)
  else {
    const fresh = view.alerts.filter(a => a.at > seen).sort((a, b) => a.at - b.at)
    if (fresh.length) {
      storage(seenKey, latest)
      showLost(fresh.map(a => nameOf(a.province)).join(', '))
    }
  }

  renderAll()
  renderShared(prev)
  if (prev?.current !== view.current && view.current) {
    if (prev?.current) state.map.arrive()
    else state.map.zoomTo(view.current)
    // Đồng đội vừa đưa team sang tỉnh khác (không phải mình bấm)
    const last = view.log[0]
    if (prev?.current && !state.moving && last?.action === 'move' && last.by && last.by !== state.me.me?.name) {
      toast(`${last.by} đưa team tới ${nameOf(view.current)}`)
    }
  }

  // Kết quả câu trả lời do đồng đội (hoặc server khi hết giờ) gửi — người tự trả lời đã thấy từ phản hồi
  const res = view.lastResult
  if (prev && res && res.at !== prev.lastResult?.at && res.by !== state.me.me?.name) showTeammateResult(res)
  // Kết thúc: tải tổng kết, lộ màu thật trên bản đồ; chơi lại thì bỏ tổng kết cũ
  if (view.status === 'ended' && !state.final) loadFinal()
  if (view.status !== 'ended' && state.final) {
    state.final = null
    if (state.dialogMode === 'results') closeDialog()
    renderAll()
  }
  // Đội khác đang công thành tỉnh của mình (đấu tay đôi): khung phòng thủ ưu tiên trước câu / khung chọn của mình
  // (đồng hồ câu của mình vẫn chạy — team tự chia người). Lượt đã "Bỏ qua" thì không mở lại.
  // Mỗi giai đoạn (cược số hiệp) và mỗi hiệp là một khung riêng (defKey)
  const defense = view.status === 'running' ? view.defense.find(d => !state.defenseSkipped.has(defKey(d))) ?? null : null
  const sameDefense = defense && state.defense && defKey(state.defense) === defKey(defense)
  // Hiệp sau phát sớm (chưa tính giờ): mở cùng lúc với đoàn khách (không ai được đọc câu trước)
  const defenseLater = defense?.phase === 'play' && defense.issuedAt - now() > 900
  if (defense && !sameDefense && defenseLater) {
    if (state.dialogMode === 'defense' && !state.defending) closeDialog() // câu hiệp vừa xong (giữ state.defense để báo kết quả hiệp)
    clearTimeout(state.defenseTimer)
    state.defenseTimer = setTimeout(() => {
      const d = state.me?.defense.find(x => defKey(x) === defKey(defense))
      if (d && !state.defending && !(state.defense && defKey(state.defense) === defKey(d))) openDefense(d)
    }, defense.issuedAt - now() - 800)
  }
  if (defense && !sameDefense && !defenseLater && !state.answering && !state.defending) {
    if (defense.phase === 'bet') openSiegeBet(defense, 'def')
    else openDefense(defense)
  }
  if (defense && sameDefense && !state.defending) {
    if (defense.phase === 'bet') betUpdated(defense)
    else defenseUpdated(defense)
  }
  if (!defense && state.defense && !state.defending) defenseEnded(state.defense)
  const defending = state.dialogMode === 'defense'
  // Mình vừa bấm Thử tài (hoặc đồng đội bấm / tải lại trang): khung cược số hiệp; hết cược thì đóng (câu hiệp 1 mở ngay sau)
  const siegeBet = view.status === 'running' ? view.siegeBet : null
  if (siegeBet && !defending && !(state.dialogMode === 'siegebet' && dlg.open)) openSiegeBet(siegeBet, 'att')
  else if (siegeBet) betUpdated(siegeBet)
  if (!siegeBet && state.dialogMode === 'siegebet') {
    state.siegeBet = null
    closeDialog()
  }
  // Câu hỏi đang chờ (kể cả sau khi tải lại trang)
  // Đang chọn chủ đề (kể cả tải lại trang / đồng đội vừa tới tỉnh); đồng đội bỏ qua thì đóng khung chọn
  const choosing = view.status === 'running' ? view.choosing : null
  if (choosing && !state.moving && !defending && !(state.dialogMode === 'topic' && dlg.open)) openTopicPicker(choosing.province, choosing.topics, choosing.bet, choosing.worth)
  if (!choosing && state.dialogMode === 'topic' && !view.pendingQuestion) closeDialog()
  // (đã kết thúc thì bỏ qua câu còn treo — không mở lại đè lên tổng kết)
  const pending = view.status === 'ended' ? null : view.pendingQuestion
  const sameOpen = pending && state.dialogMode === 'question' && dlg.open && state.question?.q.id === pending.id
  // Đấu nhiều hiệp: câu hiệp sau phát sớm (chưa tính giờ) — đóng câu hiệp vừa xong, để báo kết quả hiện ra rồi mới mở câu mới
  const later = pending && !sameOpen && pending.duel?.round && pending.issuedAt - now() > 900
  if (later) {
    if (state.dialogMode === 'question' && !state.answering) closeDialog()
    clearTimeout(state.roundTimer)
    state.roundTimer = setTimeout(() => {
      const p = state.me?.pendingQuestion
      if (p?.id === pending.id && state.dialogMode !== 'defense' && !(state.dialogMode === 'question' && state.question?.q.id === p.id)) openQuestion(p)
    }, pending.issuedAt - now() - 800)
  }
  if (pending && !later && !state.moving && !defending && !sameOpen) openQuestion(pending)
  // Câu đang mở: cập nhật thẻ trợ giúp (đồng đội vừa dùng 50:50 / Thêm giờ, khay thẻ đổi)
  if (sameOpen && !state.answering) {
    const cur = state.question.q
    applyHelp(pending, pending.hidden.length !== cur.hidden.length || pending.extraMs !== cur.extraMs)
  }
  if (!pending && state.dialogMode === 'question' && !state.answering) closeDialog()
}

// ---------- Bàn phím: Esc che màn hình, 1–4 chọn đáp án, Enter chốt ----------
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.preventDefault()
    toggleCover()
    return
  }
  // Câu hỏi chung cả phòng đang mở (chồng lên mọi khung): 1–4 chọn đáp án
  if (sharedDlg.open && $('cover').hidden) {
    const b = sharedDlg.querySelector(`button[data-key="${e.key}"]`)
    if (b) {
      e.preventDefault()
      b.click()
    }
    return
  }
  if (!$('cover').hidden || !['question', 'defense'].includes(state.dialogMode) || e.target.matches('input')) return
  // Enter: chốt đáp án đang chọn
  const b = e.key === 'Enter' ? dlg.querySelector('.btn.commit') : dlg.querySelector(`button[data-key="${e.key}"]`)
  if (b && !b.disabled) {
    e.preventDefault()
    b.click()
  }
})

// ---------- Âm thanh ----------
function renderMute() {
  $('muteBtn').replaceChildren(icon(sound.muted ? 'sound-off' : 'sound-on'))
  $('muteBtn').title = sound.muted ? 'Bật âm thanh' : 'Tắt âm thanh'
}
$('muteBtn').addEventListener('click', () => {
  sound.setMuted(!sound.muted)
  renderMute()
  sound.click()
})
renderMute()

// Nhạc nền (shared/music.js): trang chủ + phòng đơn (mỗi người một máy); phòng theo team thì im — cả phòng đã có màn chiếu phát nhạc.
// Mặc định tắt, bật một lần thì nhớ cho lần sau
music.setup('vnj-music', false)
function setMusicMode(view) {
  const one = view.room.mode === 'solo'
  $('musicBtn').hidden = !one
  music.mode(one ? ({ waiting: 'calm', ended: 'finale' }[view.status] ?? 'play') : null)
}
function renderMusic() {
  for (const b of [$('lpMusic'), $('musicBtn')]) {
    b.replaceChildren(icon(music.on ? 'music-on' : 'music-off'))
    b.title = music.on ? 'Tắt nhạc nền' : 'Bật nhạc nền'
    b.setAttribute('aria-label', b.title)
    b.setAttribute('aria-pressed', String(music.on))
  }
}
for (const id of ['lpMusic', 'musicBtn']) {
  $(id).addEventListener('click', () => {
    music.setOn(!music.on)
    renderMusic()
  })
}
renderMusic()

// ---------- Khởi động ----------
// Link mời dạng /?room=MÃ: điền sẵn mã phòng
const params = new URLSearchParams(location.search)
const invited = params.get('room')
// Đọc xong thì xoá khỏi URL: thoát ra / tải lại không bị kẹt ở phòng cũ (đã kết thúc)
if (location.search) history.replaceState(null, '', location.pathname)
enter().catch(err => {
  showEntry(err.status === 401 || err.status === 403 ? '' : err.message)
  if (invited && params.get('host')) markOwnerRoom(invited) // từ trang chủ phòng bấm "Vào chơi"
  if (invited) {
    $('roomCode').value = invited.toUpperCase()
    lookup(invited)
  }
})
