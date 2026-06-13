"""
services/dashboard_service.py — Tổng hợp analytics cho trang /dashboard (quản lý).

Toàn bộ là hàm THUẦN nhận list log dạng ScanLog.to_dict() (scanned_at = ISO
string giờ UTC, param_values = list các {tag,label,unit,value,low,high}). Không
truy vấn DB ở đây — route lo phần fetch — nên dễ test và tái dùng.

Tận dụng threshold_service.check_thresholds để đếm breach nhất quán với cảnh báo.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from services.threshold_service import check_thresholds

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

# Thứ tự geo_status cố định để UI luôn vẽ cùng bố cục, kể cả khi vắng mặt status.
GEO_STATUSES = ("ok", "out_of_range", "cached", "unverified", "no_gps")


def _parse(ts):
    """ISO string → datetime aware (UTC nếu thiếu tz). None nếu không parse được."""
    if not ts:
        return None
    try:
        s = ts.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, AttributeError):
        return None


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def scan_heatmap(logs):
    """Đếm số scan theo giờ trong ngày (0..23) theo giờ VN. Trả list 24 phần tử."""
    hours = [0] * 24
    for log in logs:
        dt = _parse(log.get("scanned_at"))
        if dt is not None:
            hours[dt.astimezone(VN_TZ).hour] += 1
    return hours


def geo_status_breakdown(logs):
    """Phân bố geo_status + tỷ lệ out_of_range (0..1)."""
    counts = {st: 0 for st in GEO_STATUSES}
    for log in logs:
        st = log.get("geo_status") or "no_gps"
        counts[st] = counts.get(st, 0) + 1
    total = sum(counts.values())
    rate = counts["out_of_range"] / total if total else 0.0
    return {"counts": counts, "total": total, "out_of_range_rate": rate}


def station_activity(logs):
    """Thống kê theo trạm: tổng scan, số out_of_range, lần scan gần nhất.

    Sắp theo tổng scan giảm dần (trạm hoạt động nhiều lên đầu).
    """
    by = {}
    for log in logs:
        loc = log.get("location")
        if not loc:
            continue
        s = by.get(loc)
        if s is None:
            s = {"station": loc, "total": 0, "out_of_range": 0, "last_scan": None, "_last_dt": None}
            by[loc] = s
        s["total"] += 1
        if log.get("geo_status") == "out_of_range":
            s["out_of_range"] += 1
        dt = _parse(log.get("scanned_at"))
        if dt is not None and (s["_last_dt"] is None or dt > s["_last_dt"]):
            s["_last_dt"] = dt
            s["last_scan"] = log.get("scanned_at")

    out = []
    for s in by.values():
        s.pop("_last_dt", None)
        out.append(s)
    out.sort(key=lambda s: s["total"], reverse=True)
    return out


def _trend_direction(values):
    """So sánh giá trị cuối với đầu: 'up' | 'down' | 'flat'."""
    if len(values) < 2:
        return "flat"
    first, last = values[0], values[-1]
    if last > first:
        return "up"
    if last < first:
        return "down"
    return "flat"


def param_trends(logs):
    """Xu hướng từng thông số theo (trạm, tag, label, unit).

    Mỗi nhóm: {station, tag, label, unit, points:[{scanned_at,value}], direction, breaches}.
    points sắp theo thời gian tăng dần; breaches = số điểm vượt ngưỡng cấu hình.
    """
    groups = {}
    for log in logs:
        loc = log.get("location")
        dt = _parse(log.get("scanned_at"))
        for pv in (log.get("param_values") or []):
            if not isinstance(pv, dict):
                continue
            if not _is_number(pv.get("value")):
                continue
            key = (loc, pv.get("tag"), pv.get("label"), pv.get("unit"))
            g = groups.get(key)
            if g is None:
                g = {
                    "station": loc, "tag": pv.get("tag"),
                    "label": pv.get("label"), "unit": pv.get("unit"),
                    "_points": [],
                }
                groups[key] = g
            # đếm breach ngay theo low/high của chính điểm đó (nhất quán cảnh báo)
            is_breach = bool(check_thresholds([pv]))
            g["_points"].append({
                "scanned_at": log.get("scanned_at"),
                "value": pv.get("value"),
                "_dt": dt,
                "_breach": is_breach,
            })

    result = []
    for g in groups.values():
        pts = sorted(g["_points"], key=lambda p: (p["_dt"] is None, p["_dt"] or datetime.min.replace(tzinfo=timezone.utc)))
        values = [p["value"] for p in pts]
        breaches = sum(1 for p in pts if p["_breach"])
        clean_points = [{"scanned_at": p["scanned_at"], "value": p["value"]} for p in pts]
        result.append({
            "station": g["station"], "tag": g["tag"],
            "label": g["label"], "unit": g["unit"],
            "points": clean_points,
            "direction": _trend_direction(values),
            "breaches": breaches,
            "latest": values[-1] if values else None,
        })
    return result


def build_dashboard(logs):
    """Gộp toàn bộ section analytics cho 1 cửa sổ log."""
    return {
        "total": len(logs),
        "heatmap": scan_heatmap(logs),
        "geo": geo_status_breakdown(logs),
        "stations": station_activity(logs),
        "param_trends": param_trends(logs),
    }
