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

/**
 * Thêm 1 scan vào queue.
 * @returns {string} queued_at — dùng để link với pendingParams
 */
export function enqueue(item) {
  const queuedAt = new Date().toISOString();
  const queue = getQueue();
  queue.push({ ...item, queued_at: queuedAt });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return queuedAt;
}

/** Xóa toàn bộ queue */
export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

/** Kiểm tra queue còn item với queued_at đó không */
export function hasQueueItem(queuedAt) {
  return getQueue().some((item) => item.queued_at === queuedAt);
}

/** Cập nhật item cụ thể theo queued_at với các field bổ sung */
export function updateItemByQueuedAt(queuedAt, patch) {
  const queue = getQueue();
  const idx = queue.findIndex((item) => item.queued_at === queuedAt);
  if (idx === -1) return;
  queue[idx] = { ...queue[idx], ...patch };
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Flush queue — gửi tất cả scan đang chờ lên server theo thứ tự chronological.
 * Duyệt xuôi để scan cũ nhất được gửi trước → nhận ID DB nhỏ hơn → đúng thứ tự.
 * @param {Function} postFn — hàm gọi API nhận item
 * @returns {{ success: number, failed: number }}
 */
export async function flushQueue(postFn) {
  const queue = getQueue();
  if (queue.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  const failed_items = [];

  for (const item of queue) {
    try {
      await postFn(item);
      success++;
    } catch {
      failed_items.push(item);
    }
  }

  localStorage.setItem(QUEUE_KEY, JSON.stringify(failed_items));
  return { success, failed: failed_items.length };
}

/** Số lượng scan đang chờ */
export function queueSize() {
  return getQueue().length;
}

/** Cập nhật item cuối trong queue với các field bổ sung (dùng cho offline params in-session) */
export function updateLastItem(patch) {
  const queue = getQueue();
  if (queue.length === 0) return;
  queue[queue.length - 1] = { ...queue[queue.length - 1], ...patch };
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}
