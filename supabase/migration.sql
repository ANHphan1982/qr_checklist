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
