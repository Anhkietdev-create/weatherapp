// js/state.js
// Một object trạng thái đơn giản, dùng chung cho toàn app + lưu cài đặt và
// địa điểm yêu thích vào localStorage.
import { layerMeta, BASEMAPS, WIND_UNITS, ACC_PERIODS } from "./config.js";

const SETTINGS_KEY = "lg-settings";
const FAV_KEY = "lg-favorites";

const DEFAULTS = {
  unit: "C",          // "C" | "F"
  windUnit: "kmh",    // "kmh" | "ms" | "kt"
  layer: "wind",      // khoá trong layerMeta
  basemap: "dark",    // khoá trong BASEMAPS
  labels: true,       // lớp ranh giới + tên địa danh vẽ đè lên màu
  particles: true,    // hạt chuyển động
  iso: "auto",        // đường đẳng trị: auto | pressure | temp | none
  radar: false,       // lớp radar mưa trực tiếp (RainViewer)
  accHours: 24,       // khoảng cộng dồn của lớp mưa tích luỹ: 24 | 72 | 120
  storms: true,       // hiện bão/áp thấp nhiệt đới đang hoạt động
};
const SETTING_KEYS = Object.keys(DEFAULTS);

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bỏ qua */ }
}

function loadSettings() {
  const stored = readJSON(SETTINGS_KEY, null);
  const s = { ...DEFAULTS, ...(stored || {}) };
  // Bản cũ chỉ lưu đơn vị nhiệt độ ở khoá "unit"
  if (!stored) {
    try { if (localStorage.getItem("unit") === "F") s.unit = "F"; } catch { /* bỏ qua */ }
  }
  // Bỏ giá trị không hợp lệ (vd lớp đã bị đổi tên)
  if (!layerMeta[s.layer]) s.layer = DEFAULTS.layer;
  if (!BASEMAPS[s.basemap]) s.basemap = DEFAULTS.basemap;
  if (!WIND_UNITS[s.windUnit]) s.windUnit = DEFAULTS.windUnit;
  if (!["auto", "pressure", "temp", "none"].includes(s.iso)) s.iso = DEFAULTS.iso;
  if (s.unit !== "F") s.unit = "C";
  if (!ACC_PERIODS[s.accHours]) s.accHours = DEFAULTS.accHours;
  s.storms = s.storms !== false;
  return s;
}

export const state = {
  ...loadSettings(),
  locations: [],       // danh sách địa điểm có sẵn (GET /api/cities)
  overview: null,      // dữ liệu 5 ngày rút gọn mọi địa điểm (GET /api/overview)
  overviewById: {},    // tra cứu nhanh overview theo id
  grids: [],           // các lưới điểm phủ vùng (GET /api/grid): Việt Nam + châu Á
  extra: {},           // lưới phụ tải khi cần: { marine, air }
  stormList: [],       // bão đang hoạt động & gần đây (GET /api/storms)
  times: [],           // các mốc giờ (giờ Việt Nam) của timeline
  active: null,        // địa điểm đang xem (có sẵn hoặc toạ độ tự chọn)
  weather: null,       // dự báo chi tiết của địa điểm đang xem
  hourIdx: 0,          // giờ đang xem trên timeline (0 = bây giờ)
  playing: false,      // timeline có đang tự chạy không
  favorites: readJSON(FAV_KEY, []),
};

export function saveSettings() {
  writeJSON(SETTINGS_KEY, Object.fromEntries(SETTING_KEYS.map((k) => [k, state[k]])));
}
/** Giữ tên cũ cho tương thích */
export const saveUnit = saveSettings;

// ----------------------------- Yêu thích ----------------------------------
/** Khoá duy nhất của một địa điểm: id có sẵn, hoặc toạ độ làm tròn */
export function placeKey(p) {
  return p.id ? p.id : `@${(+p.lat).toFixed(3)},${(+p.lon).toFixed(3)}`;
}

export function isFavorite(p) {
  if (!p) return false;
  const k = placeKey(p);
  return state.favorites.some((f) => placeKey(f) === k);
}

/** Thêm/bỏ yêu thích. @returns {boolean} trạng thái mới */
export function toggleFavorite(p) {
  const k = placeKey(p);
  const i = state.favorites.findIndex((f) => placeKey(f) === k);
  if (i >= 0) state.favorites.splice(i, 1);
  else state.favorites.unshift({ id: p.id || null, name: p.name, sub: p.sub || "", lat: p.lat, lon: p.lon });
  state.favorites = state.favorites.slice(0, 20);
  writeJSON(FAV_KEY, state.favorites);
  return i < 0;
}
