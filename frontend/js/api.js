// js/api.js
// Toàn bộ giao tiếp dữ liệu nằm ở đây — các module UI không tự gọi fetch().
//
// Hai chế độ, tự chọn khi chạy:
//   • "server": có backend Node (npm start) → gọi /api/... (có cache dùng chung).
//   • "static": không có backend (GitHub Pages, mở bằng Live Server…) → trình
//     duyệt gọi thẳng Open-Meteo, GDACS, Nominatim qua js/core/service.js —
//     CÙNG mã nguồn mà backend dùng.
import { API_BASE } from "./config.js";

/** Trên GitHub Pages chắc chắn không có backend; thêm ?static vào URL để ép chế độ tĩnh */
const FORCE_STATIC =
  location.hostname.endsWith("github.io") || new URLSearchParams(location.search).has("static");

let modeP = null;
let citiesPrefetch = null;
let servicePromise = null;

/** Thử backend một lần; không có (lỗi mạng, 404, trả HTML) thì dùng chế độ tĩnh */
function mode() {
  if (!modeP) {
    modeP = (async () => {
      if (FORCE_STATIC) return "static";
      try {
        const res = await fetch(API_BASE + "/cities", { signal: AbortSignal.timeout(8000) });
        if (res.ok && (res.headers.get("content-type") || "").includes("json")) {
          citiesPrefetch = await res.json();
          return "server";
        }
      } catch { /* không có backend */ }
      console.info("Luồng Gió: không có backend → chạy chế độ tĩnh (gọi thẳng nguồn dữ liệu).");
      return "static";
    })();
  }
  return modeP;
}

/** Chế độ hiện tại ("server" | "static") */
export const getMode = mode;

const service = () => (servicePromise ||= import("./core/service.js"));

async function get(path, signal) {
  const res = await fetch(API_BASE + path, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Lỗi API: ${res.status}`);
  }
  return res.json();
}

/** Gọi theo chế độ: server → đường dẫn /api; static → hàm trong core/service.js */
async function call(path, staticFn, signal) {
  if ((await mode()) === "server") return get(path, signal);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return staticFn(await service());
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== "" && v != null)).toString();

/**
 * Chế độ tĩnh: ưu tiên dữ liệu bản đồ đã chụp sẵn (GitHub Actions tạo mỗi giờ ở
 * data/live/*.json). Thiếu file hoặc cũ quá `maxAgeH` giờ → tự lấy trực tiếp.
 */
const SNAPSHOT_MAX_AGE_H = 3;

/**
 * Bản chụp bắt đầu từ giờ nó được tạo (có thể đã qua 1–2 giờ) → bỏ các giờ đã qua
 * để mốc đầu timeline đúng là "bây giờ" (giờ Việt Nam).
 */
function trimPastHours(ov) {
  const vnNow = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 13) + ":00";
  const k = ov.times.findIndex((t) => t >= vnNow);
  if (k <= 0) return ov;
  const cut = (o) => Object.fromEntries(Object.entries(o).map(([key, v]) => [key, Array.isArray(v) ? v.slice(k) : v]));
  return { ...ov, times: ov.times.slice(k), locations: ov.locations.map(cut) };
}
async function snapshotOr(name, live) {
  try {
    const res = await fetch(`data/live/${name}.json`, { cache: "no-cache" });
    if (res.ok) {
      const data = await res.json();
      const ageH = (Date.now() - Date.parse(data.snapshotAt)) / 3600e3;
      if (ageH >= 0 && ageH < SNAPSHOT_MAX_AGE_H) return name === "overview" ? trimPastHours(data) : data;
      console.info(`Dữ liệu chụp sẵn ${name} đã cũ (${ageH.toFixed(1)} giờ) → lấy trực tiếp.`);
    }
  } catch { /* chưa có bản chụp */ }
  return live();
}

/** Danh sách địa điểm có sẵn (34 tỉnh/thành + các đô thị, địa danh khác) */
export async function fetchCities() {
  if ((await mode()) === "server" && citiesPrefetch) return citiesPrefetch;
  return call("/cities", (s) => s.cities());
}

/** Dữ liệu 5 ngày rút gọn của mọi địa điểm — để tô màu bản đồ và hạt gió */
export const fetchOverview = () => call("/overview", (s) => snapshotOr("overview", () => s.overview()));

/** Lưới điểm phủ toàn vùng — làm bản đồ màu & hạt gió mịn hơn */
export const fetchGrid = () => call("/grid", (s) => snapshotOr("grid-base", () => s.grid("base")));

/** Lưới phụ chỉ tải khi cần: "marine" (sóng biển) | "air" (bụi mịn PM2.5) */
export const fetchExtra = (set) =>
  call(`/grid?${qs({ set })}`, (s) => snapshotOr(`grid-${set}`, () => s.grid(set)));

/** Dự báo đầy đủ của 1 địa điểm có sẵn */
export const fetchWeather = (id) => call(`/weather/${encodeURIComponent(id)}`, (s) => s.weather(id));

/** Dự báo đầy đủ tại 1 toạ độ bất kỳ */
export function fetchForecastAt(lat, lon, name = "", sub = "") {
  const la = lat.toFixed(4), lo = lon.toFixed(4);
  return call(`/forecast?${qs({ lat: la, lon: lo, name, sub })}`, (s) => s.forecastAt(la, lo, name, sub));
}

/** So sánh dự báo 7 ngày của các mô hình ECMWF, GFS, ICON, JMA */
export function fetchModels(lat, lon) {
  const la = lat.toFixed(4), lo = lon.toFixed(4);
  return call(`/models?${qs({ lat: la, lon: lo })}`, (s) => s.models(la, lo));
}

/** Tên địa danh tại toạ độ (phường/xã, tỉnh) — cho vị trí GPS của người dùng */
export function reverse(lat, lon) {
  const la = lat.toFixed(5), lo = lon.toFixed(5);
  return call(`/reverse?${qs({ lat: la, lon: lo })}`, (s) => s.reverse(la, lo));
}

/** Bão / áp thấp nhiệt đới đang hoạt động & trong `days` ngày qua ở châu Á */
export const fetchStorms = (days = 30) =>
  call(`/storms?${qs({ days })}`, (s) => (days === 30 ? snapshotOr("storms", () => s.storms(days)) : s.storms(days)));

/** Tìm địa điểm/địa danh trong Việt Nam & châu Á */
export const search = (q, signal) => call(`/search?${qs({ q })}`, (s) => s.search(q), signal);
