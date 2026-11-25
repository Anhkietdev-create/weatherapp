// backend/routes/weather.js
// Các endpoint /api/... — chỉ là lớp bọc mỏng quanh frontend/js/core/service.js
// (cùng một mã nguồn với bản chạy thẳng trên trình duyệt ở GitHub Pages).
// Chạy qua backend thì có thêm cache dùng chung cho mọi người xem.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const express = require("express");
const router = express.Router();

const CORE = path.join(__dirname, "..", "..", "frontend", "js", "core", "service.js");
const WARD_INDEX = path.join(__dirname, "..", "..", "frontend", "data", "vn", "index.json");

/** Module ES dùng chung được nạp bất đồng bộ (CommonJS → import()) */
const servicePromise = import(pathToFileURL(CORE).href).then((svc) => {
  svc.setWardIndexLoader(async () => JSON.parse(await fs.promises.readFile(WARD_INDEX, "utf8")));
  return svc;
});

/** Bọc handler: chờ service, đổi ApiError thành mã HTTP tương ứng, lỗi khác → middleware lỗi */
const wrap = (fn) => async (req, res, next) => {
  try {
    const svc = await servicePromise;
    res.json(await fn(svc, req));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, ...err.extra });
    next(err);
  }
};
const q = (req, k) => (req.query[k] ?? "").toString();

/** GET /api/cities — danh sách địa điểm có sẵn */
router.get("/cities", wrap((svc) => svc.cities()));

/** GET /api/search?q=... — địa điểm có sẵn, xã/phường, địa danh châu Á */
router.get(["/search", "/cities/search"], wrap((svc, req) => svc.search(q(req, "q"))));

/** GET /api/overview — dữ liệu 5 ngày rút gọn của mọi địa điểm */
router.get("/overview", wrap((svc) => svc.overview()));

/** GET /api/grid?set=base|marine|air — lưới điểm phủ vùng */
router.get("/grid", wrap((svc, req) => svc.grid(q(req, "set") || "base")));

/** GET /api/models?lat=..&lon=.. — so sánh ECMWF, GFS, ICON, JMA */
router.get("/models", wrap((svc, req) => svc.models(q(req, "lat"), q(req, "lon"))));

/** GET /api/forecast?lat=..&lon=..&name=..&sub=.. — dự báo tại toạ độ bất kỳ */
router.get("/forecast", wrap((svc, req) => svc.forecastAt(q(req, "lat"), q(req, "lon"), q(req, "name"), q(req, "sub"))));

/** GET /api/reverse?lat=..&lon=.. — tên địa danh tại toạ độ */
router.get("/reverse", wrap((svc, req) => svc.reverse(q(req, "lat"), q(req, "lon"))));

/** GET /api/storms?days=30 — bão/áp thấp nhiệt đới (GDACS) */
router.get("/storms", wrap((svc, req) => svc.storms(q(req, "days") || 30)));

/** GET /api/weather/:cityId — dự báo đầy đủ (+ /hourly, /daily) */
router.get("/weather/:cityId", wrap((svc, req) => svc.weather(req.params.cityId)));
router.get("/weather/:cityId/hourly", wrap(async (svc, req) => {
  const d = await svc.weather(req.params.cityId);
  return { location: d.location, hourly: d.hourly };
}));
router.get("/weather/:cityId/daily", wrap(async (svc, req) => {
  const d = await svc.weather(req.params.cityId);
  return { location: d.location, daily: d.daily };
}));

module.exports = router;
module.exports.servicePromise = servicePromise;
