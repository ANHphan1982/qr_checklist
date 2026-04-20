# ĐỔI tọa độ thực tế của từng trạm trước khi deploy.
# Cách lấy tọa độ: mở Google Maps → nhấn giữ vị trí → copy lat,lng
#
# Tên trạm PHẢI khớp chính xác với nội dung QR (case-sensitive).
# Danh sách trạm hiện tại: TK-5201A, TK-5203A, TK-5207A, TK-5205A,
#   TK-5211A, TK-5214, TK-5212A, TK-5213A, A-5205, A-5250

# ---------------------------------------------------------------------------
# QR_ALIAS_MAP — dùng khi QR code tại trạm chứa nội dung khác (URL, mã máy...)
# Key   = nội dung thực tế trong QR (hoặc phần cuối URL sau dấu /)
# Value = tên trạm trong STATIONS bên dưới
#
# Ví dụ QR chứa URL:  https://maintenance.company.com/machine/TK-5201A
#   → key = "https://maintenance.company.com/machine/TK-5201A"
#       hoặc dùng wildcard theo suffix: key = "/machine/TK-5201A"
#
# Ví dụ QR chứa mã máy: "MCH-001"
#   → key = "MCH-001", value = "TK-5201A"
#
# Để trống ({}) nếu QR đã chứa đúng tên trạm.
# ---------------------------------------------------------------------------
QR_ALIAS_MAP: dict[str, str] = {
    # ---------------------------------------------------------------------------
    # Mã QR từ app nội bộ → tên trạm trong STATIONS
    # ---------------------------------------------------------------------------
    "052-LI-022B": "TK-5201A",
    "052-LI-010B": "TK-5203A",
    "052-LI-001B": "TK-5207A",
    "052-LI-066B": "TK-5205A",
    "052-LI-042B": "TK-5211A",
    "052-LI-048B": "TK-5212A",
    "052-LI-075B": "TK-5213A",
    "052-LI-110B": "TK-5214",
    "052-LI-745": "A-5205",
    "052-PG-703": "A-5250",
}

STATIONS: dict[str, dict] = {
    "TK-5201A": {
        "lat": 15.408751,
        "lng": 108.814616,
        "radius": 50,   # mét — nới rộng cho GPS trong nhà máy
    },
    "TK-5203A": {
        "lat": 15.406914,
        "lng": 108.816316,
        "radius": 50,
    },
    "TK-5207A": {
        "lat": 15.406821,
        "lng": 108.813247,
        "radius": 50,
    },
    "TK-5205A": {
        "lat": 15.409161,
        "lng": 108.812188,
        "radius": 50,
    },
    "TK-5211A": {
        "lat": 15.408173,
        "lng": 108.813046,
        "radius": 50,
    },
    "TK-5214": {
        "lat": 15.410666,
        "lng": 108.812386,
        "radius": 50,
    },
    "TK-5212A": {
        "lat": 15.409491,
        "lng": 108.814421,
        "radius": 50,
    },
    "TK-5213A": {
        "lat": 15.410587,
        "lng": 108.813307,
        "radius": 50,
    },
    "A-5205": {
        "lat": 15.411037,
        "lng": 108.812547,
        "radius": 50,
    },
    "A-5250": {
        "lat": 15.409714,
        "lng": 108.811921,
        "radius": 50,
    },
}
