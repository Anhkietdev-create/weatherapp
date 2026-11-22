// backend/routes/weather.js
const express = require("express");
const router = express.Router();
const locations = require("../data/locations");
const meteo = require("../services/openMeteo");

// Khung bao châu Á (kể cả Indonesia, Đông Timor, Tây Á và vùng Siberia/Viễn Đông)
const BOUNDS = { minLat: -15, maxLat: 82, minLon: 25, maxLon: 180 };

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu: "da lat" khớp "Đà Lạt" */
function normalize(s) {
  return s
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

/** Khoảng cách xấp xỉ (km) giữa 2 toạ độ — dùng tìm địa điểm gần nhất */
function distanceKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
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

/** Bọc handler async để lỗi được chuyển tới middleware xử lý lỗi */
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/** GET /api/cities — danh sách địa điểm có sẵn */
router.get("/cities", (req, res) => {
  res.json(locations);
});

/**
 * GET /api/search?q=... — tìm địa điểm: ưu tiên danh sách có sẵn (không phân
 * biệt dấu), sau đó bổ sung kết quả geocoding cho mọi địa danh trong châu Á.
 */
router.get(["/search", "/cities/search"], wrap(async (req, res) => {
  const q = (req.query.q || "").toString().trim().slice(0, 80);
  if (!q) return res.json([]);
  const nq = normalize(q);

  const local = locations
    .filter((l) => normalize(l.name).includes(nq) || normalize(l.province).includes(nq) || normalize(l.country).includes(nq))
    .sort((a, b) => rank(a, nq) - rank(b, nq) || a.tier - b.tier)
    .slice(0, 8)
    .map((l) => ({
      kind: "location", id: l.id, name: l.name, lat: l.lat, lon: l.lon,
      sub: l.country === "Việt Nam" ? `${l.province} · Việt Nam` : `${l.country} · ${l.region}`,
    }));

  let places = [];
  if (q.length >= 2) {
    try {
      places = (await meteo.geocode(q))
        // bỏ những kết quả trùng (rất gần) với địa điểm có sẵn
        .filter((p) => !local.some((l) => distanceKm(l, p) < 3))
        .map((p) => ({ kind: "place", ...p }));
    } catch (err) {
      console.warn("Geocoding lỗi:", err.message);
    }
  }
  res.json([...local, ...places].slice(0, 12));
}));

/** GET /api/overview — dữ liệu 48h rút gọn của mọi địa điểm (tô màu bản đồ) */
router.get("/overview", wrap(async (req, res) => {
  res.json(await meteo.getOverview(locations));
}));

/**
 * GET /api/grid?set=base|marine|air — lưới điểm phủ vùng.
 *   base (mặc định): nhiệt, gió, mưa, mây, áp suất, độ ẩm, CAPE…
 *   marine: sóng biển · air: bụi mịn PM2.5 (chỉ tải khi được yêu cầu)
 */
router.get("/grid", wrap(async (req, res) => {
  const set = (req.query.set || "base").toString();
  if (set === "base") return res.json(await meteo.getGrids());
  if (!meteo.EXTRA_SETS.includes(set)) {
    return res.status(400).json({ error: "Tham số set không hợp lệ", allowed: ["base", ...meteo.EXTRA_SETS] });
  }
  res.json(await meteo.getExtra(set, locations));
}));

/** Đọc & kiểm tra lat/lon trong query; trả về null (và gửi lỗi 400) nếu sai */
function parseLatLon(req, res) {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: "Thiếu hoặc sai tham số lat/lon" });
    return null;
  }
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lon < BOUNDS.minLon || lon > BOUNDS.maxLon) {
    res.status(400).json({ error: "Vị trí nằm ngoài khu vực châu Á" });
    return null;
  }
  return { lat, lon };
}

/** GET /api/models?lat=..&lon=.. — so sánh dự báo 7 ngày của ECMWF, GFS, ICON, JMA */
router.get("/models", wrap(async (req, res) => {
  const p = parseLatLon(req, res);
  if (p) res.json(await meteo.getModels(p.lat, p.lon));
}));

/** GET /api/forecast?lat=..&lon=..&name=.. — dự báo tại toạ độ bất kỳ */
router.get("/forecast", wrap(async (req, res) => {
  const p = parseLatLon(req, res);
  if (!p) return;
  const { lat, lon } = p;

  // Đặt tên theo địa điểm gần nhất nếu đủ gần, còn lại dùng toạ độ
  const { location: near, km } = nearestLocation(lat, lon);
  const customName = (req.query.name || "").toString().trim().slice(0, 80);
  const coordName = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "B" : "N"}, ${lon.toFixed(2)}°Đ`;
  const autoName = km < 5 ? near.name : km < 150 ? `Gần ${near.name}` : coordName;
  const customSub = (req.query.sub || "").toString().trim().slice(0, 120);
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
  res.json(await meteo.getWeather(location));
}));

function findLocation(req, res) {
  const loc = locations.find((l) => l.id === req.params.cityId);
  if (!loc) res.status(404).json({ error: "Không tìm thấy địa điểm", cityId: req.params.cityId });
  return loc;
}

/** GET /api/weather/:cityId — dự báo đầy đủ (48h theo giờ + 10 ngày + AQI) */
router.get("/weather/:cityId", wrap(async (req, res) => {
  const loc = findLocation(req, res);
  if (loc) res.json(await meteo.getWeather(loc));
}));

/** GET /api/weather/:cityId/hourly — chỉ dữ liệu theo giờ */
router.get("/weather/:cityId/hourly", wrap(async (req, res) => {
  const loc = findLocation(req, res);
  if (!loc) return;
  const data = await meteo.getWeather(loc);
  res.json({ location: data.location, hourly: data.hourly });
}));

/** GET /api/weather/:cityId/daily — chỉ dữ liệu theo ngày */
router.get("/weather/:cityId/daily", wrap(async (req, res) => {
  const loc = findLocation(req, res);
  if (!loc) return;
  const data = await meteo.getWeather(loc);
  res.json({ location: data.location, daily: data.daily });
}));

module.exports = router;
