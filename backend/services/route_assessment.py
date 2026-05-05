"""
Đánh giá việc đi kiểm tra giữa các checkpoint.

Tính khoảng cách giữa 2 trạm liên tiếp dựa vào lat/lng đã set trong stations
config, so sánh thời gian di chuyển dự kiến (vận tốc xe đạp) với thời gian
thực tế giữa 2 lần scan để phát hiện gian lận hoặc dừng nghỉ bất thường.
"""
from datetime import datetime, timezone
from services.geo_service import haversine_distance


# Vận tốc xe đạp đường nội bộ/khu công nghiệp.
# Tham khảo: 12-18 km/h là khoảng phổ biến cho người đi nhẹ nhàng kiểm tra.
BICYCLE_SPEED_KMH = 15

# Ngưỡng phân loại assessment (so với thời gian dự kiến)
TOO_FAST_RATIO = 0.5   # actual < 50% expected → quá nhanh, đáng nghi
TOO_SLOW_RATIO = 3.0   # actual > 300% expected → dừng nghỉ lâu

# Ngưỡng coi là "cùng một trạm" — distance < 1m thì bỏ qua check tốc độ
SAME_LOCATION_THRESHOLD_M = 1.0


def _parse_iso(timestamp: str | None) -> datetime | None:
    if not timestamp:
        return None
    try:
        s = timestamp.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, AttributeError):
        return None


def _classify(actual_min: float, expected_min: float) -> str:
    if expected_min <= 0:
        # Cùng trạm hoặc trạm rất gần nhau → không đánh giá tốc độ
        return "ok"
    ratio = actual_min / expected_min
    if ratio < TOO_FAST_RATIO:
        return "too_fast"
    if ratio > TOO_SLOW_RATIO:
        return "too_slow"
    return "ok"


def compute_route_assessment(
    scans: list[dict],
    stations: dict,
    speed_kmh: float = BICYCLE_SPEED_KMH,
) -> list[dict]:
    """
    Enrich danh sách scan với 4 trường đánh giá:
      - distance_from_prev_m: khoảng cách Haversine từ trạm trước (None nếu thiếu data)
      - expected_travel_min:  distance / speed (None nếu không tính được)
      - actual_travel_min:    delta scanned_at giữa 2 scan liên tiếp
      - assessment:           "first" | "ok" | "too_fast" | "too_slow" | "skipped"

    scans phải đã sắp xếp theo scanned_at tăng dần.
    Không mutate input — trả về list mới.

    speed_kmh = 0 sẽ raise ValueError (không có ý nghĩa cho route assessment).
    """
    if speed_kmh <= 0:
        raise ValueError("speed_kmh phải > 0")

    speed_m_per_min = speed_kmh * 1000 / 60
    enriched: list[dict] = []
    prev_scan = None
    prev_time = None
    prev_station = None

    for scan in scans:
        out = dict(scan)
        out["distance_from_prev_m"] = None
        out["expected_travel_min"] = None
        out["actual_travel_min"] = None

        cur_time = _parse_iso(scan.get("scanned_at"))
        cur_station = stations.get(scan.get("location"))

        if prev_scan is None:
            out["assessment"] = "first"
        else:
            # Tính actual time nếu cả 2 scanned_at parse được
            if prev_time and cur_time:
                out["actual_travel_min"] = (cur_time - prev_time).total_seconds() / 60.0

            # Tính distance + expected time nếu cả 2 trạm có lat/lng
            if prev_station and cur_station and "lat" in cur_station and "lat" in prev_station:
                dist = haversine_distance(
                    prev_station["lat"], prev_station["lng"],
                    cur_station["lat"], cur_station["lng"],
                )
                out["distance_from_prev_m"] = dist
                out["expected_travel_min"] = dist / speed_m_per_min

                # Cùng vị trí (re-scan) → không phân loại tốc độ
                if dist < SAME_LOCATION_THRESHOLD_M:
                    out["assessment"] = "ok"
                elif out["actual_travel_min"] is None:
                    out["assessment"] = "skipped"
                else:
                    out["assessment"] = _classify(
                        out["actual_travel_min"],
                        out["expected_travel_min"],
                    )
            else:
                # Thiếu coords → không đánh giá được tốc độ
                out["assessment"] = "skipped"

        enriched.append(out)
        prev_scan = scan
        prev_time = cur_time
        prev_station = cur_station

    return enriched
