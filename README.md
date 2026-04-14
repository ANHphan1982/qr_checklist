# QR Checklist Nhân Sự

Ứng dụng web cho phép nhân viên **scan mã QR tại các trạm kiểm tra** bằng điện thoại. Mỗi lần scan sẽ tự động ghi nhận thời gian, vị trí GPS và gửi email báo cáo đến quản lý — không cần đăng nhập, không cần cài app.

---

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Yêu cầu môi trường](#2-yêu-cầu-môi-trường)
3. [Cài đặt & Chạy local](#3-cài-đặt--chạy-local)
4. [Tạo mã QR cho các trạm](#4-tạo-mã-qr-cho-các-trạm)
5. [Cấu hình biến môi trường](#5-cấu-hình-biến-môi-trường)
6. [Deploy lên cloud miễn phí](#6-deploy-lên-cloud-miễn-phí)
7. [Hướng dẫn sử dụng cho nhân viên](#7-hướng-dẫn-sử-dụng-cho-nhân-viên)
8. [Hướng dẫn sử dụng cho quản lý](#8-hướng-dẫn-sử-dụng-cho-quản-lý)
9. [Cấu hình GPS Geofencing](#9-cấu-hình-gps-geofencing)
10. [Cập nhật danh sách trạm](#10-cập-nhật-danh-sách-trạm)
11. [Xử lý sự cố thường gặp](#11-xử-lý-sự-cố-thường-gặp)

---

## 1. Tổng quan hệ thống

```
[Nhân viên dùng điện thoại]
        ↓ scan QR tại trạm
[Trình duyệt xin quyền GPS]
        ↓ gửi: tên trạm + toạ độ + device ID
[Backend Flask (Render)]
        ↓ kiểm tra GPS có đúng vị trí không
        ↓ lưu vào Supabase (PostgreSQL)
        ↓ gửi email báo cáo qua Resend
[Quản lý nhận email ngay lập tức]
```

**Stack công nghệ (miễn phí hoàn toàn):**

| Thành phần | Công nghệ | Giới hạn free |
|-----------|-----------|---------------|
| Frontend  | React 18 + Vite → Vercel | 100GB bandwidth/tháng |
| Backend   | Flask (Python) → Render | 750h/tháng |
| Database  | Supabase (PostgreSQL) | 500MB, 2 projects |
| Email     | Resend | 100 emails/ngày |

---

## 2. Yêu cầu môi trường

| Công cụ | Phiên bản tối thiểu | Kiểm tra |
|---------|--------------------|-|
| Python  | 3.11+ | `python --version` |
| Node.js | 18+ | `node --version` |
| npm     | 9+ | `npm --version` |
| Git     | bất kỳ | `git --version` |

---

## 3. Cài đặt & Chạy local

### Bước 1 — Clone project

```bash
git clone https://github.com/YOUR_USERNAME/qr-checklist.git
cd qr-checklist
```

### Bước 2 — Cài đặt Backend

```bash
cd backend
pip install -r requirements.txt
```

Tạo file `.env` từ template:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Mở file `backend/.env` và điền thông tin (xem [Mục 5](#5-cấu-hình-biến-môi-trường)).

Chạy backend:

```bash
flask run --port 5000
```

> Backend chạy tại: `http://localhost:5000`
> Kiểm tra: mở `http://localhost:5000/health` → phải trả về `{"status": "ok"}`

### Bước 3 — Cài đặt Frontend

Mở terminal mới:

```bash
cd frontend
npm install
```

Tạo file `.env`:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Khi chạy local, **để trống** `VITE_API_URL` — Vite sẽ tự proxy `/api` về `localhost:5000`.

Chạy frontend:

```bash
npm run dev
```

> Frontend chạy tại: `http://localhost:5173`

### Bước 4 — Chạy test

```bash
# Backend
cd backend
python -m pytest tests/ -v

# Frontend
cd frontend
npm test
```

---

## 4. Tạo mã QR cho các trạm

### Cài đặt

```bash
cd qr-generator
pip install -r requirements.txt
```

### Cập nhật danh sách trạm

Mở file `qr-generator/stations.json` và chỉnh sửa danh sách:

```json
["TK-5201A", "TK-5203A", "TK-5207A", "TK-5205A", "TK-5211A",
 "TK-5214", "TK-5212A", "TK-5213A", "A-5205", "A-5250"]
```

> **Quan trọng:** Tên trong `stations.json` phải **khớp chính xác** với tên được cấu hình GPS trong `backend/services/stations_config.py`.

### Tạo QR

```bash
python generate_qr.py
```

Các file PNG sẽ được tạo trong thư mục `qr-generator/output/`:

```
output/
├── TK-5201A.png
├── TK-5203A.png
├── TK-5207A.png
└── ...
```

### In và dán QR

1. In mỗi file PNG ra giấy A4 (hoặc nhỏ hơn tuỳ trạm)
2. Ép plastic chống nước nếu trạm ngoài trời
3. Dán tại vị trí dễ scan: ngang tầm mắt, đủ sáng, không bị che khuất
4. Kiểm tra bằng cách scan thử trên điện thoại trước khi dán

---

## 5. Cấu hình biến môi trường

### `backend/.env`

```env
# ─── Supabase ──────────────────────────────────────────────────────────────
# Lấy tại: supabase.com → Project → Settings → Database → Connection String
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# ─── Resend ────────────────────────────────────────────────────────────────
# Đăng ký tại: resend.com → API Keys → Create API Key
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx

# Địa chỉ gửi (cần verify domain, hoặc dùng onboarding@resend.dev để test)
EMAIL_FROM=checklist@company.com

# Địa chỉ nhận email báo cáo (quản lý)
EMAIL_TO=manager@company.com

# ─── App ───────────────────────────────────────────────────────────────────
FLASK_ENV=production
# Điền URL Vercel sau khi deploy frontend
CORS_ORIGIN=https://qr-checklist.vercel.app
```

### `frontend/.env`

```env
# URL backend Render (điền sau khi deploy)
# Để trống khi chạy local
VITE_API_URL=https://qr-checklist-api.onrender.com
```

---

## 6. Deploy lên cloud miễn phí

### 6.1 Supabase — Tạo database

1. Đăng ký tại [supabase.com](https://supabase.com)
2. Tạo **New Project** (chọn region Singapore — gần VN nhất)
3. Vào **SQL Editor → New query**, paste nội dung file `supabase/migration.sql` → nhấn **Run**
4. Vào **Settings → Database → Connection String**, chọn **URI**, copy chuỗi kết nối
5. Dán vào `DATABASE_URL` trong `.env` backend

### 6.2 Render — Deploy backend

1. Đăng ký tại [render.com](https://render.com)
2. **New → Web Service** → Connect to GitHub → chọn repo `qr-checklist`
3. Cấu hình:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app --workers 2 --timeout 120`
4. Chuyển sang tab **Environment** → thêm từng biến:

   | Key | Giá trị |
   |-----|---------|
   | `DATABASE_URL` | Chuỗi từ Supabase |
   | `RESEND_API_KEY` | Key từ resend.com |
   | `EMAIL_FROM` | Email gửi |
   | `EMAIL_TO` | Email nhận |
   | `FLASK_ENV` | `production` |
   | `CORS_ORIGIN` | *(điền sau khi có URL Vercel)* |

5. Nhấn **Deploy** → chờ ~2 phút
6. Copy URL dạng `https://qr-checklist-api.onrender.com`
7. Kiểm tra: mở `https://[render-url]/health` → phải trả về `{"status": "ok"}`

> **Lưu ý Render free tier:** Server sẽ ngủ sau 15 phút không có request. Lần đầu gọi API sẽ mất ~30 giây để khởi động lại (cold start). Frontend đã có cảnh báo tự động.

### 6.3 Vercel — Deploy frontend

1. Đăng ký tại [vercel.com](https://vercel.com)
2. **New Project → Import Git Repository** → chọn repo `qr-checklist`
3. Cấu hình:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
4. Mở **Environment Variables** → thêm:
   - `VITE_API_URL` = URL Render từ bước 6.2
5. Nhấn **Deploy** → chờ ~1 phút
6. Copy URL dạng `https://qr-checklist.vercel.app`

### 6.4 Cập nhật CORS

Sau khi có URL Vercel, quay lại Render:
- **Environment → CORS_ORIGIN** → điền URL Vercel (ví dụ: `https://qr-checklist.vercel.app`)
- Nhấn **Save Changes** → Render tự redeploy

---

## 7. Hướng dẫn sử dụng cho nhân viên

### Yêu cầu

- Điện thoại có camera
- Trình duyệt: **Chrome** (Android) hoặc **Safari** (iPhone/iPad)
- Kết nối internet (WiFi hoặc 4G)

### Cách check-in tại trạm

**Bước 1 — Mở ứng dụng**

Truy cập đường link ứng dụng trên trình duyệt điện thoại. Có thể lưu vào màn hình chính để tiện dùng:
- **iPhone:** Safari → nút Chia sẻ → "Thêm vào Màn hình chính"
- **Android:** Chrome → menu ⋮ → "Thêm vào màn hình chính"

**Bước 2 — Cho phép GPS** *(lần đầu)*

Ứng dụng sẽ hiện thông báo xin quyền vị trí. Nhấn **"Cho phép"** để hệ thống xác thực bạn đang đứng đúng tại trạm.

> Nếu từ chối GPS, check-in vẫn hoạt động nhưng quản lý sẽ nhận được cảnh báo "Không có GPS".

**Bước 3 — Scan QR**

1. Nhấn nút **"Bắt đầu Scan"**
2. Cho phép truy cập camera khi được hỏi
3. Hướng camera vào mã QR tại trạm — giữ yên tay
4. Ứng dụng tự động nhận diện, không cần nhấn thêm nút

**Bước 4 — Xác nhận kết quả**

Sau khi scan:
- **Card xanh ✅** → Check-in thành công, email đã gửi cho quản lý
- **Card cam 📍** → Bạn đang đứng sai vị trí (cách trạm quá xa)
- **Card đỏ ❌** → Lỗi kết nối, thử lại sau vài giây

**Bước 5 — Quét tiếp** *(nếu cần)*

Nhấn **"Quét tiếp"** để scan trạm tiếp theo.

### Lưu ý khi sử dụng

- Phải dùng **HTTPS** — ứng dụng không chạy trên HTTP
- Chụp ảnh màn hình kết quả nếu cần bằng chứng check-in
- Nếu scan không được, thử lau sạch camera và đảm bảo đủ ánh sáng
- GPS trong nhà có thể kém chính xác — đứng gần cửa sổ nếu bị báo sai vị trí

---

## 8. Hướng dẫn sử dụng cho quản lý

### Xem email báo cáo

Mỗi lần nhân viên scan QR, quản lý sẽ nhận email với nội dung:

```
Tiêu đề: [Checklist] TK-5201A — 14/04/2026 08:30

📍 BÁO CÁO CHECKLIST

Trạm:       TK-5201A
Thời gian:  14/04/2026 08:30:15
Thiết bị:   Mozilla/5.0 (iPhone...)
Vị trí GPS: ✅ Đúng trạm (cách 12m)  [Xem bản đồ]
Trạng thái: ✅ Đã check-in
```

### Xem lịch sử check-in

Truy cập ứng dụng → tab **"Lịch sử"**:

1. Chọn ngày cần xem từ bộ lọc ngày
2. Nhấn **"Tải"** để cập nhật danh sách
3. Mỗi dòng hiển thị: tên trạm, thời gian, trạng thái GPS, trạng thái email

### Xem dữ liệu trực tiếp trên Supabase

1. Đăng nhập [supabase.com](https://supabase.com) → chọn project
2. Vào **Table Editor → scan_logs**
3. Có thể lọc, sort, export CSV

### Tra cứu qua API

```bash
# Lấy tất cả check-in hôm nay
GET https://[render-url]/api/reports

# Lấy check-in theo ngày cụ thể
GET https://[render-url]/api/reports?date=2026-04-14
```

Kết quả trả về JSON:

```json
{
  "date": "2026-04-14",
  "total": 8,
  "logs": [
    {
      "id": 42,
      "location": "TK-5201A",
      "scanned_at": "2026-04-14T01:30:00+00:00",
      "geo_status": "ok",
      "geo_distance": 12.4,
      "email_sent": true
    }
  ]
}
```

---

## 9. Cấu hình GPS Geofencing

GPS Geofencing ngăn nhân viên check-in từ xa (không có mặt tại trạm thực tế).

### Cập nhật tọa độ các trạm

Mở file `backend/services/stations_config.py`:

```python
STATIONS = {
    "TK-5201A": {
        "lat": 10.823456,   # ← thay bằng vĩ độ thực tế
        "lng": 106.629123,  # ← thay bằng kinh độ thực tế
        "radius": 50,       # bán kính cho phép (mét)
    },
    "TK-5203A": {
        "lat": 10.823789,
        "lng": 106.629456,
        "radius": 50,
    },
    # ... thêm các trạm khác
}
```

### Cách lấy tọa độ thực tế

1. Mở **Google Maps** trên điện thoại
2. Đứng tại vị trí đặt QR của trạm
3. Nhấn giữ vào vị trí hiện tại
4. Copy dòng tọa độ hiện ra (ví dụ: `10.823456, 106.629123`)
5. Điền vào `lat` và `lng` tương ứng

### Điều chỉnh bán kính

| Loại trạm | Bán kính gợi ý | Lý do |
|-----------|---------------|-------|
| Cổng, trạm gác | 30–50m | Không gian nhỏ, cần chính xác |
| Kho, xưởng | 80–100m | Diện tích lớn, GPS trong nhà kém hơn |
| Bãi xe, sân | 60–80m | Không gian rộng ngoài trời |

> **Mẹo:** GPS trong nhà thường lệch 10–30m. Nếu nhân viên hay bị báo sai vị trí dù đứng đúng chỗ, tăng `radius` thêm 20–30m.

### Trạm chưa có tọa độ

Nếu một trạm không có trong `stations_config.py`, hệ thống vẫn cho check-in nhưng ghi `geo_status = "no_gps"` và không kiểm tra vị trí.

---

## 10. Cập nhật danh sách trạm

Khi cần thêm/bớt/đổi tên trạm:

### Bước 1 — Cập nhật stations.json

```bash
# Mở file
qr-generator/stations.json
```

Thêm tên trạm mới vào mảng:

```json
["TK-5201A", "TK-5203A", "TK-MỚI-01"]
```

### Bước 2 — Tạo lại QR

```bash
cd qr-generator
python generate_qr.py
```

In và dán QR mới tại trạm.

### Bước 3 — Cập nhật tọa độ GPS *(nếu dùng geofencing)*

Thêm trạm mới vào `backend/services/stations_config.py` với tọa độ thực tế.

### Bước 4 — Deploy lại backend

```bash
git add .
git commit -m "feat: thêm trạm TK-MỚI-01"
git push
```

Render sẽ tự động redeploy khi có commit mới.

---

## 11. Xử lý sự cố thường gặp

### Camera không mở được

| Triệu chứng | Nguyên nhân | Giải pháp |
|------------|------------|-----------|
| Trang trắng sau khi nhấn Scan | Trình duyệt chặn camera | Vào Settings → cho phép camera cho trang web |
| "Thiết bị không hỗ trợ" | HTTP (không phải HTTPS) | Truy cập bằng `https://` |
| Không hiện popup xin quyền | Đã từ chối trước đó | Settings trình duyệt → Site permissions → Camera → Allow |

**iPhone/Safari cụ thể:**
- Vào **Cài đặt iOS → Safari → Camera** → chọn "Hỏi" hoặc "Cho phép"
- Chỉ hoạt động trên HTTPS — Render và Vercel đều tự cấp SSL ✅

### GPS không chính xác

- Tắt WiFi, chỉ dùng 4G/5G để GPS chính xác hơn
- Ra ngoài trời hoặc đứng gần cửa sổ
- Đợi 5–10 giây để GPS lock tín hiệu
- Nếu vẫn bị báo sai: quản lý tăng `radius` trong `stations_config.py`

### Check-in thành công nhưng không nhận được email

1. Kiểm tra thư mục Spam/Junk
2. Kiểm tra `EMAIL_TO` trong Render environment variables
3. Kiểm tra quota Resend: [resend.com/emails](https://resend.com/emails) — giới hạn 100/ngày
4. Nếu `EMAIL_FROM` dùng domain chưa verify → dùng `onboarding@resend.dev` để test

### API trả về lỗi 500

1. Mở Render Dashboard → **Logs** để xem chi tiết lỗi
2. Kiểm tra `DATABASE_URL` đúng format `postgresql://` (không phải `postgres://`)
3. Kiểm tra Supabase project chưa bị pause (free tier pause sau 1 tuần inactive)
   - Đăng nhập supabase.com → Resume project nếu bị pause

### Server mất ~30 giây để phản hồi

Đây là hiện tượng **cold start** bình thường của Render free tier (server ngủ sau 15 phút không có request). Frontend đã hiển thị thông báo "Server đang khởi động...". Chờ 30 giây rồi thử lại.

**Cách tránh cold start:** Dùng dịch vụ ping định kỳ như [UptimeRobot](https://uptimerobot.com) (free) để gửi request đến `/health` mỗi 14 phút.

### Lỗi CORS

```
Access to XMLHttpRequest blocked by CORS policy
```

Nguyên nhân: `CORS_ORIGIN` trong Render chưa khớp với URL Vercel.

Kiểm tra:
- Render env: `CORS_ORIGIN=https://qr-checklist.vercel.app` (không có dấu `/` cuối)
- Phải khớp **chính xác** với URL trình duyệt đang dùng

---

## Liên hệ & Đóng góp

Nếu gặp vấn đề hoặc muốn đề xuất tính năng, vui lòng tạo issue tại GitHub repository.
