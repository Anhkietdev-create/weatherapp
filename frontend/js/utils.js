// js/utils.js
// Các hàm tiện ích thuần (không đụng DOM): định dạng, thời gian, thang màu.
import { state } from "./state.js";
import { dayNames, layerMeta, WIND_UNITS } from "./config.js";

// ----------------------------- Nhiệt độ -----------------------------------
export function toUnit(celsius) {
  return state.unit === "C" ? celsius : (celsius * 9) / 5 + 32;
}

/** 27.4 → "27°" (hoặc "81°" khi đang dùng °F) */
export function fmtDeg(celsius) {
  return celsius == null ? "–" : Math.round(toUnit(celsius)) + "°";
}

export function fmtTemp(celsius) {
  return fmtDeg(celsius) + state.unit;
}

// ----------------------------- Thời gian ----------------------------------
// Open-Meteo trả về giờ địa phương Việt Nam dạng "2026-11-21T19:00" (không có
// múi giờ). Ta tự tách chuỗi để hiển thị đúng giờ VN bất kể máy người dùng
// đang ở múi giờ nào.
export function parseLocal(s) {
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  const h = s.length > 10 ? +s.slice(11, 13) : 0;
  const min = s.length > 10 ? +s.slice(14, 16) : 0;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, h, min, dow };
}

const pad = (n) => String(n).padStart(2, "0");

export const fmtHour = (s) => pad(parseLocal(s).h) + ":00";
export const fmtClock = (s) => { const t = parseLocal(s); return pad(t.h) + ":" + pad(t.min); };
export const fmtDate = (s) => { const t = parseLocal(s); return `${t.d}/${t.m}`; };
export const fmtDow = (s) => dayNames[parseLocal(s).dow];

// ----------------------------- Gió ----------------------------------------
const DIRS = ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"];
/** Hướng gió (độ, hướng gió THỔI TỪ) → tên hướng tiếng Việt */
export function windDirName(deg) {
  return DIRS[Math.round(((deg % 360) / 45)) % 8];
}

/** Mũi tên chỉ hướng gió thổi TỚI (xoay 180° so với hướng gió thổi từ) */
export function windArrow(deg, size = 12) {
  return `<span class="arrow" style="transform:rotate(${(deg + 180) % 360}deg);font-size:${size}px">↑</span>`;
}

/** km/h → đơn vị gió đang chọn */
export function windConv(kmh) {
  return kmh * WIND_UNITS[state.windUnit].f;
}
export const windUnitLabel = () => WIND_UNITS[state.windUnit].label;

/** 18.3 km/h → "18" (km/h) · "5.1" (m/s) · "10" (kt) */
export function fmtWindNum(kmh) {
  if (kmh == null || Number.isNaN(kmh)) return "–";
  const v = windConv(kmh);
  return state.windUnit === "ms" && v < 10 ? v.toFixed(1) : String(Math.round(v));
}
export function fmtWind(kmh) {
  return `${fmtWindNum(kmh)} ${windUnitLabel()}`;
}

/** Hướng (độ, khí tượng = thổi TỪ) từ vector chuyển động (u: đông, v: bắc) */
export function dirFromUV(u, v) {
  return ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
}

/** Cấp gió Beaufort */
export function beaufort(kmh) {
  const lim = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  let i = 0;
  while (i < lim.length && kmh >= lim[i]) i++;
  return i;
}

// ----------------------------- Chỉ số -------------------------------------
export function aqiInfo(aqi) {
  if (aqi == null) return { label: "Không có dữ liệu", color: "#7d93ab" };
  if (aqi <= 50) return { label: "Tốt", color: "#4fd58b" };
  if (aqi <= 100) return { label: "Trung bình", color: "#ffd166" };
  if (aqi <= 150) return { label: "Kém (nhóm nhạy cảm)", color: "#ff9d4d" };
  if (aqi <= 200) return { label: "Xấu", color: "#ff5a4d" };
  if (aqi <= 300) return { label: "Rất xấu", color: "#b04dff" };
  return { label: "Nguy hại", color: "#8b1a3a" };
}

export function uvInfo(uv) {
  if (uv < 3) return "Thấp";
  if (uv < 6) return "Trung bình";
  if (uv < 8) return "Cao";
  if (uv < 11) return "Rất cao";
  return "Cực độ";
}

// ----------------------------- Thang màu ----------------------------------
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Chuẩn bị thang màu một lần để tra cứu nhanh: [{v, r,g,b,a}] */
export function compileStops(stops, defaultAlpha = 0.6) {
  return stops.map(([v, hex, a]) => {
    const [r, g, b] = hexToRgb(hex);
    return { v, r, g, b, a: a ?? defaultAlpha };
  });
}

/** Nội suy màu theo giá trị → [r,g,b,a(0..1)] */
export function colorAt(compiled, v) {
  if (v <= compiled[0].v) return compiled[0];
  for (let i = 1; i < compiled.length; i++) {
    const b = compiled[i];
    if (v <= b.v) {
      const a = compiled[i - 1];
      const t = (v - a.v) / (b.v - a.v);
      return {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
        a: a.a + (b.a - a.a) * t,
      };
    }
  }
  return compiled[compiled.length - 1];
}

/**
 * Thang màu → CSS linear-gradient cho chú giải. Các mốc được rải ĐỀU (chú giải
 * phi tuyến giống Windy) để thang có mốc dày ở vùng giá trị thấp vẫn dễ đọc.
 */
export function gradientCss(stops) {
  const n = stops.length - 1;
  return "linear-gradient(90deg," +
    stops.map(([, hex], i) => `${hex} ${((i / n) * 100).toFixed(1)}%`).join(",") + ")";
}

// ----------------------------- Giá trị theo lớp ---------------------------
/** Đơn vị hiển thị của một lớp (đã tính °C/°F và đơn vị gió) */
export function layerUnit(layer) {
  const m = layerMeta[layer];
  if (m.kind === "temp") return "°" + state.unit;
  if (m.kind === "wind") return windUnitLabel();
  return m.unit;
}

/** Giá trị số của lớp → chuỗi (đã đổi đơn vị, làm tròn hợp lý), không kèm đơn vị */
export function fmtLayerNum(layer, v) {
  if (v == null || Number.isNaN(v)) return "–";
  const m = layerMeta[layer];
  if (m.kind === "temp") return String(Math.round(toUnit(v)));
  if (m.kind === "wind") return fmtWindNum(v);
  if (layer === "waves") return v.toFixed(1);
  if (layer === "rainacc") return v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v));
  if (layer === "rain") return v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v));
  return String(Math.round(v));
}

/** Giá trị kèm đơn vị: "27°C", "18 km/h", "1.5 m", "45 µg/m³" */
export function fmtLayer(layer, v) {
  const m = layerMeta[layer];
  const num = fmtLayerNum(layer, v);
  if (m.kind === "temp") return `${num}°${state.unit}`;
  return `${num} ${layerUnit(layer)}`;
}

/** Tổng n phần tử của mảng bắt đầu từ start (bỏ qua null) — dùng cho mưa tích luỹ */
export function sumRange(arr, start, n) {
  if (!arr || start < 0) return null;
  let s = 0;
  for (let i = start; i < Math.min(arr.length, start + n); i++) s += arr[i] ?? 0;
  return Math.round(s * 10) / 10;
}

/** Khoảng cách (km) giữa hai toạ độ */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Vị trí của mốc giờ timeline hiện tại trong một lưới (lưới có thể lấy ở giờ khác) */
export function gridIndex(grid, time) {
  if (!grid._ix) grid._ix = new Map(grid.times.map((t, i) => [t, i]));
  const i = grid._ix.get(time);
  if (i != null) return i;
  // Lưới được lấy muộn hơn timeline vài giờ (cache khác nhau) → dùng giờ đầu
  // tiên của lưới thay vì bỏ trống bản đồ. Chuỗi ISO so sánh được trực tiếp.
  if (time && grid.times.length && time < grid.times[0]) {
    const gap = (Date.parse(grid.times[0] + ":00Z") - Date.parse(time + ":00Z")) / 3600e3;
    if (gap <= 3) return 0;
  }
  return -1;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
