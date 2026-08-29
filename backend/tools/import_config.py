"""
Import hàng loạt Trạm + QR Alias + Thông số từ file Excel template vào DB.

Cách dùng:
    cd backend
    python tools/import_config.py ../import-template/cau_hinh_template.xlsx
    python tools/import_config.py file.xlsx --dry-run   # chỉ xem trước, không ghi

Upsert (không tạo bản sao khi import lại):
    Trạm     -> theo name
    QR Alias -> theo qr_content
    Thông số -> theo (station_name + tag + param_label)

Import KHÔNG xóa dữ liệu cũ. Để gỡ 1 thông số: đặt active=FALSE rồi import lại.
"""
import os
import sys

try:  # đảm bảo in tiếng Việt được trên console Windows (cp1252)
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from openpyxl import load_workbook

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import SessionLocal  # noqa: E402
from models import Station, QrAlias, StationParam, resolve_checklist_list  # noqa: E402


# --------------------------------------------------------------------------- #
# Helpers parse ô Excel
# --------------------------------------------------------------------------- #
def _s(v):
    """Chuỗi đã strip; None/ô trống -> ''."""
    if v is None:
        return ""
    return str(v).strip()


def _float_or_none(v):
    s = _s(v)
    if s == "":
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def _int_or(v, default=0):
    s = _s(v)
    if s == "":
        return default
    try:
        return int(float(s))
    except ValueError:
        return default


def _bool_or(v, default=True):
    s = _s(v).lower()
    if s == "":
        return default
    return s not in {"0", "false", "no", "n", "khong", "không", "tat", "tắt", "off", "x"}


def _rows(ws):
    """Yield dict {header: value} cho từng hàng dữ liệu (bỏ hàng tiêu đề + hàng rỗng)."""
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return
    headers = [_s(h) for h in rows[0]]
    for raw in rows[1:]:
        if raw is None or all(c is None or _s(c) == "" for c in raw):
            continue
        yield {headers[i]: (raw[i] if i < len(raw) else None) for i in range(len(headers))}


# --------------------------------------------------------------------------- #
# Import từng sheet
# --------------------------------------------------------------------------- #
def import_stations(session, ws, dry_run):
    created = updated = skipped = 0
    for row in _rows(ws):
        name = _s(row.get("name")).upper()
        lat = _float_or_none(row.get("lat"))
        lng = _float_or_none(row.get("lng"))
        if not name or lat is None or lng is None:
            print(f"  [!] Bo qua tram thieu name/lat/lng: {row}")
            skipped += 1
            continue
        radius = _int_or(row.get("radius"), 50)
        active = _bool_or(row.get("active"), True)
        ct_raw = [c.strip() for c in _s(row.get("checklist_types")).split(",") if c.strip()]
        checklist_types = resolve_checklist_list(ct_raw, None)

        st = session.query(Station).filter(Station.name == name).first()
        if st:
            st.lat, st.lng, st.radius, st.active = lat, lng, radius, active
            if ct_raw:  # chỉ ghi đè checklist khi ô có giá trị (tránh xóa nhầm)
                st.checklist_types = checklist_types
                st.checklist_type = checklist_types[0] if checklist_types else None
            updated += 1
        else:
            st = Station(name=name, lat=lat, lng=lng, radius=radius, active=active,
                         checklist_types=checklist_types,
                         checklist_type=checklist_types[0] if checklist_types else None)
            session.add(st)
            created += 1
    print(f"Trạm:      +{created} mới, ~{updated} cập nhật, {skipped} bỏ qua")
    return created, updated, skipped


def import_aliases(session, ws, dry_run):
    created = updated = skipped = 0
    for row in _rows(ws):
        qr = _s(row.get("qr_content"))
        station = _s(row.get("station_name")).upper()
        note = _s(row.get("note")) or None
        if not qr or not station:
            print(f"  [!] Bo qua alias thieu qr_content/station_name: {row}")
            skipped += 1
            continue
        al = session.query(QrAlias).filter(QrAlias.qr_content == qr).first()
        if al:
            al.station_name, al.note = station, note
            updated += 1
        else:
            session.add(QrAlias(qr_content=qr, station_name=station, note=note))
            created += 1
    print(f"QR Alias:  +{created} mới, ~{updated} cập nhật, {skipped} bỏ qua")
    return created, updated, skipped


def import_params(session, ws, dry_run):
    created = updated = skipped = 0
    for row in _rows(ws):
        station = _s(row.get("station_name")).upper()
        label = _s(row.get("param_label"))
        if not station or not label:
            print(f"  [!] Bo qua thong so thieu station_name/param_label: {row}")
            skipped += 1
            continue
        tag = _s(row.get("tag")) or None
        unit = _s(row.get("param_unit")) or "mm"
        low = _float_or_none(row.get("param_low"))
        high = _float_or_none(row.get("param_high"))
        sort_order = _int_or(row.get("sort_order"), 0)
        active = _bool_or(row.get("active"), True)

        q = session.query(StationParam).filter(
            StationParam.station_name == station,
            StationParam.param_label == label,
        )
        # khóa trùng gồm cả tag (NULL khớp NULL)
        q = q.filter(StationParam.tag == tag) if tag else q.filter(StationParam.tag.is_(None))
        sp = q.first()
        if sp:
            sp.param_unit, sp.param_low, sp.param_high = unit, low, high
            sp.sort_order, sp.active = sort_order, active
            updated += 1
        else:
            session.add(StationParam(station_name=station, tag=tag, param_label=label,
                                     param_unit=unit, param_low=low, param_high=high,
                                     sort_order=sort_order, active=active))
            created += 1
    print(f"Thông số:  +{created} mới, ~{updated} cập nhật, {skipped} bỏ qua")
    return created, updated, skipped


SHEET_HANDLERS = {
    "Trạm": import_stations,
    "QR Alias": import_aliases,
    "Thông số": import_params,
}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("Thiếu đường dẫn file. VD: python tools/import_config.py file.xlsx")
        sys.exit(1)
    path = args[0]
    if not os.path.exists(path):
        print(f"Không tìm thấy file: {path}")
        sys.exit(1)
    if SessionLocal is None:
        print("DATABASE_URL chưa cấu hình — không kết nối được DB.")
        sys.exit(1)

    wb = load_workbook(path, data_only=True)
    print(f"Đọc: {os.path.abspath(path)}{'  [DRY-RUN: không ghi DB]' if dry_run else ''}")

    with SessionLocal() as session:
        for sheet, handler in SHEET_HANDLERS.items():
            if sheet in wb.sheetnames:
                handler(session, wb[sheet], dry_run)
            else:
                print(f"  (không có sheet '{sheet}', bỏ qua)")
        if dry_run:
            session.rollback()
            print("DRY-RUN: đã rollback, không thay đổi DB.")
        else:
            session.commit()
            print("[OK] Da commit vao DB.")


if __name__ == "__main__":
    main()
