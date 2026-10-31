// Luật chơi "Hành trình 3 miền".
// Nhiều phòng chạy song song; mỗi phòng là một trận độc lập (team, sở hữu tỉnh, đồng hồ, sự kiện riêng).
// Mọi kiểm tra (giáp ranh, khóa, câu hỏi đang chờ, trạng thái game) đều ở server.
// Đáp án không bao giờ rời khỏi server; mỗi team chỉ nhận dữ liệu của chính mình.
// Mã nguồn chia theo phần trong thư mục game/; file này chỉ ghép lại và giữ nguyên API.

import { loadData } from './game/data.js'
import { createRooms } from './game/rooms.js'
import { createRoomScope } from './game/room.js'
import { RULES } from './game/rules.js'

export { RULES, TEAM_STYLES, byRank, GameError, normalizeText } from './game/rules.js'

export function createGame(db, options = {}) {
  const {
    now = Date.now,
    random = Math.random,
    freezeBeforeEndMin = 10,
    defaultDurationMin = 45,
    questionLeadMs = RULES.questionLeadMs, // đồng hồ câu hỏi bắt đầu sau khi phát câu (test đặt 0 để tính giờ chính xác)
    newCode,        // sinh mã ngẫu nhiên (độ dài) — mã phòng, mã chủ phòng, mã màn chiếu
    hashSecret,     // băm mã chủ phòng
    sealSecret = null, // mã hóa mã chủ phòng để trang quản trị xem lại được (null: không lưu bản mã hóa)
  } = options

  const data = loadData(db, now)
  const { provinces, adjacency, collections } = data
  const rooms = createRooms({ db, now, defaultDurationMin, newCode, hashSecret, sealSecret, room, ...data })
  const { ensurePresetRooms, presetRooms, publicRooms, leaderboard, createRoom, findRoom, lobby, joinRoom, expireQuestions, cleanupRooms, activeRoomIds, questionStats, provinceList } = rooms

  // ---------- Một phòng ----------
  function room(roomId) {
    return createRoomScope({ db, now, random, freezeBeforeEndMin, questionLeadMs, lobby, questionStats, ...data }, roomId)
  }

  return {
    provinces, adjacency, collections,
    ensurePresetRooms, presetRooms, publicRooms, leaderboard, createRoom, findRoom, lobby, joinRoom, room, expireQuestions, cleanupRooms, activeRoomIds,
    questionStats, provinceList,
  }
}
