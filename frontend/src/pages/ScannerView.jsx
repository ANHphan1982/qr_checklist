// ScannerView — state "scanning" của ScanPage, mobile-first
// Tách riêng để dễ gắn vào ScanPage.jsx (đã viết trước).
// Dùng mẫu Phương án B: viewfinder full, action sheet ở đáy.
//
// Nối vào logic thật:
//  • Thay <video ref={videoRef}/> bằng stream getUserMedia của bạn
//  • Thay torch toggle + switch camera bằng MediaStreamTrack constraints
//  • onDetected(code) gọi khi QR decoded (dùng @zxing/browser, jsqr, barcodedetector…)

import { useEffect, useRef, useState } from "react";

function XIcon({ className = "w-6 h-6" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function FlashIcon({ className = "w-6 h-6", on = false }) {
  return (
    <svg viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} className={className}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
}
function FlipIcon({ className = "w-6 h-6" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 7h13a3 3 0 0 1 3 3v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="m6 4-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 17H8a3 3 0 0 1-3-3v-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="m18 20 3-3-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function KeyboardIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Mini stepper tái sử dụng trong sheet
// ---------------------------------------------------------------------------
function Stepper({ current = 1, total = 6 }) {
  return (
    <div className="flex items-center justify-center">
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center">
            <div className={[
              "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold",
              active ? "bg-blue-600 text-white" : done ? "bg-blue-400 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-400 border border-slate-200 dark:border-slate-600",
            ].join(" ")}>
              {done ? "✓" : n}
            </div>
            {n < total && (
              <div className={["w-3.5 h-0.5", done ? "bg-blue-400" : "bg-slate-200 dark:bg-slate-700"].join(" ")}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScannerView
// ---------------------------------------------------------------------------
export default function ScannerView({
  currentStation = 1,
  totalStations = 6,
  onClose,
  onDetected,
  onManualInput,
}) {
  const videoRef = useRef(null);
  const [torch, setTorch] = useState(false);
  const [facing, setFacing] = useState("environment");
  const [hint, setHint] = useState("Đang khởi động camera…");

  // TODO: Khởi động getUserMedia ở đây. Hiện đang để demo UI.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setHint("Căn mã QR vào khung");
      } catch (e) {
        setHint("Không truy cập được camera — kiểm tra quyền");
      }
    }
    start();
    return () => {
      cancelled = true;
      const v = videoRef.current;
      if (v && v.srcObject) {
        v.srcObject.getTracks().forEach((t) => t.stop());
        v.srcObject = null;
      }
    };
  }, [facing]);

  // TODO: gọi onDetected(code) khi decoder ra kết quả
  // Ví dụ dùng BarcodeDetector:
  //   const detector = new BarcodeDetector({ formats: ["qr_code"] });
  //   const codes = await detector.detect(videoRef.current);
  //   if (codes[0]) onDetected(codes[0].rawValue);

  const toggleTorch = async () => {
    // TODO: áp dụng thật lên track
    // const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
    // await track?.applyConstraints({ advanced: [{ torch: !torch }] });
    setTorch((t) => !t);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      {/* Video layer */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Dim overlay */}
      <div className="absolute inset-0 bg-black/30"/>

      {/* Top overlay */}
      <div
        className="relative z-10 flex items-center justify-between px-4 pt-4"
        style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}
      >
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="w-13 h-13 w-[52px] h-[52px] rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center active:bg-black/70 transition-colors"
        >
          <XIcon className="w-6 h-6"/>
        </button>

        <div className="px-4 py-2.5 rounded-full bg-black/50 backdrop-blur text-[14px] font-semibold">
          Trạm {currentStation} / {totalStations}
        </div>

        <button
          onClick={toggleTorch}
          aria-label="Bật/tắt đèn pin"
          className={[
            "w-[52px] h-[52px] rounded-full backdrop-blur text-white flex items-center justify-center transition-colors",
            torch ? "bg-amber-400 text-slate-900" : "bg-black/50 active:bg-black/70",
          ].join(" ")}
        >
          <FlashIcon className="w-6 h-6" on={torch}/>
        </button>
      </div>

      {/* Viewfinder frame */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-10">
        <div className="relative w-full max-w-[280px] aspect-square">
          {[["tl", 0, 0], ["tr", 1, 0], ["bl", 0, 1], ["br", 1, 1]].map(([id, x, y]) => (
            <div
              key={id}
              className="absolute w-10 h-10"
              style={{
                [x ? "right" : "left"]: 0,
                [y ? "bottom" : "top"]: 0,
                borderTop: y ? "none" : "3px solid rgb(96 165 250)",
                borderBottom: y ? "3px solid rgb(96 165 250)" : "none",
                borderLeft: x ? "none" : "3px solid rgb(96 165 250)",
                borderRight: x ? "3px solid rgb(96 165 250)" : "none",
                borderTopLeftRadius: !x && !y ? 14 : 0,
                borderTopRightRadius: x && !y ? 14 : 0,
                borderBottomLeftRadius: !x && y ? 14 : 0,
                borderBottomRightRadius: x && y ? 14 : 0,
              }}
            />
          ))}
          {/* scan line */}
          <div
            className="absolute left-2 right-2 h-0.5 animate-scan"
            style={{
              background: "linear-gradient(90deg, transparent, rgb(96 165 250), transparent)",
              boxShadow: "0 0 20px rgb(96 165 250)",
            }}
          />
        </div>
        <style>{`
          @keyframes scan { 0%,100% { top: 12%; } 50% { top: 88%; } }
          .animate-scan { animation: scan 2.4s ease-in-out infinite; }
        `}</style>
      </div>

      {/* Hint */}
      <div className="relative z-10 text-center px-6 pb-5">
        <div className="text-[17px] font-semibold">{hint}</div>
        <div className="text-[14px] opacity-70 mt-1">Tự động nhận diện khi đủ nét</div>
      </div>

      {/* Bottom sheet */}
      <div
        className="relative z-10 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-t-[24px] px-5 pt-3 pb-5 flex flex-col gap-4"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700 self-center"/>
        <Stepper current={currentStation} total={totalStations}/>
        <div className="flex gap-3">
          <button
            onClick={() => setFacing((f) => f === "environment" ? "user" : "environment")}
            className="flex-1 min-h-[56px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-[15px] flex items-center justify-center gap-2 active:bg-slate-200 dark:active:bg-slate-700 transition-colors"
          >
            <FlipIcon className="w-5 h-5"/> Đổi camera
          </button>
          <button
            onClick={onManualInput}
            className="flex-[2] min-h-[56px] rounded-2xl bg-blue-600 text-white font-semibold text-[16px] flex items-center justify-center gap-2 active:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30"
          >
            <KeyboardIcon className="w-5 h-5"/> Nhập mã tay
          </button>
        </div>
      </div>
    </div>
  );
}
