/**
 * TDD — lib/offlineQueue.js
 *
 * Bao gồm:
 * 1. enqueue → trả về queued_at (cần để savePendingParams link đúng item)
 * 2. hasQueueItem(queuedAt) → kiểm tra item còn trong queue không
 * 3. updateItemByQueuedAt(queuedAt, patch) → update item cụ thể (thay vì chỉ item cuối)
 * 4. flushQueue → duyệt XUÔI (chronological order) để ID DB = thứ tự scan
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enqueue,
  hasQueueItem,
  updateItemByQueuedAt,
  flushQueue,
  getQueue,
  clearQueue,
  queueSize,
} from "../offlineQueue.js";

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// enqueue → trả về queued_at
// ---------------------------------------------------------------------------

describe("enqueue — trả về queued_at", () => {
  it("enqueue trả về chuỗi ISO timestamp (queued_at)", () => {
    const queuedAt = enqueue({ location: "PUMP_STATION_7", device_id: "abc" });
    expect(typeof queuedAt).toBe("string");
    expect(() => new Date(queuedAt)).not.toThrow();
    // phải là ISO string hợp lệ
    expect(new Date(queuedAt).toISOString()).toBe(queuedAt);
  });

  it("queued_at trả về trùng với queued_at được lưu trong queue item", () => {
    const queuedAt = enqueue({ location: "TK-5203A" });
    const queue = getQueue();
    expect(queue[0].queued_at).toBe(queuedAt);
  });

  it("nhiều lần enqueue → queued_at mỗi lần khác nhau (10ms delay)", async () => {
    const a = enqueue({ location: "A" });
    await new Promise((r) => setTimeout(r, 10)); // 10ms đủ để Date.now() tăng trong mọi env
    const b = enqueue({ location: "B" });
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// hasQueueItem
// ---------------------------------------------------------------------------

describe("hasQueueItem — kiểm tra item còn trong queue", () => {
  it("trả về true nếu item với queued_at đó còn trong queue", () => {
    const queuedAt = enqueue({ location: "PUMP_STATION_7" });
    expect(hasQueueItem(queuedAt)).toBe(true);
  });

  it("trả về false nếu queue rỗng", () => {
    expect(hasQueueItem("2026-05-14T03:15:18.000Z")).toBe(false);
  });

  it("trả về false sau khi xóa queue", () => {
    const queuedAt = enqueue({ location: "PUMP_STATION_7" });
    clearQueue();
    expect(hasQueueItem(queuedAt)).toBe(false);
  });

  it("trả về false nếu queued_at không khớp bất kỳ item nào", () => {
    enqueue({ location: "PUMP_STATION_7" });
    expect(hasQueueItem("2000-01-01T00:00:00.000Z")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateItemByQueuedAt
// ---------------------------------------------------------------------------

describe("updateItemByQueuedAt — update item cụ thể", () => {
  it("update đúng item theo queued_at, không ảnh hưởng item khác", async () => {
    const qa1 = enqueue({ location: "PUMP_STATION_7", device_id: "d1" });
    await new Promise((r) => setTimeout(r, 10));
    const qa2 = enqueue({ location: "TK-5203A", device_id: "d2" });

    updateItemByQueuedAt(qa1, { param_value: 3.2, param_unit: "kg/cm2g" });

    const queue = getQueue();
    const item1 = queue.find((i) => i.queued_at === qa1);
    const item2 = queue.find((i) => i.queued_at === qa2);

    expect(item1.param_value).toBe(3.2);
    expect(item1.param_unit).toBe("kg/cm2g");
    expect(item2.param_value).toBeUndefined(); // item khác không bị ảnh hưởng
  });

  it("patch merge vào item hiện tại (không xóa fields cũ)", () => {
    const qa = enqueue({ location: "PUMP_STATION_7", device_id: "abc" });
    updateItemByQueuedAt(qa, { param_value: 5.1 });

    const item = getQueue().find((i) => i.queued_at === qa);
    expect(item.location).toBe("PUMP_STATION_7"); // field cũ còn nguyên
    expect(item.device_id).toBe("abc");
    expect(item.param_value).toBe(5.1); // field mới được thêm
  });

  it("queued_at không tìm thấy → không throw, queue không thay đổi", () => {
    enqueue({ location: "PUMP_STATION_7" });
    expect(() =>
      updateItemByQueuedAt("nonexistent-ts", { param_value: 1 })
    ).not.toThrow();
    expect(queueSize()).toBe(1); // item cũ vẫn còn
  });
});

// ---------------------------------------------------------------------------
// flushQueue — duyệt XUÔI (fix thứ tự ID DB)
// ---------------------------------------------------------------------------

describe("flushQueue — duyệt xuôi (chronological order)", () => {
  it("scan đầu tiên được gửi trước → nhận ID DB thấp hơn", async () => {
    const calls = [];
    const mockPost = vi.fn(async (item) => {
      calls.push(item.location);
    });

    enqueue({ location: "PUMP_STATION_7" }); // scan đầu tiên
    await new Promise((r) => setTimeout(r, 10));
    enqueue({ location: "TK-5203A" });         // scan thứ hai

    await flushQueue(mockPost);

    expect(calls[0]).toBe("PUMP_STATION_7"); // đầu tiên gửi đầu tiên
    expect(calls[1]).toBe("TK-5203A");
  });

  it("flush xóa các item thành công, giữ lại item thất bại", async () => {
    enqueue({ location: "PUMP_STATION_7" });
    await new Promise((r) => setTimeout(r, 10));
    enqueue({ location: "TK-5203A" });

    let call = 0;
    const mockPost = vi.fn(async (item) => {
      call++;
      if (call === 1) throw new Error("server error"); // item đầu thất bại
    });

    const { success, failed } = await flushQueue(mockPost);

    expect(success).toBe(1);
    expect(failed).toBe(1);
    expect(queueSize()).toBe(1); // item thất bại còn lại
    expect(getQueue()[0].location).toBe("PUMP_STATION_7"); // item đầu thất bại → còn
  });

  it("tất cả thành công → queue rỗng", async () => {
    enqueue({ location: "A" });
    enqueue({ location: "B" });

    await flushQueue(vi.fn(async () => {}));

    expect(queueSize()).toBe(0);
  });

  it("tất cả thất bại → queue vẫn còn đủ items", async () => {
    enqueue({ location: "A" });
    enqueue({ location: "B" });

    const { success, failed } = await flushQueue(
      vi.fn(async () => { throw new Error("err"); })
    );

    expect(success).toBe(0);
    expect(failed).toBe(2);
    expect(queueSize()).toBe(2);
  });

  it("queue rỗng → trả về { success: 0, failed: 0 }, không crash", async () => {
    const result = await flushQueue(vi.fn());
    expect(result).toEqual({ success: 0, failed: 0 });
  });
});

// ---------------------------------------------------------------------------
// Regression: thứ tự ID (ID 487 < 488 nhưng timestamp 487 sớm hơn)
// Root cause: code cũ duyệt ngược → TK-5203A (scan sau) được gửi trước → ID thấp hơn
// ---------------------------------------------------------------------------

describe("REGRESSION: thứ tự flush đúng với thứ tự scan (IDs 487/486)", () => {
  it("2 scan offline → flush theo thứ tự scan → ID DB theo đúng thứ tự thời gian", async () => {
    // Simulate: scan lúc 10:15 rồi 10:24, cùng device
    enqueue({ location: "052-PG-071", scanned_at: "2026-05-14T03:15:18Z" }); // PUMP_STATION_7
    await new Promise((r) => setTimeout(r, 10));
    enqueue({ location: "052-LI-010B", scanned_at: "2026-05-14T03:24:37Z" }); // TK-5203A

    const order = [];
    await flushQueue(vi.fn(async (item) => { order.push(item.scanned_at); }));

    // PUMP_STATION_7 (10:15) phải được gửi TRƯỚC TK-5203A (10:24)
    // → nhận ID DB nhỏ hơn → ID DB tăng dần theo thứ tự scan
    expect(order[0]).toBe("2026-05-14T03:15:18Z");
    expect(order[1]).toBe("2026-05-14T03:24:37Z");
  });
});
