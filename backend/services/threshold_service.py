"""
services/threshold_service.py — Phát hiện thông số vận hành vượt ngưỡng.

Mỗi thông số trong param_values có dạng:
    {tag, label, unit, value, low, high}

Breach (vượt ngưỡng) khi:
    value < low   → kind="low"   (thấp hơn ngưỡng dưới)
    value > high  → kind="high"  (cao hơn ngưỡng trên)

Hai ngưỡng xét ĐỘC LẬP: config chỉ có low (vd mức dầu tối thiểu) hoặc chỉ có
high (vd nhiệt độ tối đa) vẫn cảnh báo được. Giá trị đúng tại ngưỡng (== low /
== high) coi là bình thường, không cảnh báo.

Dùng cho threshold alert: khi check-in/PATCH thông số có breach → gửi email khẩn.
"""


def _is_number(v):
    """Số thực sự — loại bool (bool là subclass của int trong Python)."""
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def check_thresholds(param_values):
    """Trả về danh sách thông số vượt ngưỡng (rỗng nếu không có / input không hợp lệ).

    Mỗi phần tử: {tag, label, unit, value, low, high, kind} với kind ∈ {"low","high"}.
    """
    breaches = []
    if not isinstance(param_values, list):
        return breaches

    for pv in param_values:
        if not isinstance(pv, dict):
            continue
        value = pv.get("value")
        if not _is_number(value):
            continue

        low = pv.get("low")
        high = pv.get("high")
        kind = None
        if _is_number(low) and value < low:
            kind = "low"
        elif _is_number(high) and value > high:
            kind = "high"

        if kind:
            breaches.append({
                "tag": pv.get("tag"),
                "label": pv.get("label"),
                "unit": pv.get("unit"),
                "value": value,
                "low": low,
                "high": high,
                "kind": kind,
            })

    return breaches
