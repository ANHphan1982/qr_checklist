import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerServiceWorker,
  onUpdateAvailable,
  applyUpdate,
  SKIP_WAITING,
  __reset,
} from "../swUpdate.js";

// --- Fakes ------------------------------------------------------------------

function makeWorker(state = "installing") {
  const handlers = {};
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (ev, fn) => { (handlers[ev] ||= []).push(fn); },
    // test helper: đổi state rồi bắn statechange
    _transition(next) {
      this.state = next;
      (handlers.statechange || []).forEach((fn) => fn());
    },
  };
}

function makeNav({ controller = null, waiting = null, installing = null } = {}) {
  const swHandlers = {};
  const regHandlers = {};
  const registration = {
    waiting,
    installing,
    addEventListener: (ev, fn) => { (regHandlers[ev] ||= []).push(fn); },
    _fire: (ev) => (regHandlers[ev] || []).forEach((fn) => fn()),
  };
  return {
    serviceWorker: {
      controller,
      register: vi.fn(() => Promise.resolve(registration)),
      addEventListener: (ev, fn) => { (swHandlers[ev] ||= []).push(fn); },
      _fire: (ev) => (swHandlers[ev] || []).forEach((fn) => fn()),
    },
    _registration: registration,
  };
}

beforeEach(() => __reset());

// --- Tests ------------------------------------------------------------------

describe("registerServiceWorker", () => {
  it("không có serviceWorker trong navigator → resolve null, không crash", async () => {
    await expect(registerServiceWorker({})).resolves.toBeNull();
  });

  it("register thất bại → nuốt lỗi, resolve null", async () => {
    const nav = makeNav();
    nav.serviceWorker.register = vi.fn(() => Promise.reject(new Error("boom")));
    await expect(registerServiceWorker(nav)).resolves.toBeNull();
  });

  it("cài lần đầu (chưa có controller) → KHÔNG báo có cập nhật", async () => {
    const incoming = makeWorker();
    const nav = makeNav({ controller: null, installing: incoming });
    const seen = [];
    onUpdateAvailable((v) => seen.push(v));

    await registerServiceWorker(nav);
    nav._registration._fire("updatefound");
    incoming._transition("installed");

    expect(seen).toEqual([false]); // chỉ có lần gọi khởi tạo
  });

  it("bản cập nhật (đã có controller) → báo có cập nhật", async () => {
    const incoming = makeWorker();
    const nav = makeNav({ controller: {}, installing: incoming });
    const seen = [];
    onUpdateAvailable((v) => seen.push(v));

    await registerServiceWorker(nav);
    nav._registration._fire("updatefound");
    incoming._transition("installed");

    expect(seen).toEqual([false, true]);
  });

  it("SW đã chờ sẵn từ phiên trước → báo ngay khi register", async () => {
    const waiting = makeWorker("installed");
    const nav = makeNav({ controller: {}, waiting });
    await registerServiceWorker(nav);

    const seen = [];
    onUpdateAvailable((v) => seen.push(v));
    expect(seen).toEqual([true]);
  });
});

describe("applyUpdate", () => {
  it("không có bản chờ → trả false, không postMessage", () => {
    expect(applyUpdate()).toBe(false);
  });

  it("có bản chờ → postMessage SKIP_WAITING", async () => {
    const waiting = makeWorker("installed");
    const nav = makeNav({ controller: {}, waiting });
    await registerServiceWorker(nav);

    expect(applyUpdate()).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING });
  });
});

describe("controllerchange", () => {
  it("user CHƯA bấm cập nhật → không reload (tránh reload lúc cài lần đầu)", async () => {
    const reload = vi.fn();
    const nav = makeNav({ controller: null });
    await registerServiceWorker(nav, reload);

    nav.serviceWorker._fire("controllerchange");
    expect(reload).not.toHaveBeenCalled();
  });

  it("user đã bấm cập nhật → reload đúng 1 lần", async () => {
    const reload = vi.fn();
    const waiting = makeWorker("installed");
    const nav = makeNav({ controller: {}, waiting });
    await registerServiceWorker(nav, reload);

    applyUpdate();
    nav.serviceWorker._fire("controllerchange");
    nav.serviceWorker._fire("controllerchange");

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("onUpdateAvailable", () => {
  it("hàm hủy đăng ký ngăn callback chạy tiếp", async () => {
    const fn = vi.fn();
    const off = onUpdateAvailable(fn);
    off();

    const incoming = makeWorker();
    const nav = makeNav({ controller: {}, installing: incoming });
    await registerServiceWorker(nav);
    nav._registration._fire("updatefound");
    incoming._transition("installed");

    expect(fn).toHaveBeenCalledTimes(1); // chỉ lần khởi tạo trước khi hủy
  });
});
