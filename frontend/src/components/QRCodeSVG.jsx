import { useMemo } from "react";
import { buildQrMatrix } from "../lib/qrMatrix";

const QUIET_ZONE = 4; // modules viền trắng theo chuẩn QR

/**
 * QRCodeSVG — render QR hoàn toàn local bằng SVG.
 * Thay api.qrserver.com: không gửi token ra bên thứ 3, hoạt động cả khi
 * WiFi nội bộ không có internet (đúng môi trường màn hình tại trạm).
 */
export default function QRCodeSVG({ content, size = 280, className = "" }) {
  const path = useMemo(() => {
    const matrix = buildQrMatrix(content);
    let d = "";
    for (let r = 0; r < matrix.length; r += 1) {
      for (let c = 0; c < matrix.length; c += 1) {
        if (matrix[r][c]) {
          d += `M${c + QUIET_ZONE},${r + QUIET_ZONE}h1v1h-1z`;
        }
      }
    }
    return { d, total: matrix.length + QUIET_ZONE * 2 };
  }, [content]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${path.total} ${path.total}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR Code"
      className={className}
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={path.d} fill="#000000" />
    </svg>
  );
}
