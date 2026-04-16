/**
 * Offline Queue — lưu scan khi không có mạng, đồng bộ khi có mạng trở lại.
 * Dùng localStorage để giữ dữ liệu kể cả khi tắt app.
 */

const QUEUE_KEY = "qr_offline_queue";

/** Lấy toàn bộ queue */
export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Thêm 1 scan vào queue */
export function enqueue(item) {
  const queue = getQueue();
  queue.push({ ...item, queued_at: new Date().toISOString() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Xóa toàn bộ queue sau khi đồng bộ xong */
function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

/** Xóa 1 item theo index */
function removeItem(index) {
  const queue = getQueue();
  queue.splice(index, 1);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Flush queue — gửi tất cả scan đang chờ lên server.
 * @param {Function} postFn — hàm gọi API (location, deviceId, gpsData, scannedAt)
 * @returns {{ success: number, failed: number }}
 */
export async function flushQueue(postFn) {
  const queue = getQueue();
  if (queue.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  // Duyệt ngược để splice không làm lệch index
  for (let i = queue.length - 1; i >= 0; i--) {
    const item = queue[i];
    try {
      await postFn(item);
      removeItem(i);
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
}

/** Số lượng scan đang chờ */
export function queueSize() {
  return getQueue().length;
}
