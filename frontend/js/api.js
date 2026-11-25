// js/api.js
// Toàn bộ giao tiếp với backend nằm ở đây — các module UI không tự gọi fetch().
import { API_BASE } from "./config.js";

async function get(path, signal) {
  const res = await fetch(API_BASE + path, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Lỗi API: ${res.status}`);
  }
  return res.json();
}

/** Danh sách địa điểm có sẵn (34 tỉnh/thành + các đô thị, địa danh khác) */
export const fetchCities = () => get("/cities");

/** Dữ liệu 5 ngày rút gọn của mọi địa điểm — để tô màu bản đồ và hạt gió */
export const fetchOverview = () => get("/overview");

/** Lưới điểm phủ toàn vùng — làm bản đồ màu & hạt gió mịn hơn */
export const fetchGrid = () => get("/grid");

/** Lưới phụ chỉ tải khi cần: "marine" (sóng biển) | "air" (bụi mịn PM2.5) */
export const fetchExtra = (set) => get(`/grid?set=${encodeURIComponent(set)}`);

/** Dự báo đầy đủ của 1 địa điểm có sẵn */
export const fetchWeather = (id) => get(`/weather/${encodeURIComponent(id)}`);

/** Dự báo đầy đủ tại 1 toạ độ bất kỳ */
export function fetchForecastAt(lat, lon, name = "", sub = "") {
  const qs = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) });
  if (name) qs.set("name", name);
  if (sub) qs.set("sub", sub);
  return get(`/forecast?${qs}`);
}

/** So sánh dự báo 7 ngày của các mô hình ECMWF, GFS, ICON, JMA */
export function fetchModels(lat, lon) {
  const qs = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) });
  return get(`/models?${qs}`);
}

/** Bão / áp thấp nhiệt đới đang hoạt động & trong `days` ngày qua ở châu Á */
export const fetchStorms = (days = 30) => get(`/storms?days=${days}`);

/** Tìm địa điểm/địa danh trong Việt Nam & châu Á */
export const search = (q, signal) => get(`/search?q=${encodeURIComponent(q)}`, signal);
