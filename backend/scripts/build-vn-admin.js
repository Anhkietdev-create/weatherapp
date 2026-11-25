// backend/scripts/build-vn-admin.js
// Dựng dữ liệu bản đồ hành chính Việt Nam MỚI (sau sắp xếp 01/07/2025:
// 34 tỉnh/thành, 3.321 xã/phường/đặc khu) cho frontend.
//
// Nguồn:
//   - Ranh giới: thanglequoc/vietnamese-provinces-database (MIT), dựng từ
//     "Bản đồ tra cứu các đơn vị hành chính Việt Nam" (NXB TN-MT & Bản đồ VN).
//   - Tên có dấu & mã đơn vị: provinces.open-api.vn (API v2).
//
// Cách chạy (một lần, cần Internet):   npm run build:map
// Kết quả (đã nén, đơn giản hoá đường biên) nằm ở frontend/data/vn/:
//   provinces.json        34 tỉnh/thành (ranh giới + điểm đặt nhãn)
//   wards/<mã tỉnh>.json  xã/phường của từng tỉnh (tải khi phóng to tới tỉnh đó)
//   index.json            danh sách 3.321 xã/phường (tên, toạ độ nhãn, bbox) để tìm kiếm

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const ZIP_URL = "https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/master/dataset-generation-scripts/resources/gis/geojson_11Mar2026.zip";
const NAMES_URL = "https://provinces.open-api.vn/api/v2/?depth=2";

const RAW_DIR = path.join(__dirname, "..", "data", "raw-gis");
const OUT_DIR = path.join(__dirname, "..", "..", "frontend", "data", "vn");

// Dung sai đơn giản hoá (độ): ~330 m cho tỉnh, ~45 m cho xã/phường
const TOL_PROVINCE = 0.003;
const TOL_WARD = 0.0004;
const DECIMALS = 4; // ~11 m

// ---------------------------------------------------------------------------
async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return;
  console.log("Tải", url);
  const res = await fetch(url, { headers: { "User-Agent": "LuongGio-weather-app/1.0" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/** "Phường Hải Châu" / "11_đam_ha_xa" → "hai_chau" kiểu khoá so khớp (bỏ dấu, đ→d) */
function slug(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
const TYPE_SLUG = { "phường": "phuong", "xã": "xa", "đặc khu": "dac_khu" };

// ----------------------------- Hình học ------------------------------------
const round = (v) => Math.round(v * 10 ** DECIMALS) / 10 ** DECIMALS;

/** Douglas–Peucker (lặp, không đệ quy) cho một vòng [[lon,lat],...] */
function simplifyRing(ring, tol) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a], [bx, by] = ring[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      let d2;
      if (len2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d2 > maxD) { maxD = d2; idx = i; }
    }
    if (maxD > t2 && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    if (!keep[i]) continue;
    const p = [round(ring[i][0]), round(ring[i][1])];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

/** Polygon/MultiPolygon → danh sách polygon [[outer, ...holes]] đã đơn giản hoá */
function simplifyGeometry(geom, tol) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  const out = [];
  for (const poly of polys) {
    const rings = [];
    poly.forEach((ring, k) => {
      let s = simplifyRing(ring, tol);
      // Đảo nhỏ bị "co" mất khi đơn giản hoá: giữ hình gốc làm tròn để không biến mất
      if (s.length < 4 && k === 0) s = ring.map(([x, y]) => [round(x), round(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
      if (s.length >= 4) rings.push(s);
    });
    if (rings.length) out.push(rings);
  }
  return out;
}

function bboxOf(polys) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of polys) for (const [x, y] of p[0]) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  return [round(w), round(s), round(e), round(n)];
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const pointInPoly = (pt, poly) => pointInRing(pt, poly[0]) && !poly.slice(1).some((h) => pointInRing(pt, h));

/**
 * Điểm đặt nhãn: nằm TRONG polygon lớn nhất, càng xa biên càng tốt
 * (xấp xỉ "pole of inaccessibility" bằng lưới thử 12×12).
 */
function labelPoint(polys) {
  let best = polys[0];
  for (const p of polys) if (ringArea(p[0]) > ringArea(best[0])) best = p;
  const ring = best[0];
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const distToEdge = ([x, y]) => {
    let m = Infinity;
    for (const r of best) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[j], [bx, by] = r[i];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      m = Math.min(m, (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2);
    }
    return m;
  };
  let bestPt = null, bestD = -1;
  const N = 12;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const pt = [w + ((e - w) * i) / N, s + ((n - s) * j) / N];
    if (!pointInPoly(pt, best)) continue;
    const d = distToEdge(pt);
    if (d > bestD) { bestD = d; bestPt = pt; }
  }
  if (!bestPt) bestPt = ring[0];
  return [round(bestPt[1]), round(bestPt[0])]; // [lat, lon]
}

const shortName = (name) => name.replace(/^(Thành phố|Tỉnh)\s+/, "");

// ----------------------------- Ghép tên ↔ ranh giới -------------------------
// Tên file trong nguồn là dạng không dấu và đôi khi bị cắt sai ("Phương Liệt"
// → "liet_phuong", "Chuyên Mỹ" → "cmy_xa"), một số tên trùng khi bỏ dấu
// ("Tân Thạnh" / "Tân Thành"). Ghép theo 3 bước:
//   1) khớp chính xác khoá "<tên>_<loại>"
//   2) khớp gần đúng với các xã/phường CÙNG LOẠI còn lại (chung từ + độ giống chuỗi)
//   3) nhóm trùng khi bỏ dấu: hỏi Nominatim (OSM) tên tại điểm nhãn của polygon
const wardBase = (w) => slug(w.name.replace(/^(Phường|Xã|Đặc khu)\s+/, ""));
const wardType = (w) => TYPE_SLUG[w.division_type] || slug(w.division_type);
const TYPE_SUFFIX = /_(phuong|xa|dac_khu)$/;

function lcs(a, b) {
  const dp = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Độ giống giữa khoá file (không loại) và tên xã: chung từ + chuỗi con chung dài nhất */
function similarity(fileBase, name) {
  const ft = fileBase.split("_"), nt = name.split("_");
  const common = ft.filter((t) => nt.includes(t)).length;
  const ratio = lcs(fileBase, name) / Math.max(fileBase.length, name.length);
  return common * 0.5 + ratio;
}

let lastNominatim = 0;
async function nominatimNames(lat, lon) {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const qs = new URLSearchParams({ format: "jsonv2", lat, lon, zoom: "14", "accept-language": "vi" });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${qs}`, {
    headers: { "User-Agent": "LuongGio-weather-app/1.0 (build script)" },
  });
  if (!res.ok) return "";
  const j = await res.json();
  return [j.name, j.display_name, ...Object.values(j.address || {})].filter(Boolean).join(" | ").toLowerCase();
}

/** Chọn tên có kết quả tìm kiếm địa danh (GeoNames qua Open-Meteo) gần điểm nhãn nhất */
async function nearestByGeocode(wards, P, [lat, lon]) {
  let best = null, bestD = Infinity;
  for (const w of wards) {
    const q = w.name.replace(/^(Phường|Xã|Đặc khu)\s+/, "");
    const qs = new URLSearchParams({ name: q, count: "20", language: "vi", countryCode: "VN" });
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${qs}`).catch(() => null);
    const j = res?.ok ? await res.json() : {};
    for (const r of j.results || []) {
      // Chỉ nhận kết quả đúng tên (có dấu)
      if ((r.name || "").toLowerCase() !== q.toLowerCase()) continue;
      const d = (r.latitude - lat) ** 2 + (r.longitude - lon) ** 2;
      if (d < bestD && d < 0.5 ** 2) { bestD = d; best = w; }
    }
  }
  if (best) console.log(`  ⌖ ${P.name}: phân biệt "${best.name}" theo toạ độ địa danh`);
  return best;
}

/** @returns {Promise<Array<[ward, shape]>>} */
async function matchWards(P, shapes, problems) {
  const result = [];
  const freeWards = new Set(P.wards);
  const freeShapes = new Set(shapes);

  // 1) khớp chính xác (chỉ khi duy nhất cả 2 phía)
  const byKey = new Map();
  for (const w of P.wards) {
    const k = `${wardBase(w)}_${wardType(w)}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(w);
  }
  const shapeCount = new Map();
  for (const s of shapes) shapeCount.set(s.key, (shapeCount.get(s.key) || 0) + 1);
  const ambiguous = new Map(); // key → { wards, shapes }
  for (const s of shapes) {
    const ws = byKey.get(s.key) || [];
    if (ws.length === 1 && shapeCount.get(s.key) === 1) {
      result.push([ws[0], s]);
      freeWards.delete(ws[0]);
      freeShapes.delete(s);
    } else if (ws.length > 1 || shapeCount.get(s.key) > 1) {
      if (!ambiguous.has(s.key)) ambiguous.set(s.key, { wards: ws, shapes: [] });
      ambiguous.get(s.key).shapes.push(s);
    }
  }

  // 3) nhóm trùng khi bỏ dấu → hỏi Nominatim (làm trước bước 2 để bước 2 có ít ứng viên hơn)
  for (const [key, grp] of ambiguous) {
    const wards = grp.wards.filter((w) => freeWards.has(w));
    for (const s of grp.shapes) {
      if (!wards.length || !s.label) break;
      const addr = await nominatimNames(s.label[0], s.label[1]);
      let hit = wards.find((w) => addr.includes(w.name.replace(/^(Phường|Xã|Đặc khu)\s+/, "").toLowerCase()));
      // Nominatim không phân biệt được → tìm toạ độ từng tên (Open-Meteo geocoding), chọn tên gần polygon nhất
      if (!hit && wards.length > 1) hit = await nearestByGeocode(wards, P, s.label);
      const W = hit || (wards.length === 1 ? wards[0] : null);
      if (!W) { problems.push(`Chưa phân biệt được (${key}): ${wards.map((w) => w.name).join(" / ")}`); continue; }
      if (!hit) problems.push(`Đoán theo loại trừ: ${P.name} / ${W.name}`);
      result.push([W, s]);
      freeWards.delete(W);
      freeShapes.delete(s);
      wards.splice(wards.indexOf(W), 1);
    }
  }

  // 2) khớp gần đúng cho phần còn lại, ưu tiên cặp giống nhất
  const pairs = [];
  for (const s of freeShapes) {
    const type = (s.key.match(TYPE_SUFFIX) || [])[1];
    const base = s.key.replace(TYPE_SUFFIX, "");
    for (const w of freeWards) {
      if (type && wardType(w) !== type) continue;
      pairs.push({ s, w, score: similarity(base, wardBase(w)) });
    }
  }
  // Nguồn đôi khi ghi sai loại (xã ↔ phường): cho phép khác loại nếu tên giống hệt
  for (const s of freeShapes) {
    const base = s.key.replace(TYPE_SUFFIX, "");
    for (const w of freeWards) if (wardBase(w) === base) pairs.push({ s, w, score: 3 });
  }
  pairs.sort((a, b) => b.score - a.score);
  const fuzzy = [];
  for (const { s, w, score } of pairs) {
    if (!freeShapes.has(s) || !freeWards.has(w) || score < 0.5) continue;
    result.push([w, s]);
    freeShapes.delete(s);
    freeWards.delete(w);
    fuzzy.push([w, s, score]);
  }
  // Còn đúng 1 ranh giới và 1 tên cùng loại → ghép với nhau
  for (const s of [...freeShapes]) {
    const type = (s.key.match(TYPE_SUFFIX) || [])[1];
    const left = [...freeWards].filter((w) => wardType(w) === type);
    const leftShapes = [...freeShapes].filter((x) => (x.key.match(TYPE_SUFFIX) || [])[1] === type);
    if (left.length === 1 && leftShapes.length === 1) {
      result.push([left[0], s]);
      freeShapes.delete(s);
      freeWards.delete(left[0]);
      fuzzy.push([left[0], s, 0]);
    }
  }
  // Xác minh các cặp ghép gần đúng bằng tên thật tại vị trí (OSM)
  for (const [w, s, score] of fuzzy) {
    const addr = s.label ? await nominatimNames(s.label[0], s.label[1]) : "";
    const ok = addr.includes(w.name.replace(/^(Phường|Xã|Đặc khu)\s+/, "").toLowerCase());
    console.log(`  ${ok ? "✓" : "?"} ${P.name}: "${s.key}" → ${w.name} (điểm ${score.toFixed(2)})${ok ? "" : "  ← OSM không xác nhận"}`);
    if (!ok) problems.push(`Ghép gần đúng chưa xác minh: ${P.name} / "${s.key}" → ${w.name}`);
  }

  for (const s of freeShapes) problems.push(`Ranh giới không khớp tên: ${P.name} / ${s.key}`);
  for (const w of freeWards) problems.push(`Thiếu ranh giới: ${P.name} / ${w.name}`);
  return result;
}

// ---------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const zipFile = path.join(RAW_DIR, "geojson.zip");
  const namesFile = path.join(RAW_DIR, "names-v2.json");
  await download(ZIP_URL, zipFile);
  await download(NAMES_URL, namesFile);

  const names = JSON.parse(fs.readFileSync(namesFile, "utf8"));
  const zip = new AdmZip(zipFile);
  const entries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.endsWith(".geojson"));

  // Gom file theo thư mục tỉnh: "<số>_<tiền tố>_<tên>"
  const folders = new Map();
  for (const e of entries) {
    const parts = e.entryName.split("/");
    const folder = parts[1];
    if (!folders.has(folder)) folders.set(folder, { province: null, wards: [] });
    if (parts[2] === "province.geojson") folders.get(folder).province = e;
    else if (parts[2] === "wards") folders.get(folder).wards.push(e);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT_DIR, "wards"), { recursive: true });

  const provincesOut = [];
  const index = [];
  const problems = [];

  for (const [folder, files] of folders) {
    const pSlug = slug(folder.replace(/^\d+_/, "").replace(/^(tinh|thu_đo|thanh_pho)_/, ""));
    const P = names.find((p) => p.codename === pSlug || slug(shortName(p.name)) === pSlug);
    if (!P) { problems.push(`Không khớp tỉnh: ${folder}`); continue; }

    const pGeom = JSON.parse(files.province.getData().toString("utf8")).features[0].geometry;
    const pPolys = simplifyGeometry(pGeom, TOL_PROVINCE);
    provincesOut.push({
      code: P.code, name: P.name, short: shortName(P.name),
      type: P.division_type, bbox: bboxOf(pPolys), label: labelPoint(pPolys), geom: pPolys,
    });

    // Đọc & đơn giản hoá toàn bộ ranh giới xã/phường của tỉnh
    const shapes = files.wards.map((e) => {
      const file = e.entryName.split("/").pop().replace(/\.geojson$/, "").replace(/^\d+_/, "");
      const g = JSON.parse(e.getData().toString("utf8")).features[0].geometry;
      const polys = simplifyGeometry(g, TOL_WARD);
      return { key: slug(file), polys, label: polys.length ? labelPoint(polys) : null };
    });
    const assigned = await matchWards(P, shapes, problems);

    const wardsOut = [];
    for (const [W, s] of assigned) {
      if (!s.polys.length) { problems.push(`Hình rỗng: ${W.name}`); continue; }
      const bbox = bboxOf(s.polys);
      wardsOut.push({ code: W.code, name: W.name, type: W.division_type, label: s.label, bbox, geom: s.polys });
      index.push([W.code, W.name, P.code, s.label[0], s.label[1], bbox]);
    }

    fs.writeFileSync(path.join(OUT_DIR, "wards", `${P.code}.json`),
      JSON.stringify({ province: P.code, name: P.name, wards: wardsOut }));
  }

  provincesOut.sort((a, b) => a.code - b.code);
  fs.writeFileSync(path.join(OUT_DIR, "provinces.json"), JSON.stringify({
    source: "thanglequoc/vietnamese-provinces-database (MIT) · provinces.open-api.vn",
    boundaryDate: "2026-03-11",
    builtAt: new Date().toISOString(),
    provinces: provincesOut,
  }));
  fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify({
    fields: ["code", "name", "provinceCode", "lat", "lon", "bbox"],
    provinces: Object.fromEntries(provincesOut.map((p) => [p.code, p.name])),
    wards: index,
  }));

  const size = (f) => (fs.statSync(path.join(OUT_DIR, f)).size / 1e6).toFixed(2) + " MB";
  const wardDir = path.join(OUT_DIR, "wards");
  const wardTotal = fs.readdirSync(wardDir).reduce((a, f) => a + fs.statSync(path.join(wardDir, f)).size, 0);
  console.log(`Tỉnh/thành: ${provincesOut.length} (${size("provinces.json")})`);
  console.log(`Xã/phường/đặc khu: ${index.length} (wards/*: ${(wardTotal / 1e6).toFixed(2)} MB, index: ${size("index.json")})`);
  if (problems.length) {
    console.log(`\n${problems.length} vấn đề:`);
    for (const p of problems.slice(0, 40)) console.log(" -", p);
  } else {
    console.log("Khớp đầy đủ, không có vấn đề.");
  }
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
