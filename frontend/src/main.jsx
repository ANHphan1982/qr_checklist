import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { registerServiceWorker } from "./lib/swUpdate";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// SW mới không tự reload tab nữa — App hiện banner "Có bản cập nhật" và chỉ
// kích hoạt khi user đồng ý. Xem lib/swUpdate.js.
window.addEventListener("load", () => {
  registerServiceWorker();
});
