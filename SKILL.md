# SKILL.md — QR Checklist: Conventions & Patterns

> File này định nghĩa các pattern, convention và rule khi code dự án.
> Claude phải đọc file này trước khi viết bất kỳ code nào cho dự án.

---

## 1. TỔNG QUAN SKILL

Dự án QR Checklist sử dụng React + ShadcnUI ở frontend và Flask ở backend.
Tất cả tài nguyên sử dụng **free tier**: Vercel, Render, Supabase, Resend.

---

## 2. FRONTEND CONVENTIONS

### 2.1 Cấu trúc Component

```jsx
// ✅ ĐÚNG — functional component với named export
export function ScanPage() {
  return (...)
}

// ✅ ĐÚNG — page component KHÔNG có padding riêng
// Padding tập trung ở App.jsx <main className="p-4">
export function ScanPage() {
  return (
    <div className="w-full space-y-4">
      ...
    </div>
  )
}

// ❌ SAI — không tự thêm padding vào page component
export function ScanPage() {
  return (
    <div className="p-4 w-full"> {/* ← bỏ p-4 ở đây */}
      ...
    </div>
  )
}
```

### 2.2 Mobile-First Rules (BẮT BUỘC)

```jsx
// Touch targets tối thiểu 44px
<Button className="min-h-[44px] min-w-[44px]">Scan</Button>

// Input LUÔN font-size 16px để tránh iOS Safari auto-zoom
<input
  className="text-base"  // = font-size: 16px
  style={{ fontSize: '16px' }}  // thêm inline để chắc chắn
/>

// Dialog/Modal responsive
<DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">

// Grid responsive
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

// Ẩn/hiện theo màn hình
<table className="hidden sm:table">   {/* desktop only */}
<div className="sm:hidden">           {/* mobile only */}
```

### 2.3 ShadcnUI Components hay dùng

```jsx
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"

// Toast thay cho alert()
const { toast } = useToast()
toast({
  title: "✅ Đã ghi nhận",
  description: `Trạm: ${location} — ${time}`,
})

// Toast lỗi
toast({
  variant: "destructive",
  title: "❌ Lỗi",
  description: "Không thể gửi dữ liệu",
})
```

### 2.4 API Calls Pattern

```js
// lib/api.js — axios instance
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 15000,  // 15s timeout (Render cold start)
  headers: { 'Content-Type': 'application/json' }
})

export default api

// Trong component — xử lý Render cold start
const [loading, setLoading] = useState(false)
const [coldStart, setColdStart] = useState(false)

const handleScan = async (location) => {
  setLoading(true)
  const timer = setTimeout(() => setColdStart(true), 5000)  // báo user sau 5s
  try {
    await api.post('/api/scan', { location, device_id: getDeviceId() })
    toast({ title: "✅ Thành công" })
  } catch (err) {
    toast({ variant: "destructive", title: "❌ " + err.message })
  } finally {
    clearTimeout(timer)
    setLoading(false)
    setColdStart(false)
  }
}
```

### 2.5 Device ID (thay cho auth)

```js
// lib/utils.js
export function getDeviceId() {
  // Lưu vào localStorage để consistent
  let deviceId = localStorage.getItem('device_id')
  if (!deviceId) {
    const ua = navigator.userAgent
    const ts = Date.now().toString(36)
    deviceId = btoa(ua).slice(0, 20) + '-' + ts
    localStorage.setItem('device_id', deviceId)
  }
  return deviceId
}

export function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}
```

### 2.6 QR Scanner Pattern (html5-qrcode)

```jsx
// components/QRScanner.jsx
import { Html5QrcodeScanner } from 'html5-qrcode'
import { useEffect, useRef } from 'react'

export function QRScanner({ onScan, onError }) {
  const scannerRef = useRef(null)

  useEffect(() => {
    // QUAN TRỌNG: div#qr-reader phải tồn tại trong DOM trước
    scannerRef.current = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    )

    scannerRef.current.render(
      (decodedText) => {
        scannerRef.current.clear()  // dừng camera sau khi scan
        onScan(decodedText)
      },
      onError
    )

    return () => {
      // cleanup bắt buộc để tránh memory leak
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error)
      }
    }
  }, [])

  return <div id="qr-reader" className="w-full" />
}
```

---

## 3. BACKEND CONVENTIONS

### 3.1 Flask App Structure

```python
# app.py — CORS phải config trước khi register blueprint
from flask import Flask
from flask_cors import CORS
from routes.scan import scan_bp
from routes.reports import reports_bp

app = Flask(__name__)
CORS(app, origins=[os.getenv('CORS_ORIGIN', '*')])

app.register_blueprint(scan_bp, url_prefix='/api')
app.register_blueprint(reports_bp, url_prefix='/api')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', 5000)))
```

### 3.2 Route Pattern

```python
# routes/scan.py
from flask import Blueprint, request, jsonify
from services.scan_service import process_scan

scan_bp = Blueprint('scan', __name__)

@scan_bp.route('/scan', methods=['POST'])
def create_scan():
    data = request.get_json()

    # Validate
    if not data or not data.get('location'):
        return jsonify({'status': 'error', 'message': 'Thiếu trường location'}), 400

    try:
        result = process_scan(
            location=data['location'],
            device_id=data.get('device_id', 'unknown'),
            scanned_at=data.get('scanned_at')
        )
        return jsonify({'status': 'ok', 'scan_id': result['id']}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
```

### 3.3 Email Service (Resend — free 100/ngày)

```python
# services/email_service.py
import resend
import os
from datetime import datetime

resend.api_key = os.getenv('RESEND_API_KEY')

EMAIL_TEMPLATE = """
<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
  <h2 style="color: #16a34a;">📍 Báo Cáo Checklist</h2>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px; font-weight: bold;">Trạm:</td>
        <td style="padding: 8px;">{location}</td></tr>
    <tr style="background: #f9fafb;">
        <td style="padding: 8px; font-weight: bold;">Thời gian:</td>
        <td style="padding: 8px;">{scanned_at}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Thiết bị:</td>
        <td style="padding: 8px;">{device_id}</td></tr>
    <tr style="background: #f9fafb;">
        <td style="padding: 8px; font-weight: bold;">Trạng thái:</td>
        <td style="padding: 8px; color: #16a34a;">✅ Đã check-in</td></tr>
  </table>
  <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
    Gửi tự động bởi hệ thống QR Checklist
  </p>
</div>
"""

def send_scan_email(location: str, scanned_at: str, device_id: str):
    """Gửi email báo cáo scan. Raise exception nếu thất bại."""
    params = {
        "from": os.getenv('EMAIL_FROM'),
        "to": [os.getenv('EMAIL_TO')],
        "subject": f"[Checklist] {location} — {scanned_at}",
        "html": EMAIL_TEMPLATE.format(
            location=location,
            scanned_at=scanned_at,
            device_id=device_id[:30] + "..." if len(device_id) > 30 else device_id
        )
    }
    resend.Emails.send(params)
```

### 3.4 Supabase Connection (thay SQLite/local DB)

```python
# config.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv('DATABASE_URL')
# Fix Supabase URL prefix (SQLAlchemy cần postgresql://)
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# models.py
from config import Base
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, func

class ScanLog(Base):
    __tablename__ = "scan_logs"
    id          = Column(BigInteger, primary_key=True, index=True)
    location    = Column(String(200), nullable=False)
    device_id   = Column(String(500))
    scanned_at  = Column(DateTime(timezone=True), server_default=func.now())
    email_sent  = Column(Boolean, default=False)
```

### 3.5 requirements.txt

```txt
flask==3.0.3
flask-cors==4.0.1
flask-sqlalchemy==3.1.1
psycopg2-binary==2.9.9
python-dotenv==1.0.1
resend==2.0.0
gunicorn==22.0.0
```

---

## 4. QR GENERATOR

```python
# qr-generator/generate_qr.py
import qrcode
from PIL import Image, ImageDraw, ImageFont
import json, os

with open('stations.json') as f:
    stations = json.load(f)  # ["Cổng A", "Kho B", "Phân xưởng C"]

os.makedirs('output', exist_ok=True)

for station in stations:
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(station)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white").convert('RGB')

    # Thêm label tên trạm bên dưới QR
    w, h = img.size
    new_img = Image.new('RGB', (w, h + 60), 'white')
    new_img.paste(img, (0, 0))
    draw = ImageDraw.Draw(new_img)
    draw.text((w//2, h + 30), station, fill='black', anchor='mm')

    filename = station.replace(' ', '_').replace('/', '_')
    new_img.save(f'output/{filename}.png')
    print(f"✅ Tạo QR: {station} → output/{filename}.png")
```

```json
// stations.json
["Cổng A", "Cổng B", "Kho nguyên liệu", "Kho thành phẩm", "Phân xưởng 1", "Bãi xe"]
```

---

## 5. DEPLOY — FREE TIER SETUP

### 5.1 Vercel (Frontend)

```bash
# Cài Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel --prod
# → Tự detect Vite, set VITE_API_URL trong Vercel dashboard
```

`vercel.json`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 5.2 Render (Backend)

`render.yaml`:
```yaml
services:
  - type: web
    name: qr-checklist-api
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:app
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: qr-checklist-db   # hoặc dùng Supabase URL
          property: connectionString
```

### 5.3 Supabase (Database)

1. Tạo project tại supabase.com (free: 500MB, 2 projects)
2. Copy `DATABASE_URL` từ Settings → Database → Connection String
3. Chạy migration SQL trong Supabase SQL Editor

### 5.4 Resend (Email)

1. Đăng ký resend.com (free: 100 emails/ngày, 3000/tháng)
2. Verify domain hoặc dùng `onboarding@resend.dev` để test
3. Copy API key vào `.env`

---

## 6. GPS GEOFENCING — CHỐNG GIAN LẬN

### 6.1 Nguyên lý

Khi nhân viên scan QR, browser xin quyền GPS → gửi `{lat, lng}` cùng scan event lên backend.
Backend tính khoảng cách từ điểm đó đến tọa độ trạm (Haversine formula).
Nếu khoảng cách > `radius_meters` → từ chối, trả về lỗi `OUT_OF_RANGE`.

```
[Điện thoại scan QR]
        ↓
[Browser xin GPS permission]
        ↓
[Gửi: location + lat + lng + device_id]
        ↓
[Backend: tính distance(scan_point, station_coords)]
        ↓
   distance ≤ 50m?
   ✅ YES → lưu DB + gửi email
   ❌ NO  → trả 403 OUT_OF_RANGE
```

### 6.2 Frontend — `lib/geolocation.js`

```js
// lib/geolocation.js
// Luôn wrap trong try/catch — user có thể từ chối GPS

export const GEO_ERRORS = {
  PERMISSION_DENIED: 'Bạn cần cho phép truy cập vị trí để check-in.',
  POSITION_UNAVAILABLE: 'Không lấy được vị trí. Vui lòng thử lại ngoài trời.',
  TIMEOUT: 'Lấy vị trí quá lâu. Kiểm tra GPS đã bật chưa.',
  UNSUPPORTED: 'Thiết bị không hỗ trợ GPS.',
}

/**
 * Kiểm tra trạng thái quyền GPS TRƯỚC khi xin thật.
 * Passive — không trigger hộp thoại xin quyền.
 * Dùng để hiện hint cho user ở màn hình idle.
 *
 * @returns {Promise<'granted'|'prompt'|'denied'|'unknown'>}
 */
export async function checkGpsPermission() {
  if (!navigator.permissions) return 'unknown'
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' })
    return result.state  // 'granted' | 'prompt' | 'denied'
  } catch {
    return 'unknown'
  }
}

export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error(GEO_ERRORS.UNSUPPORTED))
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,  // meters — hiển thị cho user
      }),
      (err) => {
        const msg = {
          1: GEO_ERRORS.PERMISSION_DENIED,
          2: GEO_ERRORS.POSITION_UNAVAILABLE,
          3: GEO_ERRORS.TIMEOUT,
        }[err.code] || 'Lỗi GPS không xác định.'
        reject(new Error(msg))
      },
      {
        enableHighAccuracy: true,  // dùng GPS thật, không dùng IP
        timeout: 10000,            // 10s timeout
        maximumAge: 0,             // không dùng cache vị trí cũ
        ...options,
      }
    )
  })
}
```

### 6.3 Frontend — Flow 6 bước trong `ScanPage.jsx`

```
Bước 1: idle       → màn hình chờ, hint GPS permission, nút "Bắt đầu Scan"
Bước 2: permission → [click] check quyền GPS (<200ms, passive), refresh hint
Bước 3: scanning   → camera mở, chờ user quét QR
Bước 4: gps        → QR đã đọc, đang lấy toạ độ GPS
Bước 5: sending    → gọi POST /api/scan, cold-start warning sau 5s
Bước 6: done       → thành công, hiện card kết quả + nút "Quét tiếp"
```

```jsx
// Gọi checkGpsPermission() khi mount (passive, không trigger hộp thoại)
useEffect(() => {
  checkGpsPermission().then(setGpsPermission)
}, [])

// Khi user bấm "Bắt đầu Scan"
const handleStart = async () => {
  setStep('permission')                          // bước 2
  const perm = await checkGpsPermission()        // refresh < 200ms
  setGpsPermission(perm)
  setStep('scanning')                            // bước 3
}

// Sau khi QR được quét
const handleScan = async (qrText) => {
  setStep('gps')                                 // bước 4
  let gpsData = null
  try {
    gpsData = await getCurrentPosition()
  } catch (gpsErr) {
    console.warn('[GPS]', gpsErr.message)        // không block check-in
  }

  setStep('sending')                             // bước 5
  const coldTimer = setTimeout(() => setColdStart(true), 5000)
  try {
    const data = await postScan(qrText, getDeviceId(), gpsData)
    setResult({ status: 'ok', ...data })
    setStep('done')                              // bước 6
  } catch (err) {
    const apiData = err?.response?.data || {}
    setResult({
      status: 'error',
      message: apiData.message || err.message,
      outOfRange: apiData.code === 'OUT_OF_RANGE',
      distance: apiData.distance,
    })
    setStep('idle')
  } finally {
    clearTimeout(coldTimer)
    setColdStart(false)
  }
}

// GPS permission hint (hiện ở bước 1 và 6)
const PERMISSION_LABEL = {
  granted: { icon: '✅', text: 'GPS đã sẵn sàng' },
  prompt:  { icon: '📍', text: 'Sẽ hỏi quyền GPS khi scan' },
  denied:  { icon: '⚠️', text: 'GPS bị từ chối — check-in vẫn hoạt động, không xác thực vị trí' },
  unknown: { icon: '📡', text: 'Không kiểm tra được GPS' },
}
```

### 6.4 Backend — `services/geo_service.py`

```python
# services/geo_service.py
import math

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Tính khoảng cách (mét) giữa 2 toạ độ GPS dùng Haversine formula.
    Không cần thư viện ngoài — chỉ dùng math stdlib.
    """
    R = 6_371_000  # bán kính Trái Đất (mét)
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = math.sin(dphi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def validate_location(station_name: str, scan_lat: float, scan_lng: float,
                      stations: dict) -> dict:
    """
    Kiểm tra scan_lat/lng có nằm trong bán kính trạm không.

    stations format:
    {
      "Cổng A": {"lat": 10.823, "lng": 106.629, "radius": 50},
      ...
    }

    Returns:
      {"valid": True, "distance": 12.4}
      {"valid": False, "distance": 234.1, "message": "Bạn cách trạm 234m, cần ≤ 50m"}
    """
    station = stations.get(station_name)
    if not station:
        # Trạm chưa được config tọa độ → bỏ qua kiểm tra GPS
        return {"valid": True, "distance": None, "skipped": True}

    distance = haversine_distance(
        scan_lat, scan_lng,
        station["lat"], station["lng"]
    )
    radius = station.get("radius", 50)  # default 50m

    if distance <= radius:
        return {"valid": True, "distance": round(distance, 1)}
    else:
        return {
            "valid": False,
            "distance": round(distance, 1),
            "message": f"Bạn đang cách trạm '{station_name}' {round(distance)}m, cần ≤ {radius}m"
        }
```

### 6.5 Backend — `services/stations_config.py`

```python
# services/stations_config.py
# ĐỔI tọa độ thực tế của từng trạm trước khi deploy
# Cách lấy tọa độ: mở Google Maps → nhấn giữ vị trí → copy lat,lng

STATIONS = {
    "Cổng A": {
        "lat": 10.823456,
        "lng": 106.629123,
        "radius": 50,        # mét — nới rộng nếu GPS hay sai trong nhà
    },
    "Cổng B": {
        "lat": 10.823789,
        "lng": 106.629456,
        "radius": 50,
    },
    "Kho nguyên liệu": {
        "lat": 10.824100,
        "lng": 106.628900,
        "radius": 80,        # kho lớn → bán kính rộng hơn
    },
    "Kho thành phẩm": {
        "lat": 10.824300,
        "lng": 106.629200,
        "radius": 80,
    },
    "Phân xưởng 1": {
        "lat": 10.823100,
        "lng": 106.629800,
        "radius": 100,
    },
    "Bãi xe": {
        "lat": 10.822800,
        "lng": 106.628600,
        "radius": 60,
    },
}
```

### 6.6 Backend — `routes/scan.py` (cập nhật có GPS)

```python
# routes/scan.py
from flask import Blueprint, request, jsonify
from services.scan_service import process_scan
from services.geo_service import validate_location
from services.stations_config import STATIONS

scan_bp = Blueprint('scan', __name__)

@scan_bp.route('/scan', methods=['POST'])
def create_scan():
    data = request.get_json()

    # --- Validate required fields ---
    if not data or not data.get('location'):
        return jsonify({'status': 'error', 'message': 'Thiếu trường location'}), 400

    location   = data['location']
    device_id  = data.get('device_id', 'unknown')
    scan_lat   = data.get('lat')
    scan_lng   = data.get('lng')
    accuracy   = data.get('accuracy')  # lưu để debug

    # --- GPS Validation ---
    geo_result = {"valid": True, "distance": None, "skipped": True}

    if scan_lat is not None and scan_lng is not None:
        geo_result = validate_location(location, scan_lat, scan_lng, STATIONS)
        if not geo_result['valid']:
            return jsonify({
                'status': 'error',
                'code': 'OUT_OF_RANGE',
                'message': geo_result['message'],
                'distance': geo_result['distance'],
            }), 403
    # Nếu frontend không gửi GPS → vẫn cho qua nhưng ghi log thiếu GPS

    try:
        result = process_scan(
            location=location,
            device_id=device_id,
            lat=scan_lat,
            lng=scan_lng,
            accuracy=accuracy,
            geo_distance=geo_result.get('distance'),
        )
        return jsonify({'status': 'ok', 'scan_id': result['id']}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
```

### 6.7 Database — Cột bổ sung cho GPS

```sql
-- Thêm vào bảng scan_logs (chạy trong Supabase SQL Editor)
ALTER TABLE scan_logs
  ADD COLUMN lat          DOUBLE PRECISION,
  ADD COLUMN lng          DOUBLE PRECISION,
  ADD COLUMN gps_accuracy REAL,
  ADD COLUMN geo_distance REAL,        -- khoảng cách thực tế đến trạm (mét)
  ADD COLUMN geo_status   VARCHAR(20)  -- 'ok' | 'out_of_range' | 'no_gps'
    DEFAULT 'no_gps';
```

```python
# models.py — cập nhật ScanLog
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Float, func

class ScanLog(Base):
    __tablename__ = "scan_logs"
    id           = Column(BigInteger, primary_key=True)
    location     = Column(String(200), nullable=False)
    device_id    = Column(String(500))
    lat          = Column(Float)
    lng          = Column(Float)
    gps_accuracy = Column(Float)    # độ chính xác GPS (mét)
    geo_distance = Column(Float)    # khoảng cách đến trạm (mét)
    geo_status   = Column(String(20), default='no_gps')
    scanned_at   = Column(DateTime(timezone=True), server_default=func.now())
    email_sent   = Column(Boolean, default=False)
```

### 6.8 Email Template — Bổ sung GPS info

```python
# Thêm vào EMAIL_TEMPLATE trong email_service.py
GEO_ROW = """
    <tr><td style="padding: 8px; font-weight: bold;">Vị trí GPS:</td>
        <td style="padding: 8px;">
          {geo_info}
          <a href="https://maps.google.com/?q={lat},{lng}"
             style="color: #2563eb; font-size: 12px;">(Xem bản đồ)</a>
        </td></tr>
"""

# geo_info examples:
# "✅ Đúng trạm (cách 12m)"
# "⚠️ Không có GPS"
```

### 6.9 Gotchas GPS quan trọng

```
1. GPS trong nhà lệch 10-30m → đặt radius ≥ 50m, kho lớn dùng 80-100m
2. iOS Safari yêu cầu HTTPS mới cho phép GPS (Render/Vercel tự cấp ✅)
3. User từ chối GPS → KHÔNG block, chỉ ghi log geo_status='no_gps'
   Lý do: có thể điện thoại cũ không có GPS → không nên block toàn bộ
   Thay vào đó: email gửi kèm cảnh báo "⚠️ Không có GPS"
4. accuracy > 100m → GPS kém, cân nhắc cảnh báo user bật GPS/ra ngoài
5. enableHighAccuracy: true sẽ hỏi GPS thật (chậm ~3-5s) nhưng chính xác hơn
```

## 7. CHECKLIST TRƯỚC KHI DEPLOY

```
□ HTTPS enabled (Vercel/Render tự cấp)
□ CORS_ORIGIN set đúng domain Vercel
□ DATABASE_URL dùng postgresql:// (không phải postgres://)
□ Tất cả input có font-size: 16px (iOS Safari)
□ Loading state hiển thị khi gọi API (Render cold start ~30s)
□ QR PNG đã in và dán tại các trạm
□ Test camera trên iOS Safari và Android Chrome
□ Email nhận được sau khi test scan
□ [GPS] Đã cập nhật tọa độ thực tế trong stations_config.py
□ [GPS] Test scan đúng trạm → status ok
□ [GPS] Test scan sai trạm (>50m) → status OUT_OF_RANGE
□ [GPS] Test từ chối GPS permission → ghi log no_gps, vẫn cho qua
□ [GPS] Kiểm tra link Google Maps trong email mở đúng vị trí
```

---

## 8. FREE TIER LIMITS — CẦN LƯU Ý

| Service  | Giới hạn                          | Xử lý                              |
|----------|-----------------------------------|------------------------------------|
| Render   | Sleep sau 15 phút idle            | Hiển thị "Đang kết nối..." ở UI    |
| Supabase | 500MB, pause sau 1 tuần inactive  | Ping DB định kỳ hoặc upgrade $25   |
| Resend   | 100 emails/ngày                   | Đủ cho team <50 người              |
| Vercel   | 100GB bandwidth/tháng             | Không lo với app nội bộ            |
