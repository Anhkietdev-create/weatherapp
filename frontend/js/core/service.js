// js/core/service.js
// "API" của ứng dụng dưới dạng hàm thường — DÙNG CHUNG cho hai cách chạy:
//   • Trình duyệt (GitHub Pages, không có backend): frontend gọi thẳng các hàm này.
//   • Backend Node (npm start): routes/weather.js bọc các hàm này thành /api/...
// Lỗi do dữ liệu vào sai được ném ra dạng ApiError (có mã HTTP) để backend trả đúng mã.
import locations from "./locations.js";
import * as meteo from "./openMeteo.js";
import * as stormsSvc from "./storms.js";
import * as reverseSvc from "./reverse.js";

export class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Khung bao châu Á (kể cả Indonesia, Đông Timor, Tây Á và vùng Siberia/Viễn Đông)
const BOUNDS = { minLat: -15, maxLat: 82, minLon: 25, maxLon: 180 };

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu: "da lat" khớp "Đà Lạt" */
function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

/** Thứ hạng khi tìm: khớp đầu tên < khớp giữa tên < chỉ khớp tên tỉnh */
function rank(loc, nq) {
  const i = normalize(loc.name).indexOf(nq);
  return i < 0 ? 100 : i;
}

/** Khoảng cách xấp xỉ (km) giữa 2 toạ độ */
function distanceKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function nearestLocation(lat, lon) {
  let best = null, bestD = Infinity;
  for (const l of locations) {
    const d = distanceKm({ lat, lon }, l);
    if (d < bestD) { bestD = d; best = l; }
  }
  return { location: best, km: bestD };
}

function checkLatLon(lat, lon) {
  lat = parseFloat(lat);
  lon = parseFloat(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new ApiError(400, "Thiếu hoặc sai tham số lat/lon");
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lon < BOUNDS.minLon || lon > BOUNDS.maxLon) {
    throw new ApiError(400, "Vị trí nằm ngoài khu vực châu Á");
  }
  return { lat, lon };
}

// ----------------------------- Chỉ mục xã/phường ----------------------------
// Trình duyệt: tải data/vn/index.json cạnh trang. Backend: đọc file qua setWardIndexLoader.
let wardLoader = async () => {
  const res = await fetch(new URL("../../data/vn/index.json", import.meta.url));
  if (!res.ok) throw new Error(`index.json ${res.status}`);
  return res.json();
};
let wardIndexP = null;

export function setWardIndexLoader(fn) {
  wardLoader = fn;
  wardIndexP = null;
}

function wardIndex() {
  if (!wardIndexP) {
    wardIndexP = (async () => {
      try {
        const idx = await wardLoader();
        return idx.wards.map(([code, name, pcode, lat, lon]) => ({
          code, name, province: idx.provinces[pcode], lat, lon, n: normalize(name),
          base: normalize(name).replace(/^(phuong|xa|dac khu)\s+/, ""),
          urban: name.startsWith("Phường"),
        }));
      } catch (err) {
        console.warn("Chưa có dữ liệu xã/phường (npm run build:map) — bỏ qua tìm theo phường:", err.message);
        return [];
      }
    })();
  }
  return wardIndexP;
}

// ----------------------------- Các "endpoint" -------------------------------
/** Danh sách địa điểm có sẵn */
export const cities = () => locations;

/**
 * Tìm địa điểm: danh sách có sẵn (không phân biệt dấu) → xã/phường (đơn vị hành
 * chính mới) → địa danh bất kỳ ở châu Á (geocoding).
 */
export async function search(qRaw) {
  const q = String(qRaw || "").trim().slice(0, 80);
  if (!q) return [];
  const nq = normalize(q);

  const local = locations
    .filter((l) => normalize(l.name).includes(nq) || normalize(l.province).includes(nq) || normalize(l.country).includes(nq))
    .sort((a, b) => rank(a, nq) - rank(b, nq) || a.tier - b.tier)
    .slice(0, 8)
    .map((l) => ({
      kind: "location", id: l.id, name: l.name, lat: l.lat, lon: l.lon,
      sub: l.country === "Việt Nam" ? `${l.province} · Việt Nam` : `${l.country} · ${l.region}`,
    }));

  // Xã/phường/đặc khu ("hai chau", "phuong hai chau"…)
  const nqWard = nq.replace(/^(phuong|xa|dac khu)\s+/, "");
  let wardHits = nqWard.length >= 2 ? (await wardIndex()).filter((w) => w.base.includes(nqWard)) : [];
  // Gõ kèm loại thì ưu tiên đúng loại; không có thì vẫn trả theo tên (vd "xa phu quoc" → Đặc khu Phú Quốc)
  if (nqWard !== nq) {
    const typed = wardHits.filter((w) => w.n.startsWith(nq.split(" ")[0]));
    if (typed.length) wardHits = typed;
  }
  const wards = wardHits
    .sort((a, b) => a.base.indexOf(nqWard) - b.base.indexOf(nqWard) || b.urban - a.urban || a.base.length - b.base.length)
    .slice(0, 6)
    .map((w) => ({ kind: "place", name: w.name, sub: w.province, lat: w.lat, lon: w.lon, zoom: 12 }));

  let places = [];
  if (q.length >= 2) {
    try {
      places = (await meteo.geocode(q))
        .filter((p) => !local.some((l) => distanceKm(l, p) < 3))
        .map((p) => ({ kind: "place", ...p }));
    } catch (err) {
      console.warn("Geocoding lỗi:", err.message);
    }
  }
  places = places.filter((p) => !wards.some((w) => distanceKm(w, p) < 2));
  return [...local, ...wards, ...places].slice(0, 14);
}

/** Dữ liệu 5 ngày rút gọn của mọi địa điểm (tô màu bản đồ + nhãn ghim) */
export const overview = () => meteo.getOverview(locations);

/** Lưới điểm phủ vùng: base | marine (sóng) | air (PM2.5) */
export async function grid(set = "base") {
  set = String(set || "base");
  if (set === "base") return meteo.getGrids();
  if (!meteo.EXTRA_SETS.includes(set)) {
    throw new ApiError(400, "Tham số set không hợp lệ", { allowed: ["base", ...meteo.EXTRA_SETS] });
  }
  return meteo.getExtra(set, locations);
}

/** So sánh dự báo 7 ngày của ECMWF, GFS, ICON, JMA */
export function models(lat, lon) {
  const p = checkLatLon(lat, lon);
  return meteo.getModels(p.lat, p.lon);
}

/** Dự báo đầy đủ tại toạ độ bất kỳ (tự đặt tên theo địa điểm gần nhất nếu không có tên) */
export async function forecastAt(latRaw, lonRaw, nameRaw = "", subRaw = "") {
  const { lat, lon } = checkLatLon(latRaw, lonRaw);
  const { location: near, km } = nearestLocation(lat, lon);
  const customName = String(nameRaw || "").trim().slice(0, 80);
  const coordName = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "B" : "N"}, ${lon.toFixed(2)}°Đ`;
  const autoName = km < 5 ? near.name : km < 150 ? `Gần ${near.name}` : coordName;
  const customSub = String(subRaw || "").trim().slice(0, 120);
  const location = {
    id: null,
    name: customName || autoName,
    province: customSub || (km < 400 ? near.province : "Vị trí đã chọn"),
    region: km < 400 ? near.region : "",
    country: km < 400 ? near.country : "",
    lat: Math.round(lat * 1e4) / 1e4,
    lon: Math.round(lon * 1e4) / 1e4,
    tier: 3,
  };
  return meteo.getWeather(location);
}

/** Dự báo đầy đủ của một địa điểm có sẵn */
export async function weather(id) {
  const loc = locations.find((l) => l.id === id);
  if (!loc) throw new ApiError(404, "Không tìm thấy địa điểm", { cityId: id });
  return meteo.getWeather(loc);
}

/** Tên địa danh tại toạ độ (vị trí GPS) — lỗi thì trả {name:null} để giao diện tự đặt tên */
export async function reverse(latRaw, lonRaw) {
  const { lat, lon } = checkLatLon(latRaw, lonRaw);
  try {
    return (await reverseSvc.reverse(lat, lon)) || { name: null };
  } catch (err) {
    console.warn("Reverse geocoding lỗi:", err.message);
    return { name: null };
  }
}

/** Bão / áp thấp nhiệt đới đang hoạt động & trong `days` ngày qua */
export const storms = (days = 30) => stormsSvc.getStorms(parseInt(days, 10) || 30);

/** Tải trước dữ liệu bản đồ (backend gọi khi khởi động) */
export const warmUp = () => meteo.warmUp(locations);
