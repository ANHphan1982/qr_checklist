"""
Tạo QR PNG cho từng trạm trong stations.json.
Mỗi QR chứa tên trạm dạng plaintext (VD: "Cổng A").
Output: output/<tên_trạm>.png
"""
import json
import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
STATIONS_FILE = os.path.join(os.path.dirname(__file__), "stations.json")


def load_stations() -> list[str]:
    with open(STATIONS_FILE, encoding="utf-8") as f:
        return json.load(f)


def make_qr(station: str) -> None:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(station)
    qr.make(fit=True)

    img: Image.Image = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    w, h = img.size

    # Thêm label tên trạm bên dưới QR
    new_img = Image.new("RGB", (w, h + 60), "white")
    new_img.paste(img, (0, 0))
    draw = ImageDraw.Draw(new_img)

    try:
        font = ImageFont.truetype("arial.ttf", 22)
    except OSError:
        font = ImageFont.load_default()

    draw.text((w // 2, h + 30), station, fill="black", anchor="mm", font=font)

    filename = station.replace(" ", "_").replace("/", "_")
    out_path = os.path.join(OUTPUT_DIR, f"{filename}.png")
    new_img.save(out_path)
    print(f"  ✅ {station}  →  {out_path}")


def main() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    stations = load_stations()
    print(f"Tạo QR cho {len(stations)} trạm...\n")
    for s in stations:
        make_qr(s)
    print(f"\nHoàn thành! Các file PNG nằm trong: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
