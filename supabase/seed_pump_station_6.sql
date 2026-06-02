-- =============================================================================
-- QR Checklist — Migration multi-param + nạp dữ liệu PUMP_STATION_6
-- Dán toàn bộ file này vào Supabase → SQL Editor → New query → Run.
-- An toàn để chạy lại nhiều lần (idempotent).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PHẦN A — MIGRATION SCHEMA (bắt buộc, chạy 1 lần là đủ nhưng chạy lại vẫn OK)
-- -----------------------------------------------------------------------------

-- 1) scan_logs: lưu danh sách thông số nhập tại trạm (mỗi phần tử tự mô tả).
ALTER TABLE scan_logs
  ADD COLUMN IF NOT EXISTS oil_level_mm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS param_values JSONB;

-- 2) Bảng trạm (nếu chưa có).
CREATE TABLE IF NOT EXISTS stations (
  id         BIGSERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  radius     INTEGER DEFAULT 300,
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Bảng QR alias (nếu chưa có).
CREATE TABLE IF NOT EXISTS qr_aliases (
  id           BIGSERIAL PRIMARY KEY,
  qr_content   VARCHAR(500) NOT NULL UNIQUE,
  station_name VARCHAR(100) NOT NULL,
  note         VARCHAR(200),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 4) Bảng cấu hình thông số — MỘT trạm có NHIỀU dòng thông số.
CREATE TABLE IF NOT EXISTS station_params (
  id           BIGSERIAL PRIMARY KEY,
  station_name VARCHAR(100) NOT NULL,
  tag          VARCHAR(100),                 -- mã thiết bị, vd '052-PG-038'
  param_label  VARCHAR(100) NOT NULL DEFAULT 'Thông số',
  param_unit   VARCHAR(50)  NOT NULL DEFAULT 'mm',
  param_low    DOUBLE PRECISION,             -- giới hạn dưới (L)
  param_high   DOUBLE PRECISION,             -- giới hạn trên (H)
  sort_order   INTEGER DEFAULT 0,            -- thứ tự hiển thị trong modal
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Nếu station_params đã tồn tại từ schema cũ (1 thông số/trạm): thêm cột mới
ALTER TABLE station_params
  ADD COLUMN IF NOT EXISTS tag        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Bỏ ràng buộc UNIQUE(station_name) cũ để cho phép nhiều thông số/trạm.
ALTER TABLE station_params DROP CONSTRAINT IF EXISTS station_params_station_name_key;

CREATE INDEX IF NOT EXISTS idx_station_params_station_name
  ON station_params (station_name);


-- -----------------------------------------------------------------------------
-- PHẦN B — TẠO TRẠM PUMP_STATION_6
--   ⚠️ THAY lat/lng/radius bằng TỌA ĐỘ THẬT của trạm trước khi dùng thật.
--   Cách lấy: Google Maps → nhấn giữ vị trí trạm → copy lat,lng.
--   Nếu CHƯA biết tọa độ: cứ bỏ qua PHẦN B này — lượt scan vẫn được ghi nhận,
--   chỉ là không kiểm tra vị trí GPS (geo_status = 'unverified').
-- -----------------------------------------------------------------------------
INSERT INTO stations (name, lat, lng, radius, active)
VALUES ('PUMP_STATION_6', 15.409000, 108.813000, 50, TRUE)   -- ⚠️ ĐỔI tọa độ thật
ON CONFLICT (name) DO NOTHING;


-- -----------------------------------------------------------------------------
-- PHẦN C — QR ALIAS: mã QR dán tại trạm '052-PG-038' → trạm 'PUMP_STATION_6'
-- -----------------------------------------------------------------------------
INSERT INTO qr_aliases (qr_content, station_name, note)
VALUES ('052-PG-038', 'PUMP_STATION_6', 'LPG Pump - PUMP_STATION_6')
ON CONFLICT (qr_content) DO NOTHING;


-- -----------------------------------------------------------------------------
-- PHẦN D — DANH SÁCH THÔNG SỐ của PUMP_STATION_6
--   Quy ước ngưỡng: param_low = giới hạn dưới (L), param_high = giới hạn trên (H).
--   - Có cả 2 số  → cảnh báo khi ngoài [L, H].
--   - Chỉ có 1 số → đặt vào param_high (ngưỡng cao H).
--   - Để trống cả 2 (NULL) → chỉ ghi nhận giá trị, không cảnh báo.
--
--   Xoá trước rồi chèn lại để chạy lại script không bị trùng dòng.
-- -----------------------------------------------------------------------------
DELETE FROM station_params WHERE station_name = 'PUMP_STATION_6';

INSERT INTO station_params
  (station_name, tag, param_label, param_unit, param_low, param_high, sort_order, active)
VALUES
  ('PUMP_STATION_6', '052-PG-038', 'Discharge pressure',               'kg/cm2g', 5,    14,     0, TRUE),
  ('PUMP_STATION_6', '052-PG-890', 'Driven end seal pressure',         'kg/cm2g', NULL, 0.5,    1, TRUE),
  ('PUMP_STATION_6', '052-LG-842', 'Driven end seal level',            '%',       70,   90,     2, TRUE),
  ('PUMP_STATION_6', 'P-5223A-C',  'Current (record current value)',   'A',       NULL, NULL,   3, TRUE),
  ('PUMP_STATION_6', 'P-5223A-DT', 'Driven Bearing temperature',       '°C',      NULL, 80,     4, TRUE),
  ('PUMP_STATION_6', 'P-5223A-BDT','Bearing temperature at driven end','°C',      NULL, 80,     5, TRUE),
  ('PUMP_STATION_6', '052-FIC-026','Discharge flow',                   'm³/h',    96.2, 452.04, 6, TRUE),
  ('PUMP_STATION_6', 'P-5223A-LOL','Lube oil level',                   '',        NULL, NULL,   7, TRUE);


-- -----------------------------------------------------------------------------
-- KIỂM TRA NHANH (tuỳ chọn) — xem lại dữ liệu vừa nạp
-- -----------------------------------------------------------------------------
-- SELECT * FROM station_params WHERE station_name = 'PUMP_STATION_6' ORDER BY sort_order;
-- SELECT * FROM qr_aliases     WHERE qr_content   = '052-PG-038';
-- SELECT * FROM stations       WHERE name         = 'PUMP_STATION_6';
