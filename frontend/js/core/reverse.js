// js/core/reverse.js
// Module DÙNG CHUNG cho trình duyệt (GitHub Pages) và backend Node (npm start).
// Chuyển từ backend/services/reverse.js — chỉ dùng fetch/setTimeout nên chạy được ở cả hai môi trường.
// Đổi toạ độ GPS → tên địa danh (đường / phường-xã / tỉnh-thành) bằng
// Nominatim của OpenStreetMap — miễn phí, không cần API key.
//
// Điều khoản sử dụng Nominatim: tối đa 1 request/giây, phải gửi User-Agent
// nhận diện ứng dụng, và nên cache kết quả → làm đúng cả 3 ở đây.
// https://operations.osmfoundation.org/policies/nominatim/

// Trình duyệt không cho tự đặt User-Agent (và header lạ sẽ gây preflight CORS) →
// chỉ gửi User-Agent khi chạy trên Node; trình duyệt tự gửi Referer để Nominatim nhận diện.
const IS_NODE = typeof window === "undefined";
const URL_REVERSE = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "LuongGio-weather-app/1.0 (+https://open-meteo.com)";
const TTL = 24 * 60 * 60 * 1000;
const MIN_INTERVAL = 1100; // ms giữa 2 request

const cache = new Map(); // "lat,lon" (làm tròn ~100 m) → { at, value }
let queue = Promise.resolve();
let lastCall = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Xếp hàng để không bao giờ gọi Nominatim quá 1 lần/giây */
function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_INTERVAL - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

/** Dựng tên ngắn gọn + dòng phụ từ địa chỉ Nominatim */
function format(raw) {
  const a = raw.address || {};
  const ward = a.suburb || a.quarter || a.village || a.town || a.hamlet || a.city_district || a.municipality;
  const province = a.city || a.state || a.province || a.county || a.region;
  // Tên chính: ưu tiên phường/xã (dễ nhận ra hơn tên đường), rồi đến đường / địa điểm
  const name = ward || raw.name || a.road || province || a.country || "";
  const sub = [
    ward && (raw.name || a.road) && (raw.name || a.road) !== ward ? raw.name || a.road : null,
    province !== name ? province : null,
    a.country,
  ].filter(Boolean).join(" · ");
  return {
    name,
    sub,
    road: a.road || null,
    ward: ward || null,
    province: province || null,
    country: a.country || null,
    countryCode: (a.country_code || "").toUpperCase() || null,
    display: raw.display_name || "",
  };
}

/**
 * @returns {Promise<{name, sub, road, ward, province, country, countryCode, display} | null>}
 *   null nếu toạ độ không thuộc địa danh nào (vd giữa biển)
 */
async function reverse(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  const value = await throttled(async () => {
    const qs = new URLSearchParams({
      format: "jsonv2", lat: String(lat), lon: String(lon),
      zoom: "16", "accept-language": "vi", addressdetails: "1",
    });
    const res = await fetch(`${URL_REVERSE}?${qs}`, {
      headers: IS_NODE ? { "User-Agent": USER_AGENT, Accept: "application/json" } : { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const raw = await res.json();
    return raw.error ? null : format(raw);
  });
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return value;
}

export { reverse };
