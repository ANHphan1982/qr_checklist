# CLAUDE.md — QR Checklist Nhân Sự

> File này giúp Claude hiểu toàn bộ context dự án khi bắt đầu một conversation mới.
> Paste nội dung file này vào đầu mỗi chat session với Claude.

---

## 🎯 Mô tả dự án

Ứng dụng web **QR Checklist Nhân Sự** cho phép nhân viên dùng điện thoại scan QR tại các trạm kiểm tra. Mỗi lần scan sẽ ghi nhận thời gian, địa điểm và tự động gửi email báo cáo realtime đến quản lý — không cần đăng nhập.

**Mục tiêu:** Tracking nhân sự đi checklist đúng giờ, đúng trạm, không cần app native.

---

## 🏗️ Tech Stack

| Layer      | Công nghệ                          | Lý do chọn              |
|------------|------------------------------------|-------------------------|
| Frontend   | React 18 + Vite                    | Fast build, HMR tốt     |
| UI         | ShadcnUI + TailwindCSS             | Component đẹp, free     |
| QR Scan    | html5-qrcode                       | Hỗ trợ iOS Safari       |
| Backend    | Flask (Python 3.11)                | Nhẹ, quen thuộc         |
| Database   | Supabase (PostgreSQL free tier)    | 500MB free, realtime    |
| Email      | Resend (free 100 emails/day)       | Render SMTP bị block    |
| Hosting FE | Vercel (free)                      | CI/CD tự động           |
| Hosting BE | Render (free tier)                 | Quen dùng, free         |
| QR Gen     | qrcode (Python lib)                | Tạo QR PNG in dán trạm  |

---

## 📁 Cấu trúc thư mục

```
qr-checklist/
├── CLAUDE.md                  ← file này
├── SKILL.md                   ← conventions & patterns
│
├── backend/
│   ├── app.py                 ← Flask entry point, CORS config
│   ├── config.py              ← load .env, Supabase/Resend keys
│   ├── models.py              ← SQLAlchemy model: ScanLog
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── scan.py            ← POST /api/scan
│   │   └── reports.py         ← GET /api/reports (optional)
│   ├── services/
│   │   ├── email_service.py   ← gửi email qua Resend API
│   │   └── scan_service.py    ← validate + lưu scan log
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx            ← Router, layout wrapper
│   │   ├── pages/
│   │   │   ├── ScanPage.jsx   ← Trang chính: camera scan
│   │   │   └── HistoryPage.jsx← Lịch sử scan hôm nay
│   │   ├── components/
│   │   │   ├── QRScanner.jsx  ← html5-qrcode wrapper
│   │   │   ├── ScanResult.jsx ← Toast/Dialog kết quả
│   │   │   └── ScanHistory.jsx← Danh sách log
│   │   └── lib/
│   │       ├── api.js         ← axios instance + endpoints
│   │       └── utils.js       ← format date, device id
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
└── qr-generator/
    ├── generate_qr.py         ← tạo QR PNG cho từng trạm
    ├── stations.json          ← danh sách trạm
    └── output/                ← QR PNG output
```

---

## 🗃️ Database Schema

```sql
-- Supabase (PostgreSQL)
CREATE TABLE scan_logs (
  id          BIGSERIAL PRIMARY KEY,
  location    VARCHAR(200) NOT NULL,   -- tên trạm từ QR
  device_id   VARCHAR(500),            -- browser fingerprint
  scanned_at  TIMESTAMPTZ DEFAULT NOW(),
  email_sent  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index để query nhanh theo ngày
CREATE INDEX idx_scan_logs_date ON scan_logs (scanned_at DESC);
```

---

## 🌐 API Endpoints

### POST /api/scan
```json
// Request
{
  "location": "Cổng A",
  "device_id": "ua-hash-abc123",
  "scanned_at": "2026-04-14T08:30:00+07:00"
}

// Response 200
{
  "status": "ok",
  "scan_id": 42,
  "message": "Đã ghi nhận và gửi email"
}

// Response 400
{
  "status": "error",
  "message": "Thiếu trường location"
}
```

### GET /api/reports?date=2026-04-14
```json
{
  "date": "2026-04-14",
  "total": 15,
  "logs": [
    {
      "id": 1,
      "location": "Cổng A",
      "scanned_at": "2026-04-14T08:30:00+07:00",
      "device_id": "ua-hash-abc123"
    }
  ]
}
```

---

## ⚙️ Environment Variables

### backend/.env
```env
# Supabase
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# Resend
RESEND_API_KEY=re_xxxxxxxxxx
EMAIL_FROM=checklist@yourdomain.com
EMAIL_TO=manager@company.com

# App
FLASK_ENV=production
CORS_ORIGIN=https://qr-checklist.vercel.app
```

### frontend/.env
```env
VITE_API_URL=https://qr-checklist-api.onrender.com
```

---

## 📧 Email Template

```
Subject: [Checklist] Cổng A — 14/04/2026 08:30

📍 BÁO CÁO CHECKLIST

Trạm:      Cổng A
Thời gian: 14/04/2026 08:30:15
Thiết bị:  Mobile (Safari/iOS)
Trạng thái: ✅ Đã check-in

---
Gửi tự động bởi hệ thống QR Checklist
```

---

## 🔑 Các quyết định thiết kế quan trọng

1. **Không cần login** — device fingerprint từ `navigator.userAgent` hash đủ để nhận diện
2. **QR chứa plaintext** — tên trạm trực tiếp (VD: `Cổng A`), không cần lookup DB
3. **HTTPS bắt buộc** — camera API chỉ hoạt động trên HTTPS
4. **Font-size 16px** — tất cả input trên mobile để tránh iOS Safari auto-zoom
5. **Resend thay SMTP** — Render free tier block port 25/465/587
6. **Supabase thay local DB** — Render free tier sleep sau 15 phút, mất data nếu dùng SQLite

---

## 🐛 Known Issues / Gotchas

- `html5-qrcode` cần `<div id="qr-reader">` tồn tại trong DOM trước khi init
- iOS Safari yêu cầu user gesture (tap button) mới cho phép mở camera
- Render free tier **cold start ~30s** — hiển thị loading state ở frontend
- Supabase free tier giới hạn **500MB storage, 2GB bandwidth/tháng**
- Resend free tier **100 emails/ngày** — đủ cho team nhỏ <50 người

---

## 🚀 Lệnh chạy dev

```bash
# Backend
cd backend
pip install -r requirements.txt
flask run --port 5000

# Frontend
cd frontend
npm install
npm run dev
```
