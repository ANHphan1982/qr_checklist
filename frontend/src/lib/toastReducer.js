// toastReducer — quản lý danh sách toast (thuần, tách khỏi React để test).
// State = mảng { id, type, message }. Provider gắn id + timer auto-dismiss.

export const MAX_TOASTS = 4;

export function toastReducer(state, action) {
  switch (action.type) {
    case "add": {
      const next = [...state, action.toast];
      // Tràn → bỏ cái cũ nhất để không che kín màn hình.
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    }
    case "remove":
      return state.filter((t) => t.id !== action.id);
    case "clear":
      return [];
    default:
      return state;
  }
}
