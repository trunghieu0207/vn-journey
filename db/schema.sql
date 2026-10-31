-- Schema SQLite cho "Hành trình 3 miền".
-- Thời gian lưu dạng mili giây (Date.now()), JSON lưu dạng TEXT, boolean lưu INTEGER 0/1.

PRAGMA foreign_keys = ON;

-- ---------- Dữ liệu tĩnh (nạp từ data/*.json) ----------

CREATE TABLE provinces (
  id              TEXT PRIMARY KEY,                -- 'hue', 'phu-tho'
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  short_name      TEXT,
  full_name       TEXT NOT NULL,
  region          TEXT NOT NULL CHECK (region IN ('north', 'central', 'south')),
  merged_from     TEXT NOT NULL,                   -- JSON: ["Phú Thọ","Vĩnh Phúc","Hòa Bình"]
  admin_center_at TEXT NOT NULL,
  is_city         INTEGER NOT NULL DEFAULT 0,
  is_capital      INTEGER NOT NULL DEFAULT 0,
  points          INTEGER NOT NULL,
  label_x         REAL NOT NULL,                   -- điểm đặt nhãn/cờ trên bản đồ (từ map-geo.json)
  label_y         REAL NOT NULL
) STRICT;

CREATE TABLE adjacency (
  province_id TEXT NOT NULL REFERENCES provinces(id),
  neighbor_id TEXT NOT NULL REFERENCES provinces(id),
  PRIMARY KEY (province_id, neighbor_id)
) STRICT;

CREATE TABLE collections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  need        INTEGER NOT NULL,
  bonus       INTEGER NOT NULL
) STRICT;

CREATE TABLE collection_members (
  collection_id TEXT NOT NULL REFERENCES collections(id),
  province_id   TEXT NOT NULL REFERENCES provinces(id),
  PRIMARY KEY (collection_id, province_id)
) STRICT;

CREATE TABLE topics (                              -- chủ đề câu hỏi (cho người chơi chọn khi phòng bật)
  id   TEXT PRIMARY KEY,                           -- 'am-thuc'
  name TEXT NOT NULL
) STRICT;

CREATE TABLE questions (
  id          TEXT PRIMARY KEY,                    -- 'ha-noi-01', 'ha-noi-s1'
  province_id TEXT NOT NULL REFERENCES provinces(id),
  difficulty  TEXT NOT NULL CHECK (difficulty IN ('normal', 'siege')),
  level       INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
  topic       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('choice', 'truefalse', 'text')),
  content     TEXT NOT NULL,
  options     TEXT,                                -- JSON
  answer      TEXT NOT NULL,                       -- JSON — KHÔNG BAO GIỜ trả về client
  explanation TEXT,
  asked_count INTEGER NOT NULL DEFAULT 0            -- số lần đã phát (mọi phòng, mọi trận) — ưu tiên câu ít được hỏi để xoay vòng
) STRICT;
CREATE INDEX idx_questions_province ON questions(province_id, difficulty);

-- ---------- Trạng thái trận đấu ----------

-- ---------- Phòng chơi (nhiều phòng chạy song song, mỗi phòng một trận độc lập) ----------

CREATE TABLE rooms (
  id               INTEGER PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,            -- mã phòng 6 ký tự, người chơi nhập để vào
  name             TEXT NOT NULL CHECK (length(name) <= 40),
  owner_key_hash   TEXT NOT NULL,                   -- mã chủ phòng (scrypt), chỉ hiện 1 lần lúc tạo
  owner_key_sealed TEXT,                            -- mã chủ phòng mã hóa AES-GCM (khóa var/secret.key) — chỉ trang quản trị mở ra xem được
  screen_code      TEXT NOT NULL,                   -- mã màn chiếu của phòng (chủ phòng xem được)
  duration_min     INTEGER NOT NULL,
  topic_choice     INTEGER NOT NULL DEFAULT 0,      -- 1: người chơi chọn chủ đề trước khi nhận câu hỏi (câu thường)
  bet_choice       INTEGER NOT NULL DEFAULT 0,      -- 1: trước câu thường team chọn "Chắc ăn" / "Liều" (đặt cược; form tạo phòng mặc định bật)
  mode             TEXT NOT NULL DEFAULT 'team' CHECK (mode IN ('team', 'solo')), -- solo: mỗi người một hành trình (mỗi người là một team ẩn 1 người)
  pioneer          INTEGER NOT NULL DEFAULT 1,
  quiz_count       INTEGER NOT NULL DEFAULT 1 CHECK (quiz_count BETWEEN 1 AND 3), -- số câu phải trả lời đúng ở một tỉnh trống mới cắm cờ / nhận tem
  preset           TEXT,                            -- phòng chơi đơn có sẵn (tên mặc định); NULL = phòng tự tạo
  listed           INTEGER NOT NULL DEFAULT 0,      -- 1: công khai — hiện trong danh sách "Phòng đang mở" ở màn Tham gia (form mặc định); 0: riêng tư — chỉ vào bằng mã phòng
  host_player_id   INTEGER REFERENCES players(id) ON DELETE SET NULL, -- phòng có sẵn: người vào trước làm chủ phòng (chơi + quyền chủ phòng)      -- phòng đơn: bật tem Tiên phong (người đầu tiên có tem một tỉnh +50)
  status           TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'running', 'paused', 'ended')),
  started_at       INTEGER,
  ends_at          INTEGER,
  freeze_at        INTEGER,
  paused_at        INTEGER,
  active_event     TEXT,                            -- JSON
  shared_question  TEXT,                            -- JSON: câu hỏi chung cả phòng đang mở { question, order, at, until, votes: { playerId: idx }, result }
  created_at       INTEGER NOT NULL
) STRICT;

CREATE TABLE teams (
  id                INTEGER PRIMARY KEY,
  room_id           INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name              TEXT NOT NULL CHECK (length(name) <= 40),
  color             TEXT NOT NULL,
  mascot            TEXT NOT NULL,
  current_province  TEXT REFERENCES provinces(id),
  previous_province TEXT REFERENCES provinces(id),
  pending_question  TEXT REFERENCES questions(id),
  pending_order     TEXT,                          -- JSON: thứ tự lựa chọn đã xáo cho câu đang chờ
  pending_at        INTEGER,                       -- lúc phát câu đang chờ (tính giờ trả lời, trừ điểm)
  locked_until      INTEGER,
  bonus_points      INTEGER NOT NULL DEFAULT 0,
  march_ready       INTEGER NOT NULL DEFAULT 0,    -- thẻ Hành quân gấp: lượt đi kế tiếp được đi xa 2 tỉnh
  choosing_at       INTEGER,                       -- đang chọn chủ đề ở tỉnh hiện tại (từ lúc này); NULL = không
  answer_ms         INTEGER NOT NULL DEFAULT 0,    -- tổng thời gian trả lời (ms) — phân hạng khi bằng điểm, ít hơn xếp trên
  streak            INTEGER NOT NULL DEFAULT 0,    -- số câu đúng liên tiếp (chuỗi đúng: cứ 3 câu → thẻ trợ giúp)
  progress          TEXT,                          -- JSON: tiến độ ở tỉnh đang đứng khi phòng cần nhiều câu/tỉnh { province, done, penalty, golden, speed, bet }
  pending_hidden    TEXT,                          -- JSON: vị trí 2 đáp án sai bị ẩn bởi thẻ 50:50 (câu đang chờ)
  pending_extra_ms  INTEGER NOT NULL DEFAULT 0,    -- giờ cộng thêm bởi thẻ Thêm giờ (câu đang chờ)
  pending_golden    INTEGER NOT NULL DEFAULT 0,    -- câu đang chờ phát ra trong sự kiện Câu hỏi vàng (đúng ×2 điểm tỉnh, sai khóa ×2)
  pending_bet       INTEGER NOT NULL DEFAULT 0,    -- câu đang chờ team chọn "Liều" (đúng +50% điểm tỉnh, sai khóa thêm 30 giây)
  pending_votes     TEXT,                          -- JSON { playerId: { name, answer } }: phiếu chọn đáp án của từng thành viên
  last_result       TEXT                           -- JSON: kết quả câu trả lời gần nhất, để đồng đội cùng thấy
) STRICT;
CREATE INDEX idx_teams_room ON teams(room_id);

CREATE TABLE players (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (length(name) <= 24),
  name_key   TEXT NOT NULL,                        -- tên đã chuẩn hóa, để không trùng tên trong phòng
  home       TEXT REFERENCES provinces(id),        -- quê (không bắt buộc; chỉ đồng đội thấy) — "Về quê": chiếm tỉnh quê của thành viên → +50
  created_at INTEGER NOT NULL,
  UNIQUE (room_id, name_key)
) STRICT;

CREATE TABLE visits (                              -- tỉnh team đã đặt chân tới (để biết tỉnh đó "có chủ" hay "trống")
  team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  province_id TEXT NOT NULL REFERENCES provinces(id),
  PRIMARY KEY (team_id, province_id)
) STRICT;

-- ---------- Trang quản trị (/quan-tri) ----------

CREATE TABLE admins (                              -- tài khoản quản trị (một vai trò). Tài khoản đầu tiên: pnpm run admin:create
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 3 AND 32),
  display_name  TEXT NOT NULL CHECK (length(display_name) <= 40),
  password_hash TEXT NOT NULL,                     -- scrypt
  must_change   INTEGER NOT NULL DEFAULT 1,        -- 1: mật khẩu tạm — phải đổi trước khi dùng
  disabled      INTEGER NOT NULL DEFAULT 0,
  failed_count  INTEGER NOT NULL DEFAULT 0,        -- đăng nhập sai liên tiếp; đủ 5 lần → khóa 15 phút
  locked_until  INTEGER,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
) STRICT;

CREATE TABLE admin_log (                           -- nhật ký thao tác quản trị (giữ 30 ngày)
  id         INTEGER PRIMARY KEY,
  admin_id   INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  admin_name TEXT NOT NULL,                        -- tên đăng nhập lúc thao tác ('' = hệ thống)
  action     TEXT NOT NULL,
  detail     TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_admin_log_time ON admin_log(created_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                     -- SHA-256 của token, không lưu token gốc
  role       TEXT NOT NULL CHECK (role IN ('player', 'screen', 'owner', 'sysadmin')),
  room_id    INTEGER REFERENCES rooms(id) ON DELETE CASCADE, -- NULL với phiên quản trị
  admin_id   INTEGER REFERENCES admins(id) ON DELETE CASCADE,
  team_id    INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  player_id  INTEGER REFERENCES players(id) ON DELETE CASCADE,
  no_host    INTEGER NOT NULL DEFAULT 0,           -- 1: phiên có được nhờ vào lại bằng tên của người đang giữ quyền chủ phòng → không có quyền chủ phòng
  expires_at INTEGER NOT NULL
) STRICT;

CREATE TABLE ownership (
  room_id      INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  province_id  TEXT NOT NULL REFERENCES provinces(id),
  team_id      INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  captured_at  INTEGER NOT NULL,
  shield_until INTEGER,
  calm_until   INTEGER,                            -- vừa đứng vững trước đợt công thành: chưa công thành lại được tới lúc này
  PRIMARY KEY (room_id, province_id)
) STRICT;

CREATE TABLE cards (
  id      INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL CHECK (kind IN ('scout', 'shield', 'march', 'fifty', 'time')),
  used_at INTEGER
) STRICT;

CREATE TABLE answered (                            -- tránh lặp câu; dùng cho thống kê % đúng (bước 4.11, 7.9)
  team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id),
  correct     INTEGER NOT NULL,
  skipped     INTEGER NOT NULL DEFAULT 0,        -- bỏ qua (không tính vào thống kê % đúng)
  answered_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, question_id)
) STRICT;

CREATE TABLE duels (                               -- đấu tay đôi khi công thành: đội giữ tỉnh trả lời cùng câu, ai đúng trước thắng
  id              INTEGER PRIMARY KEY,
  room_id         INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  province_id     TEXT NOT NULL REFERENCES provinces(id),
  attacker_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  defender_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  question_id     TEXT REFERENCES questions(id),   -- câu của hiệp đang đấu; NULL lúc đang cược
  defender_order  TEXT,                            -- JSON: thứ tự lựa chọn đã xáo riêng cho đội giữ tỉnh
  started_at      INTEGER NOT NULL,                -- = lúc phát câu cho đội công thành (cùng hạn chót); lúc cược = hết hạn cược
  phase           TEXT NOT NULL DEFAULT 'play' CHECK (phase IN ('bet', 'play')), -- bet: hai đội đang cược số hiệp
  bet_until       INTEGER,                         -- hết hạn cược
  bet_att         INTEGER,                         -- số hiệp đội công thành cược (1–3); NULL: chưa / không cược
  bet_def         INTEGER,                         -- số hiệp đội giữ tỉnh cược
  rounds          INTEGER NOT NULL DEFAULT 1,      -- số hiệp đấu (cược lớn hơn; một bên không cược thì theo bên kia; không ai cược: 1)
  round_no        INTEGER NOT NULL DEFAULT 1,      -- hiệp đang đấu
  att_wins        INTEGER NOT NULL DEFAULT 0,
  def_wins        INTEGER NOT NULL DEFAULT 0,
  defender_answer INTEGER,                         -- NULL: chưa trả lời; 1 đúng; 0 sai
  defender_by     TEXT,
  resolved_at     INTEGER,
  result          TEXT                             -- attacker (cướp được) | defender (giữ được) | attacker-fail (công thành sai / bỏ qua / hết giờ)
) STRICT;
CREATE INDEX idx_duels_attacker ON duels(attacker_id, resolved_at);
CREATE INDEX idx_duels_defender ON duels(defender_id, resolved_at);

CREATE TABLE stamps (                              -- phòng đơn: tem của từng người (tỉnh không thuộc riêng ai — bảng ownership không dùng)
  room_id     INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  province_id TEXT NOT NULL REFERENCES provinces(id),
  first       INTEGER NOT NULL DEFAULT 0,          -- 1: tem Tiên phong (người đầu tiên trong phòng có tem tỉnh này)
  question_id TEXT REFERENCES questions(id),       -- câu đã trả lời đúng (sổ tay lấy lời giải); NULL = tỉnh xuất phát
  at          INTEGER NOT NULL,
  PRIMARY KEY (team_id, province_id)
) STRICT;
CREATE INDEX idx_stamps_room ON stamps(room_id, province_id);

CREATE TABLE reactions (                           -- "Đã từng / Muốn thử" sau câu đúng về ẩm thực (food) / di sản (place) — chỉ dùng số đếm gộp
  room_id     INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  province_id TEXT NOT NULL REFERENCES provinces(id),
  kind        TEXT NOT NULL CHECK (kind IN ('food', 'place')),
  value       TEXT NOT NULL CHECK (value IN ('been', 'want')),
  PRIMARY KEY (player_id, province_id, kind)
) STRICT;
CREATE INDEX idx_reactions_room ON reactions(room_id, kind);

CREATE TABLE leaderboard (                         -- bảng xếp hạng cá nhân cả sự kiện: phòng chơi đơn kết thúc → mỗi người một dòng.
  id          INTEGER PRIMARY KEY,                 -- Không khóa ngoại tới rooms: phòng tự xóa sau 24 giờ, dòng này giữ RULES.leaderboardKeepMs
  room_id     INTEGER NOT NULL,
  name        TEXT NOT NULL CHECK (length(name) <= 40),
  name_key    TEXT NOT NULL,                       -- tên đã chuẩn hóa: cùng tên ở nhiều phòng = một người (cộng dồn)
  hidden      INTEGER NOT NULL DEFAULT 0,          -- 1: quản trị ẩn khỏi bảng công khai
  color       TEXT NOT NULL,
  score       INTEGER NOT NULL,
  stamps      INTEGER NOT NULL,
  played_at   INTEGER NOT NULL
) STRICT;
CREATE INDEX leaderboard_played ON leaderboard (played_at);

CREATE TABLE events_log (                          -- bản tin + nhật ký team + màn tua lại
  id          INTEGER PRIMARY KEY,
  room_id     INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  team_id     INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  player_name TEXT,                                -- người trong team đã thao tác
  action      TEXT NOT NULL,
  province_id TEXT REFERENCES provinces(id),
  detail      TEXT,                                -- JSON
  created_at  INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_events_room ON events_log(room_id, id);
