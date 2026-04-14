# ĐỔI tọa độ thực tế của từng trạm trước khi deploy.
# Cách lấy tọa độ: mở Google Maps → nhấn giữ vị trí → copy lat,lng

STATIONS: dict[str, dict] = {
    "Cổng A": {
        "lat": 10.823456,
        "lng": 106.629123,
        "radius": 50,         # mét — nới rộng nếu GPS hay sai trong nhà
    },
    "Cổng B": {
        "lat": 10.823789,
        "lng": 106.629456,
        "radius": 50,
    },
    "Kho nguyên liệu": {
        "lat": 10.824100,
        "lng": 106.628900,
        "radius": 80,         # kho lớn → bán kính rộng hơn
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
