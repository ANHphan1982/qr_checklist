/**
 * Payload cho PUT /api/admin/stations/<editing>.
 * Gửi kèm `name` (trim + UPPER) khi người dùng đổi tên trạm; bỏ qua nếu rỗng
 * hoặc không đổi so với tên đang sửa — backend chỉ rename khi có field name.
 */
export function buildStationUpdatePayload(form, editingName) {
  const payload = { lat: form.lat, lng: form.lng, radius: form.radius };
  const newName = (form.name || "").trim().toUpperCase();
  if (newName && newName !== editingName) payload.name = newName;
  return payload;
}
