// onboarding — cờ "đã xem hướng dẫn lần đầu" (localStorage) để HomePage hiện
// thẻ mẹo dùng app ở lần mở đầu tiên, sau đó ẩn vĩnh viễn.

const KEY = "qr_onboarded_v1";

/** Có nên hiện hướng dẫn lần đầu không (chưa từng đánh dấu đã xem). */
export function shouldShowOnboarding() {
  try {
    return localStorage.getItem(KEY) !== "1";
  } catch (_) {
    return false; // lỗi storage → không làm phiền
  }
}

/** Đánh dấu đã xem hướng dẫn — không hiện lại. */
export function markOnboardingSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch (_) {
    /* bỏ qua */
  }
}
