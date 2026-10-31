// Hằng số luật chơi, kiểu lỗi và hàm tiện ích dùng chung (không phụ thuộc DB).

export const RULES = {
  lockWrongMs: 30_000,
  lockSiegeWrongMs: 45_000,
  lockSkipMs: 10_000,     // bỏ qua câu hỏi: lùi về tỉnh trước + khóa 10 giây + thời gian đã xem (tối đa = khóa khi sai)
  stealBonus: 50,
  festivalBonus: 100,
  crossRegionBonus: 500,
  shieldMs: 5 * 60_000,
  scoutMs: 10_000,
  festivalMs: 5 * 60_000,
  stormMs: 3 * 60_000,
  // Câu hỏi vàng (MC tung, cả bản đồ): câu phát ra trong lúc này đúng thì thưởng thêm bằng điểm tỉnh (×2), sai / hết giờ khóa ×2
  goldenMs: 2 * 60_000,
  goldenLockFactor: 2,
  // Chuỗi đúng: cứ đúng liên tiếp 3 câu → 1 thẻ trợ giúp ngẫu nhiên (khay đầy thì +50 điểm thay thẻ); sai / hết giờ / bỏ qua → về 0
  streakEvery: 3,
  streakFullBonus: 50,
  // Thẻ Thêm giờ: cộng vào cả hạn chót lẫn khoảng được đủ điểm của câu đang trả lời
  extraTimeMs: 15_000,
  // Đặt cược (câu thường, phòng bật): "Liều" đúng → thưởng thêm 50% điểm tỉnh; sai / hết giờ → khóa thêm 30 giây
  betBonusRatio: 0.5,
  betExtraLockMs: 30_000,
  // Đấu tay đôi khi công thành: đội giữ tỉnh trả lời đúng trước → giữ tỉnh +50; đội công thành bị đẩy về + khóa 30 giây.
  // Chống bị công thành liên tục: tỉnh vừa đứng vững (không đổi chủ) được miễn công thành 60 giây; mỗi tỉnh một lượt công thành một lúc
  defendBonus: 50,
  repelLockMs: 30_000,
  // Cược số hiệp khi thử tài (chốt 30/10): bấm Thử tài → hai đội cược kín 1–siegeBetMax hiệp trong siegeBetMs.
  // Thắng đa số; hòa (cược 2, 1–1) thì chủ nhà giữ tỉnh. Thắng: +50 × số hiệp; đoàn khách thua (đấu nhiều hiệp): nghỉ chân 30 giây × số hiệp
  siegeBetMs: 10_000,
  siegeBetMax: 3,
  duelRoundGapMs: 2_500, // giữa hai hiệp: xem kết quả hiệp vừa xong rồi mới tính giờ hiệp sau
  siegeCalmMs: 60_000,
  // Về quê: team chiếm được tỉnh quê của một thành viên → +50 (mỗi tỉnh 1 lần, tối đa 3 tỉnh mỗi team). Quê chỉ đồng đội thấy
  homeBonus: 50,
  homeMax: 3,
  // Câu hỏi chung cả phòng (MC tung): trận tạm dừng, mỗi người chọn trên máy mình trong 30 giây (không tính điểm theo tốc độ).
  // Công bố tỉ lệ chọn từng đáp án; cả phòng đúng ≥ 70% (trong số người đã chọn) → mọi team cùng +100
  sharedMs: 30_000,
  sharedPassPct: 70,
  sharedBonus: 100,
  sharedTopics: ['am-thuc', 'doi-song', 'van-hoa'],
  // Sảnh chờ "Bạn có biết?": lúc chờ bắt đầu, màn chiếu + máy người chơi chạy luân phiên 12 câu trong kho (4 câu mỗi miền)
  // kèm đáp án + lời giải, mỗi câu 12 giây. Các câu này không phát cho team trong phòng đó nữa (đáp án đã lộ)
  factCount: 12,
  factMs: 12_000,
  factTopics: ['am-thuc', 'doi-song', 'van-hoa', 'di-san'],
  // "Đã từng / Muốn thử": sau câu đúng về ẩm thực / di sản, mỗi người tự bấm (không bắt buộc); chỉ hiện số đếm gộp cả phòng
  reactTopics: { 'am-thuc': 'food', 'di-san': 'place' },
  // Phòng chơi đơn: mỗi người sưu tầm tem; người đầu tiên trong phòng có tem một tỉnh → tem Tiên phong +50.
  // Câu hỏi vàng lấy từ kho câu thử tài (khó hơn, giờ 45 giây). Màn chiếu chỉ hiện top 10
  pioneerBonus: 50,
  maxSoloPlayers: 50,
  screenTop: 10,
  soloColors: ['#C0392B', '#E67E22', '#27AE60', '#8E44AD', '#2E86C1', '#8D6E63', '#16A085', '#D35400', '#D81B60', '#00897B', '#5E35B1', '#6D4C41'],
  // Phòng chơi đơn có sẵn (hiện ở màn vào phòng): ai vào trước làm chủ phòng; chủ phòng rời thì người vào sớm nhất kế tiếp nhận quyền.
  // Phòng đã kết thúc quá 30 phút (hoặc quá hạn 24 giờ) thì làm mới — mã phòng mới, sạch người chơi
  presetRooms: ['Phòng Sen', 'Phòng Mai', 'Phòng Đào', 'Phòng Trúc'],
  presetDurationMin: 30,
  presetIdleMs: 30 * 60_000,
  leaderboardKeepMs: 7 * 24 * 3_600_000, // bảng xếp hạng cá nhân (phòng đơn) giữ 7 ngày
  leaderboardSize: 100,
  startCountdownMs: 3500, // bấm Bắt đầu → trận chạy sau 3,5 giây: mọi màn đếm ngược 3·2·1 theo cùng mốc giờ server (dư 0,5 giây cho SSE tới)
  // Siêu tốc: đúng trong 5 giây đầu (và chiếm được tỉnh) → thưởng thêm 10% điểm tỉnh (29/10: giảm từ 20% — bớt áp lực tốc độ)
  speedBonusMs: 5_000,
  speedBonusRatio: 0.1,
  maxCards: 3,
  minTeams: 2,
  maxTeams: 8,
  textAnswerMaxLength: 100,
  // Giờ trả lời: trong khoảng "không trừ" được đủ điểm; sau đó trừ dần đều vào điểm thưởng,
  // đến hết giờ là trừ 100% điểm tỉnh. Quá giờ (cộng thêm độ trễ mạng) tính là trả lời sai.
  answerLimitMs: { normal: 30_000, siege: 45_000 },
  answerFreeMs: { normal: 15_000, siege: 20_000 }, // 29/10: nới từ 10/15 giây — có thời gian đọc và bàn với đồng đội
  answerNetworkGraceMs: 2_000,
  // 30/10: đồng hồ câu hỏi bắt đầu sau khi phát câu 1 giây — camera bay tới tỉnh mất ~1 giây, không ăn vào khoảng đủ điểm
  questionLeadMs: 1_000,
  // Phòng chơi
  roomNameMaxLength: 40,
  playerNameMaxLength: 24,
  maxPlayersPerTeam: 12,
  maxOpenRooms: 50,
  roomLifetimeMs: 24 * 60 * 60_000,
  durationMin: { min: 10, max: 90 },
  // Số câu phải trả lời đúng ở một tỉnh trống (chủ phòng chọn lúc tạo phòng; 1 = luật gốc). Sai giữa chừng giữ tiến độ
  quizCount: { min: 1, max: 3, default: 1 },
}

export const TEAM_STYLES = [
  { color: '#C0392B', mascot: 'Rồng' },
  { color: '#E67E22', mascot: 'Lân' },
  { color: '#27AE60', mascot: 'Rùa' },
  { color: '#8E44AD', mascot: 'Phượng' },
  { color: '#2E86C1', mascot: 'Hạc' },
  { color: '#8D6E63', mascot: 'Trâu' },
  { color: '#16A085', mascot: 'Voi' },
  { color: '#D35400', mascot: 'Hổ' },
]

export const REGIONS = ['north', 'central', 'south']
// Thẻ rơi khi chiếm thành phố trực thuộc TW: một trong 5 loại. Thẻ trợ giúp (dùng trong lúc trả lời) còn nhận được qua chuỗi đúng.
export const HELP_CARDS = ['fifty', 'time']
export const CARD_KINDS = ['scout', 'shield', 'march', ...HELP_CARDS]
// Phòng đơn không có Hàng rào (không ai ghé thăm thử tài)
export const SOLO_CARD_KINDS = CARD_KINDS.filter(k => k !== 'shield')
export const EVENT_KINDS = ['festival', 'storm', 'golden', 'rumor']
// Các hành động hiện trong nhật ký team
export const TEAM_LOG_ACTIONS = ['spawn', 'move', 'retry', 'retreat', 'pushed-back', 'topic', 'capture', 'steal', 'wrong', 'siege-fail', 'siege', 'skip', 'card', 'time-penalty', 'streak', 'speed', 'defend', 'defend-fail', 'held', 'repelled', 'home', 'shared-bonus', 'pioneer', 'progress', 'siege-bet', 'duel-round']

// Xếp hạng: điểm cao hơn trước; bằng điểm thì tổng thời gian trả lời ít hơn trước
export const byRank = (a, b) => b.total - a.total || a.answerMs - b.answerMs

export class GameError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

// So khớp câu trả lời dạng chữ: bỏ dấu, chữ thường, bỏ ký tự đặc biệt, gộp khoảng trắng
export function normalizeText(s) {
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Tên hiển thị: bỏ ký tự điều khiển và ký tự vô hình (đảo chiều chữ, độ rộng 0 — tên lên màn chiếu không bị đảo / giả tên người khác),
// gộp khoảng trắng; cắt theo ký tự (không cắt đôi emoji)
export const cleanName = (s, max) => [...String(s ?? '')
  .replace(/[\u0000-\u001f\u007f-\u009f­؜​-‏‪-‮⁠-⁯﻿]/g, '')
  .replace(/\s+/g, ' ').trim()].slice(0, max).join('').trim()
