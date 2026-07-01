-- =============================================================================
-- QR Checklist — Supabase Migration
-- Chạy file này trong: supabase.com → SQL Editor → New query → Run
-- =============================================================================

-- Bảng chính
CREATE TABLE IF NOT EXISTS scan_logs (
  id           BIGSERIAL PRIMARY KEY,
  location     VARCHAR(200)  NOT NULL,          -- tên trạm từ QR (plaintext)
  device_id    VARCHAR(500),                    -- browser fingerprint (không phải PII)
  lat          DOUBLE PRECISION,                -- GPS latitude
  lng          DOUBLE PRECISION,                -- GPS longitude
  gps_accuracy REAL,                            -- độ chính xác GPS (mét)
  geo_distance REAL,                            -- khoảng cách thực tế đến trạm (mét)
  geo_status   VARCHAR(20) DEFAULT 'no_gps',    -- 'ok' | 'out_of_range' | 'no_gps'
  scanned_at   TIMESTAMPTZ  DEFAULT NOW(),
  email_sent   BOOLEAN      DEFAULT FALSE,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- Index để query nhanh theo ngày (reports endpoint dùng)
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at
  ON scan_logs (scanned_at DESC);

-- Index để query theo trạm
CREATE INDEX IF NOT EXISTS idx_scan_logs_location
  ON scan_logs (location);

-- =============================================================================
-- Nếu bảng đã tồn tại (từ schema cũ chưa có cột GPS), chạy migration này:
-- =============================================================================
-- ALTER TABLE scan_logs
--   ADD COLUMN IF NOT EXISTS lat          DOUBLE PRECISION,
--   ADD COLUMN IF NOT EXISTS lng          DOUBLE PRECISION,
--   ADD COLUMN IF NOT EXISTS gps_accuracy REAL,
--   ADD COLUMN IF NOT EXISTS geo_distance REAL,
--   ADD COLUMN IF NOT EXISTS geo_status   VARCHAR(20) DEFAULT 'no_gps';

-- =============================================================================
-- MULTI-PARAM (thông số vận hành nhiều dòng/trạm) — chạy trên DB đã có sẵn.
-- An toàn để chạy lại nhiều lần (IF NOT EXISTS / IF EXISTS).
-- =============================================================================

-- 1) scan_logs: lưu danh sách thông số nhập tại trạm (mỗi phần tử tự mô tả).
ALTER TABLE scan_logs
  ADD COLUMN IF NOT EXISTS oil_level_mm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS param_values JSONB;

-- 2) station_params: cấu hình thông số vận hành. Một trạm có NHIỀU dòng.
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

-- Nếu bảng station_params đã tồn tại từ schema cũ (1 thông số/trạm):
ALTER TABLE station_params
  ADD COLUMN IF NOT EXISTS tag        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Bỏ ràng buộc UNIQUE(station_name) cũ để cho phép nhiều thông số/trạm.
-- Tên constraint mặc định do Postgres sinh: station_params_station_name_key.
ALTER TABLE station_params DROP CONSTRAINT IF EXISTS station_params_station_name_key;

CREATE INDEX IF NOT EXISTS idx_station_params_station_name
  ON station_params (station_name);

-- =============================================================================
-- BẢO MẬT: bật Row Level Security (RLS) cho mọi bảng public.
-- Vì sao: Supabase mở sẵn Data API (PostgREST) cho schema public, gọi được từ
-- internet bằng `anon` key. Nếu RLS tắt → ai có anon key đọc/ghi/xoá được cả bảng.
-- Chiến lược: bật RLS, KHÔNG tạo policy nào (deny-all cho Data API).
-- Backend Flask kết nối bằng role `postgres` (superuser) → BỎ QUA RLS → chạy bình
-- thường, không bị ảnh hưởng. An toàn để chạy lại nhiều lần.
-- =============================================================================

-- Chỉ áp dụng cho bảng đã tồn tại (stations/qr_aliases do backend tạo lúc khởi
-- động — có thể chưa có khi chạy migration trên DB mới). Không bao giờ lỗi.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scan_logs', 'stations', 'station_params', 'qr_aliases']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      -- Đai phòng hộ 2: thu hồi quyền của anon/authenticated trên Data API.
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated;', t);
    END IF;
  END LOOP;
END $$;
