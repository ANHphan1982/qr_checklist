# CLAUDE.md — QR Checklist Nhân Sự

> Context dự án cho Claude Code. Cập nhật lần cuối: 2026-06-12.

---

## 🎯 Mô tả dự án

Ứng dụng web **QR Checklist Nhân Sự**: nhân viên vận hành dùng điện thoại quét QR
tại các trạm kiểm tra (bồn dầu, trạm bơm...). Mỗi lần quét ghi nhận thời gian, vị trí
GPS (geofencing chống gian lận), thông số vận hành tại trạm (mức dầu, áp suất...),
và gửi email báo cáo cho quản lý — **không cần đăng nhập**.

Hỗ trợ đầy đủ **offline**: PWA + service worker (mở app không mạng vẫn chạy),
offline queue tự đồng bộ khi có mạng, cache cấu hình thông số trong localStorage.

---

## 🏗️ Tech Stack

| Layer      | Công nghệ                          | Ghi chú                              |
|------------|------------------------------------|--------------------------------------|
| Frontend   | React 18 + Vite                    | PWA: `public/sw.js` + manifest.json  |
| UI         | TailwindCSS + lucide-react         | Dark mode, font Inter self-host      |
| QR Scan    | html5-qrcode                       | Class `Html5Qrcode` low-level        |
| QR Render  | qrcode-generator (vendored)        | `src/lib/vendor/` — tải từ jsdelivr  |
| Backend    | Flask (Python 3.11) + SQLAlchemy   | Gunicorn trên prod                   |
| Database   | Supabase (PostgreSQL free tier)    | 500MB free                           |
| Email      | Resend (free 100 emails/day)       | Render block SMTP ports              |
| Hosting FE | Vercel (free)                      | CI/CD tự động từ GitHub              |
| Hosting BE | Render (free tier)                 | Cold start ~30s                      |
| Test BE    | pytest (mock session, không DB thật)| `backend/tests/`                    |
| Test FE    | Vitest (unit) + Playwright (e2e)   | e2e chạy từ `frontend/`, suite 54    |

---

## 📁 Cấu trúc thư mục

```
qr-checklist/
├── CLAUDE.md
├── backend/
│   ├── app.py                     ← Flask entry, CORS multi-origin, ensure indexes
│   ├── config.py                  ← env vars, engine/SessionLocal (None nếu thiếu DB)
│   ├── models.py                  ← ScanLog, Station, StationParam, QrAlias + index DDL
│   ├── routes/
│   │   ├── scan.py                ← POST /scan (dedupe, geofence, token), /station-params, PATCH params
│   │   ├── reports.py             ← GET /reports (+ route assessment theo device)
│   │   ├── dashboard.py           ← GET /dashboard (analytics N ngày: heatmap, geo, trạm, trend)
│   │   ├── qr_token.py            ← GET /qr-token/<station> (rotating QR display)
│   │   ├── debug.py               ← connectivity (public), email-config/test (admin key)
│   │   ├── admin.py               ← CRUD stations/aliases/params + purge (X-Admin-Key)
│   │   └── summary.py             ← trigger-summary (cron-job.org gọi, ?key= hoặc header)
│   ├── services/
│   │   ├── scan_service.py        ← process_scan: dedupe → rate-limit → purge → insert → email nền
│   │   ├── email_service.py       ← email từng scan qua Resend
│   │   ├── summary_service.py     ← báo cáo tổng hợp sáng/tối (kèm Google Static Map)
│   │   ├── geo_service.py         ← haversine + validate_location
│   │   ├── threshold_service.py   ← check_thresholds: phát hiện param vượt low/high
│   │   ├── dashboard_service.py   ← tổng hợp analytics thuần (heatmap/geo/station/trend)
│   │   ├── anti_fraud_service.py  ← rate limit, GPS enforcement
│   │   ├── qr_token_service.py    ← HMAC rotating token + parse_qr_content (alias)
│   │   ├── stations_db.py         ← merge static config + DB (DB thắng)
│   │   └── stations_config.py     ← STATIONS / QR_ALIAS_MAP / STATION_PARAMS tĩnh
│   └── tests/                     ← pytest; ⚠️ test_e2e_live.py bắn vào PROD Render
│
├── frontend/
│   ├── public/                    ← sw.js (PWA), manifest.json, icons, fonts Inter
│   ├── src/
│   │   ├── App.jsx                ← routes: / /history /dashboard /admin /mdm-check /station/:name
│   │   ├── pages/                 ← ScanPage (flow chính), HistoryPage, DashboardPage,
│   │   │                            AdminPage, StationDisplayPage (rotating QR), MdmCheckPage
│   │   ├── components/            ← QRScanner, ScanResult, OperationalParamsModal,
│   │   │                            ConfirmDialog, admin/* (LoginGate, panels), ui/*
│   │   └── lib/                   ← api.js, offlineQueue, pendingParams, geolocation,
│   │                                builtinConfigs, stationsConfig (alias offline),
│   │                                exportExcel, statusBanner/buttonState/stepDisplay...
│   └── tests/e2e/                 ← Playwright specs (scan online/offline, admin...)
│
└── qr-generator/                  ← generate_qr.py + stations.json (QR PNG in dán trạm)
```

---

## 🗃️ Database Schema (thực tế trong models.py)

```sql
CREATE TABLE scan_logs (
  id            BIGSERIAL PRIMARY KEY,
  location      VARCHAR(200) NOT NULL,    -- tên trạm SAU khi resolve alias
  device_id     VARCHAR(500),
  lat           FLOAT, lng FLOAT,
  gps_accuracy  FLOAT,                    -- mét
  geo_distance  FLOAT,                    -- khoảng cách đến trạm (mét)
  geo_status    VARCHAR(20) DEFAULT 'no_gps', -- ok|out_of_range|unverified|cached|no_gps
  token_valid   BOOLEAN DEFAULT FALSE,    -- true = rotating QR hợp lệ
  oil_level_mm  FLOAT,                    -- backward compat = param đầu tiên
  param_values  JSON,                     -- [{tag,label,unit,value,low,high}, ...]
  scanned_at    TIMESTAMPTZ DEFAULT NOW(),
  email_sent    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
-- Index (bootstrap idempotent lúc khởi động — ensure_scan_log_indexes):
--   idx_scan_logs_scanned_at(scanned_at)
--   idx_scan_logs_device_loc_time(device_id, location, scanned_at)
--   uq_scan_logs_dedupe UNIQUE(device_id, location, scanned_at)  ← chống ghi trùng khi retry

CREATE TABLE stations (        -- tọa độ geofence, admin quản lý
  id BIGSERIAL PK, name VARCHAR(100) UNIQUE, lat FLOAT, lng FLOAT,
  radius INT DEFAULT 300, active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ
);

CREATE TABLE station_params (  -- N thông số vận hành / trạm
  id BIGSERIAL PK, station_name VARCHAR(100) INDEX, tag VARCHAR(100),
  param_label VARCHAR(100), param_unit VARCHAR(50),
  param_low FLOAT, param_high FLOAT, sort_order INT, active BOOLEAN, created_at TIMESTAMPTZ
);

CREATE TABLE qr_aliases (      -- map nội dung QR bất kỳ → tên trạm
  id BIGSERIAL PK, qr_content VARCHAR(500) UNIQUE, station_name VARCHAR(100),
  note VARCHAR(200), created_at TIMESTAMPTZ
);
```

**Merge static + DB:** `stations_config.py` chứa config tĩnh (fallback khi DB chết);
`stations_db.py` merge với DB — DB thắng khi trùng tên. Riêng station_params: trạm có
BẤT KỲ bản ghi DB nào thì DB nắm toàn quyền trạm đó (kể cả khi admin tắt hết → rỗng).
⚠️ Trạm mới phải thêm vào CẢ static config nếu muốn hoạt động khi DB lỗi.

---

## 🌐 API Endpoints

### Public
| Endpoint | Mô tả |
|---|---|
| `POST /api/scan` | Ghi scan. Body: `location` (QR content), `device_id`, `scanned_at`, `lat/lng/accuracy`, `geo_cached`, `cache_age_ms`, `param_values`, `oil_level_mm`. Dedupe theo (device_id, location, scanned_at) — retry trả 200 + `deduped:true`. `OUT_OF_RANGE` → 403 nhưng VẪN lưu DB (kèm `scan_id`). Rate limit → 400 `RATE_LIMITED`. |
| `GET /api/station-params` | Config thông số mọi trạm (kể cả trạm bị ẩn → `params: []` để override builtin offline) |
| `PATCH /api/scan/<id>/params` | Cập nhật `param_values` sau check-in. Validate cấu trúc, chỉ cho sửa trong `PARAMS_EDIT_WINDOW_MINUTES` (60p) kể từ `created_at`. Param vượt ngưỡng → gửi email cảnh báo + `threshold_breaches` trong response |
| `GET /api/reports?date=YYYY-MM-DD` | Logs theo ngày (giờ VN) + route assessment theo device |
| `GET /api/dashboard?days=7` | Analytics tổng hợp N ngày gần nhất (mặc định 7, clamp 1..90): `heatmap` (24 giờ VN), `geo` (phân bố geo_status + out_of_range_rate), `stations` (sort theo total), `param_trends` (xu hướng từng thông số + breaches) |
| `GET /api/qr-token/<station>` | Token rotating QR hiện tại (màn hình trạm poll) |
| `GET /api/debug/connectivity` | Chẩn đoán CORS/mạng — frontend dùng nút "Test kết nối" |

### Cần `X-Admin-Key` (= ADMIN_SECRET)
| Endpoint | Mô tả |
|---|---|
| `GET/POST /api/admin/stations`, `PUT/DELETE /api/admin/stations/<name>` | CRUD trạm (DELETE = soft, set active=false) |
| `GET/POST /api/admin/qr-aliases`, `DELETE /api/admin/qr-aliases/<id>` | CRUD alias QR |
| `GET/POST /api/admin/station-params`, `PUT/DELETE /api/admin/station-params/<id>` | CRUD thông số |
| `POST /api/admin/purge` | Xóa scan cũ hơn `older_than_days` (mặc định 7) |
| `GET /api/reports/trigger-summary?period=morning\|evening` | Gửi email tổng hợp. Nhận `?key=` cho cron-job.org |
| `GET /api/debug/email-config`, `POST /api/debug/email-test` | Chẩn đoán email (khóa để không bị đốt quota) |

---

## ⚙️ Environment Variables (backend/.env)

```env
DATABASE_URL=postgresql://...          # Supabase; thiếu → app vẫn chạy, DB routes trả 503
RESEND_API_KEY=re_xxx
EMAIL_FROM=checklist@yourdomain.com
EMAIL_TO=a@x.com,b@y.com               # nhiều địa chỉ cách nhau dấu phẩy
CORS_ORIGIN=https://app1.com,https://app2.com   # nhiều origin; localhost default → "*"
ADMIN_SECRET=...                       # khóa admin API + debug + summary
QR_SECRET=...                          # HMAC rotating QR — PHẢI đổi trên prod (≥32 ký tự)
QR_WINDOW_SECONDS=300                  # chu kỳ đổi token
REQUIRE_ROTATING_QR=false              # true = từ chối QR tĩnh
REQUIRE_GPS=false                      # true = không GPS → 403
MAX_GPS_ACCURACY_METERS=200
RATE_LIMIT_WINDOW_MINUTES=60           # cùng device + cùng trạm
RATE_LIMIT_MAX_SCANS=3
PURGE_RETENTION_HOURS=720              # auto-purge scan cũ (30 ngày)
PARAMS_EDIT_WINDOW_MINUTES=60          # cửa sổ PATCH params
EMAIL_ASYNC=true                       # false = gửi email đồng bộ (debug)
EMAIL_ALERTS_ONLY=false                # true = chỉ email khi geo_status != ok (tiết kiệm quota)
GOOGLE_MAPS_API_KEY=...                # static map trong email tổng hợp (optional)
FLASK_ENV=production

# frontend/.env
VITE_API_URL=https://qr-checklist-api.onrender.com
```

---

## 🔑 Các quyết định thiết kế quan trọng

1. **Không login** — `device_id` = hash userAgent + timestamp, lưu localStorage
2. **QR alias** — QR tại trạm chứa mã thiết bị có sẵn (vd `052-LI-042B`) → map sang tên trạm
   qua `qr_aliases`. Frontend cũng có bản alias tĩnh (`lib/stationsConfig.js`) cho offline
3. **Rotating QR (optional)** — `STATION|HMAC_token`, đổi mỗi 5 phút, chấp nhận window
   hiện tại + window trước; màn hình trạm mở `/station/<name>`
4. **Geofencing** — `geo_status`: `ok` / `out_of_range` (lưu DB + 403 cảnh báo) /
   `cached` (vị trí localStorage, không dùng kết tội) / `unverified` (trạm chưa có tọa độ) /
   `no_gps`. GPS watch chạy từ lúc mount để giữ chip GPS warm (WiFi nội bộ không có A-GPS)
5. **Offline-first** — SW cache app shell; scan offline vào localStorage queue, giữ nguyên
   `scanned_at` khi retry; thông số nhập offline ghi vào queue item (`pendingParams` restore
   modal nếu user thoát app giữa chừng)
6. **Chống duplicate** — unique index (device_id, location, scanned_at) + check tầng app
   TRƯỚC rate-limit; client timeout 8s rồi retry sẽ nhận lại scan_id cũ, không tạo bản ghi mới
7. **Email không chặn request** — gửi qua background thread SAU commit; `email_sent`
   cập nhật async. `EMAIL_ALERTS_ONLY=true` để chỉ email cảnh báo (check-in thường nằm
   trong summary sáng/tối do cron-job.org trigger)
8. **Auto-purge** — mỗi scan xóa bản ghi cũ hơn PURGE_RETENTION_HOURS (giữ free tier nhỏ)
9. **Threshold alert** — `threshold_service.check_thresholds` so `value` với `low`/`high`
   (mỗi ngưỡng độc lập, config 1 ngưỡng vẫn cảnh báo; `== ngưỡng` = OK). Có breach →
   `send_threshold_alert_email` gửi email khẩn NGAY, LUÔN gửi kể cả `EMAIL_ALERTS_ONLY=true`
   (cảnh báo ≠ check-in thường). Chạy ở cả `process_scan` (param inline) lẫn route PATCH
   (nhập qua modal sau scan). Frontend `lib/paramStatus.js` dùng cùng logic → viền đỏ khớp email

---

## 🐛 Known Issues / Gotchas

- `html5-qrcode` cần `<div id="qr-reader">` tồn tại trong DOM trước khi init;
  `scanner.stop()` THROW ĐỒNG BỘ nếu chưa scanning → phải try/catch
- iOS Safari yêu cầu user gesture mới mở được camera; input phải font-size ≥16px
- Render free tier **cold start ~30s** — frontend ping `/health` lúc mount + timeout 90s
- `navigator.onLine === true` KHÔNG có nghĩa có internet (WiFi nội bộ) — nhánh
  shouldQueue trong ScanPage xử lý riêng case này
- **Máy dev này npm registry bị chặn (ECONNRESET)** — vendor lib qua cdn.jsdelivr.net
  (đã làm với `src/lib/vendor/qrcode-generator.js`)
- `backend/tests/test_e2e_live.py` bắn vào **PROD Render thật** — 400 khi chạy lại
  là rate limit, không phải regression. Chạy suite thường: `--ignore=tests/test_e2e_live.py`
- Playwright e2e phải chạy từ `frontend/` — suite chuẩn 54 test; gotcha: `setOffline`
  + vite dev reload
- Test backend mock session bằng MagicMock — query chain mới (vd dedupe `.first()`)
  phải set return_value tường minh, nếu không MagicMock truthy phá logic

---

## 🚀 Lệnh chạy dev & test

```bash
# Backend
cd backend
pip install -r requirements.txt
flask run --port 5000
python -m pytest tests -q --ignore=tests/test_e2e_live.py

# Frontend
cd frontend
npm run dev                 # vite :5173, proxy /api → :5000
npm test                    # vitest unit
npm run test:e2e            # playwright (tự khởi động dev server)
```
