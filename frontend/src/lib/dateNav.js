/**
 * dateNav — chuyển ngày nhanh cho HistoryPage.
 * Thao tác trên chuỗi "YYYY-MM-DD" qua UTC để không lệch timezone.
 */

/** Cộng delta ngày vào chuỗi "YYYY-MM-DD". */
export function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Còn đi tới được không — không cho xem ngày tương lai. */
export function canGoNext(dateStr, todayStr) {
  return dateStr < todayStr; // so sánh chuỗi ISO an toàn về thứ tự
}
