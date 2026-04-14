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

    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def validate_location(
    station_name: str,
    scan_lat: float,
    scan_lng: float,
    stations: dict,
) -> dict:
    """
    Kiểm tra scan_lat/lng có nằm trong bán kính trạm không.

    stations format:
      { "Cổng A": {"lat": 10.823, "lng": 106.629, "radius": 50}, ... }

    Returns:
      {"valid": True, "distance": 12.4}
      {"valid": False, "distance": 234.1, "message": "..."}
      {"valid": True, "distance": None, "skipped": True}  ← trạm chưa config
    """
    station = stations.get(station_name)
    if not station:
        # Trạm chưa được config tọa độ → bỏ qua kiểm tra GPS
        return {"valid": True, "distance": None, "skipped": True}

    distance = haversine_distance(scan_lat, scan_lng, station["lat"], station["lng"])
    radius = station.get("radius", 50)  # default 50m

    if distance <= radius:
        return {"valid": True, "distance": round(distance, 1)}

    return {
        "valid": False,
        "distance": round(distance, 1),
        "message": (
            f"Bạn đang cách trạm '{station_name}' {round(distance)}m, cần ≤ {radius}m"
        ),
    }
