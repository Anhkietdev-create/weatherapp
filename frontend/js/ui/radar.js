// js/ui/radar.js
// Radar mưa trực tiếp (dữ liệu quan trắc ~2 giờ qua, 10 phút/khung) từ
// RainViewer — miễn phí, không cần API key. Chạy hoạt ảnh lặp qua các khung.
// Lưu ý: độ phủ radar phụ thuộc từng quốc gia; nơi không có radar sẽ trống.

const META_URL = "https://api.rainviewer.com/public/weather-maps.json";
const FRAME_MS = 700;
const MAX_FRAMES = 6;  // ~1 giờ gần nhất — ít khung hơn để không bị RainViewer giới hạn (429)
const HOLD_LAST_MS = 1600;
const META_TTL = 5 * 60 * 1000;

let map = null;
let badge = null;
let frames = [];
let tileLayers = [];
let idx = 0;
let timer = null;
let enabled = false;
let fetchedAt = 0;
let host = "";

function fmtTime(unix) {
  return new Date(unix * 1000).toLocaleTimeString("vi-VN", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
  });
}

function setBadge(text, error = false) {
  if (!badge) return;
  badge.hidden = !text;
  badge.classList.toggle("error", error);
  badge.querySelector(".rb-text").textContent = text || "";
}

function clearLayers() {
  clearTimeout(timer);
  tileLayers.forEach((l) => l && l.remove());
  tileLayers = [];
}

/** Tạo lớp tile của một khung khi cần (tải dần, không tải cùng lúc mọi khung) */
function layerFor(i) {
  if (!tileLayers[i]) {
    tileLayers[i] = L.tileLayer(`${host}${frames[i].path}/256/{z}/{x}/{y}/2/1_1.png`, {
      pane: "radar",
      opacity: 0,
      maxNativeZoom: 7,  // RainViewer chỉ cung cấp tới zoom 7, phóng to hơn thì kéo giãn
      maxZoom: 18,
      updateWhenZooming: false,
      keepBuffer: 0,
      attribution: 'Radar &copy; <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>',
    }).addTo(map);
  }
  return tileLayers[i];
}

function show(i) {
  layerFor(i);
  tileLayers.forEach((l, k) => l && l.setOpacity(k === i ? 0.78 : 0));
  const f = frames[i];
  if (f) {
    const ago = Math.round((Date.now() / 1000 - f.time) / 60);
    setBadge(`Radar ${fmtTime(f.time)} · ${ago <= 10 ? "mới nhất" : ago + " phút trước"}`);
  }
}

function tick() {
  if (!enabled || !frames.length) return;
  idx = (idx + 1) % frames.length;
  show(idx);
  timer = setTimeout(tick, idx === frames.length - 1 ? HOLD_LAST_MS : FRAME_MS);
}

async function loadFrames() {
  const res = await fetch(META_URL);
  if (!res.ok) throw new Error(`RainViewer ${res.status}`);
  const meta = await res.json();
  host = meta.host;
  frames = (meta.radar?.past || []).slice(-MAX_FRAMES);
  fetchedAt = Date.now();
}


/** @param {L.Map} m @param {HTMLElement} badgeEl ô hiển thị giờ của khung radar */
export function initRadar(m, badgeEl) {
  map = m;
  badge = badgeEl;
  const pane = map.createPane("radar");
  pane.style.zIndex = 455;
  pane.style.pointerEvents = "none";
}

export async function setRadar(on) {
  enabled = on;
  if (!on) {
    clearLayers();
    setBadge("");
    return;
  }
  setBadge("Đang tải radar…");
  try {
    if (!frames.length || Date.now() - fetchedAt > META_TTL) await loadFrames();
    if (!enabled) return;
    if (!frames.length) return setBadge("Không có dữ liệu radar", true);
    clearLayers();
    tileLayers = new Array(frames.length).fill(null);
    idx = frames.length - 1;
    show(idx);
    timer = setTimeout(tick, HOLD_LAST_MS);
  } catch (err) {
    console.warn("Radar lỗi:", err.message);
    setBadge("Không tải được radar", true);
  }
}

/** Làm mới danh sách khung (gọi định kỳ) */
export async function refreshRadar() {
  if (!enabled) return;
  fetchedAt = 0;
  await setRadar(true);
}
