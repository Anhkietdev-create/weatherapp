// js/ui/vnAdmin.js
// Bản đồ hành chính Việt Nam MỚI (từ 01/07/2025): 34 tỉnh/thành + 3.321 xã/
// phường/đặc khu, dữ liệu dựng sẵn ở frontend/data/vn (npm run build:map).
//   - Ranh giới + tên tỉnh/thành: luôn hiện khi xem Việt Nam
//   - Ranh giới + tên xã/phường: khi phóng to (tải dần theo tỉnh đang xem)
//   - Nhãn Quần đảo Hoàng Sa, Trường Sa, Biển Đông
//   - Tra cứu "điểm này thuộc phường/xã nào" ngay trên trình duyệt
//   - Rê chuột tô sáng xã/phường; địa điểm đang xem được viền nổi bật

const BASE = "data/vn";
const WARD_MIN_ZOOM = 9.5;     // bắt đầu vẽ ranh giới xã/phường
const WARD_LABEL_ZOOM = 10.5;  // bắt đầu ghi tên xã/phường
const PROV_LABEL_ZOOM = [5.5, 9.5];
const MAX_PROVINCES_LOADED = 6;

let map = null;
let enabled = true;
let renderer = null;
let provinces = null;            // [{code,name,short,bbox,label,geom}]
let provLayer = null;
const wardData = new Map();      // mã tỉnh → Promise<{wards}>
const wardLayers = new Map();    // mã tỉnh → L.LayerGroup
let labelLayer = null;
let staticLabels = null;
let hoverLayer = null;
let selectedLayer = null;
let hoverWard = null;
let ready = null;
let onDetail = null;      // báo khi bắt đầu/thôi hiển thị chi tiết xã/phường
let detailOn = false;

function setDetail(on) {
  if (on === detailOn) return;
  detailOn = on;
  onDetail?.(on);
}

// ----------------------------- Hình học ------------------------------------
const toLatLngs = (polys) => polys.map((p) => p.map((r) => r.map(([x, y]) => [y, x])));

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolys(lon, lat, polys) {
  return polys.some((p) => inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h)));
}
const inBbox = (lon, lat, [w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n;

/** "Phường Hải Châu" → "P. Hải Châu" (gọn khi chưa phóng to nhiều) */
function shortWard(name) {
  return name.replace(/^Phường\s+/, "P. ").replace(/^Xã\s+/, "X. ").replace(/^Đặc khu\s+/, "ĐK. ");
}

// ----------------------------- Tải dữ liệu ---------------------------------
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function loadWards(code) {
  if (!wardData.has(code)) {
    const p = getJSON(`${BASE}/wards/${code}.json`).catch((err) => {
      wardData.delete(code);
      throw err;
    });
    wardData.set(code, p);
  }
  return wardData.get(code);
}

function provinceAt(lat, lon) {
  if (!provinces) return null;
  return provinces.find((p) => inBbox(lon, lat, p.bbox) && inPolys(lon, lat, p.geom)) || null;
}

/** Tra cứu đồng bộ trong dữ liệu ĐÃ tải (cho rê chuột) */
function wardAtSync(lat, lon) {
  const prov = provinceAt(lat, lon);
  if (!prov) return null;
  const layer = wardLayers.get(prov.code);
  const data = layer?._data;
  const ward = data?.wards.find((w) => inBbox(lon, lat, w.bbox) && inPolys(lon, lat, w.geom)) || null;
  return { province: prov, ward };
}

/**
 * Điểm (lat, lon) thuộc xã/phường nào (tải dữ liệu tỉnh nếu cần).
 * @returns {Promise<{ward:{name,type,code}|null, province:{name,short,code}}|null>} null nếu ngoài Việt Nam
 */
export async function lookupPlace(lat, lon) {
  try {
    await ready;
    const prov = provinceAt(lat, lon);
    if (!prov) return null;
    const data = await loadWards(prov.code);
    const ward = data.wards.find((w) => inBbox(lon, lat, w.bbox) && inPolys(lon, lat, w.geom)) || null;
    return { province: prov, ward };
  } catch (err) {
    console.warn("Tra cứu xã/phường lỗi:", err.message);
    return null;
  }
}

// ----------------------------- Vẽ ------------------------------------------
const STYLE_PROV = { color: "#ffffff", weight: 1.3, opacity: 0.6, fill: false, interactive: false };
const STYLE_WARD = { color: "#ffffff", weight: 0.7, opacity: 0.38, dashArray: "3 3", fill: false, interactive: false };

function drawProvinces() {
  provLayer = L.layerGroup();
  for (const p of provinces) {
    L.polygon(toLatLngs(p.geom), { ...STYLE_PROV, renderer }).addTo(provLayer);
  }
}

function drawWardLayer(code, data) {
  const g = L.layerGroup();
  for (const w of data.wards) L.polygon(toLatLngs(w.geom), { ...STYLE_WARD, renderer }).addTo(g);
  g._data = data;
  return g;
}

/** Nhãn cố định: Hoàng Sa, Trường Sa, Biển Đông */
async function buildStaticLabels() {
  staticLabels = L.layerGroup();
  const add = (lat, lon, html, cls) =>
    L.marker([lat, lon], {
      pane: "adminLabels", interactive: false, keyboard: false,
      icon: L.divIcon({ className: "vn-label-anchor", html: `<div class="vn-label ${cls}">${html}</div>`, iconSize: [0, 0] }),
    }).addTo(staticLabels);
  add(13.8, 113.4, "Biển Đông", "sea");
  try {
    const idx = await getJSON(`${BASE}/index.json`);
    for (const [code, name, pcode, lat, lon] of idx.wards) {
      if (name === "Đặc khu Hoàng Sa") add(lat, lon, `Quần đảo Hoàng Sa<small>(Việt Nam) · Đà Nẵng</small>`, "archi");
      if (name === "Đặc khu Trường Sa") add(lat, lon, `Quần đảo Trường Sa<small>(Việt Nam) · Khánh Hòa</small>`, "archi");
      void code; void pcode;
    }
  } catch { /* chỉ là nhãn phụ */ }
}

/** Dựng lại nhãn tỉnh + xã/phường trong khung nhìn, tránh chồng chữ */
function rebuildLabels() {
  labelLayer.clearLayers();
  if (!enabled || !provinces) return;
  const z = map.getZoom();
  const bounds = map.getBounds().pad(0.05);
  const size = map.getSize();
  const placed = [];
  const fits = (x, y, w, h) => {
    const r = { x1: x - w / 2 - 3, x2: x + w / 2 + 3, y1: y - h / 2 - 2, y2: y + h / 2 + 2 };
    if (placed.some((q) => r.x1 < q.x2 && r.x2 > q.x1 && r.y1 < q.y2 && r.y2 > q.y1)) return false;
    placed.push(r);
    return true;
  };
  const addLabel = (lat, lon, html, cls) =>
    L.marker([lat, lon], {
      pane: "adminLabels", interactive: false, keyboard: false,
      icon: L.divIcon({ className: "vn-label-anchor", html: `<div class="vn-label ${cls}">${html}</div>`, iconSize: [0, 0] }),
    }).addTo(labelLayer);

  // Tên tỉnh/thành
  if (z >= PROV_LABEL_ZOOM[0] && z < PROV_LABEL_ZOOM[1]) {
    for (const p of provinces) {
      if (!bounds.contains(p.label)) continue;
      const pt = map.latLngToContainerPoint(p.label);
      const text = p.short.toUpperCase();
      if (!fits(pt.x, pt.y, text.length * 7.2 + 8, 14)) continue;
      addLabel(p.label[0], p.label[1], text, "prov");
    }
  }

  // Tên xã/phường: ưu tiên đơn vị rộng (dễ đặt chữ), chỉ ghi khi polygon đủ lớn trên màn hình
  if (z >= WARD_LABEL_ZOOM) {
    const items = [];
    for (const [, layer] of wardLayers) {
      for (const w of layer._data.wards) {
        if (!bounds.contains(w.label)) continue;
        const a = map.latLngToContainerPoint([w.bbox[3], w.bbox[0]]);
        const b = map.latLngToContainerPoint([w.bbox[1], w.bbox[2]]);
        const wpx = Math.abs(b.x - a.x), hpx = Math.abs(b.y - a.y);
        items.push({ w, wpx, hpx, area: wpx * hpx });
      }
    }
    items.sort((p, q) => q.area - p.area);
    for (const { w, wpx, hpx } of items) {
      const text = z >= 12.5 ? w.name : shortWard(w.name);
      const tw = text.length * 6.4 + 6;
      if (wpx < tw * 0.55 || hpx < 12) continue; // xã/phường quá nhỏ ở mức zoom này
      const pt = map.latLngToContainerPoint(w.label);
      if (pt.x < 0 || pt.y < 0 || pt.x > size.x || pt.y > size.y) continue;
      if (!fits(pt.x, pt.y, tw, 14)) continue;
      addLabel(w.label[0], w.label[1], text, `ward ${w.type === "phường" ? "urban" : w.type === "đặc khu" ? "special" : ""}`);
    }
  }
}

/** Tải/bỏ lớp xã/phường theo khung nhìn */
async function syncWards() {
  if (!enabled || !provinces) return;
  const z = map.getZoom();
  if (z < WARD_MIN_ZOOM) {
    for (const [, l] of wardLayers) l.remove();
    wardLayers.clear();
    setDetail(false);
    rebuildLabels();
    return;
  }
  const b = map.getBounds();
  const view = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  const want = provinces
    .filter((p) => p.bbox[0] < view[2] && p.bbox[2] > view[0] && p.bbox[1] < view[3] && p.bbox[3] > view[1])
    .filter((p) => p.geom.some((poly) => poly[0].some(([x, y]) => x > view[0] - 0.5 && x < view[2] + 0.5 && y > view[1] - 0.5 && y < view[3] + 0.5)))
    .slice(0, MAX_PROVINCES_LOADED);
  const wantCodes = new Set(want.map((p) => p.code));
  // Đang xem chi tiết trong Việt Nam (tâm bản đồ thuộc 1 tỉnh) → nhãn mới thay nhãn nền
  const c = map.getCenter();
  setDetail(!!provinceAt(c.lat, c.lng));
  for (const [code, l] of wardLayers) {
    if (!wantCodes.has(code)) { l.remove(); wardLayers.delete(code); }
  }
  await Promise.all(want.map(async (p) => {
    if (wardLayers.has(p.code)) return;
    try {
      const data = await loadWards(p.code);
      if (!enabled || map.getZoom() < WARD_MIN_ZOOM || wardLayers.has(p.code)) return;
      wardLayers.set(p.code, drawWardLayer(p.code, data).addTo(map));
    } catch (err) {
      console.warn(`Không tải được xã/phường tỉnh ${p.name}:`, err.message);
    }
  }));
  rebuildLabels();
}

// ----------------------------- Tô sáng -------------------------------------
function setHover(ward) {
  if (ward === hoverWard) return;
  hoverWard = ward;
  hoverLayer.clearLayers();
  if (ward) {
    L.polygon(toLatLngs(ward.geom), {
      renderer, interactive: false, color: "#ffd166", weight: 1.6, opacity: 0.9,
      fill: true, fillColor: "#ffd166", fillOpacity: 0.06,
    }).addTo(hoverLayer);
  }
}

/** Viền nổi bật xã/phường của địa điểm đang xem (null để bỏ) */
export async function highlightPlace(lat, lon) {
  selectedLayer?.clearLayers();
  if (lat == null || !enabled) return null;
  const place = await lookupPlace(lat, lon);
  if (place?.ward) {
    const w = (await loadWards(place.province.code)).wards.find((x) => x.code === place.ward.code);
    if (w) {
      L.polygon(toLatLngs(w.geom), {
        renderer, interactive: false, color: "#ffd166", weight: 2.2, opacity: 0.95, fill: false,
      }).addTo(selectedLayer);
    }
  }
  return place;
}

/**
 * Tên xã/phường tại điểm màn hình cho "picker" (chỉ dùng dữ liệu đã tải; không tải thêm).
 * Đồng thời tô sáng xã/phường dưới con trỏ.
 */
export function placeAtPoint(x, y) {
  if (!enabled || !provinces) return null;
  const ll = map.containerPointToLatLng([x, y]);
  const r = wardAtSync(ll.lat, ll.lng);
  setHover(map.getZoom() >= WARD_MIN_ZOOM ? r?.ward || null : null);
  if (!r) return null;
  return r.ward ? `${r.ward.name}, ${r.province.short}` : r.province.name;
}

export function clearHover() {
  setHover(null);
}

// ----------------------------- Khởi tạo / bật tắt --------------------------
export function initVnAdmin(m, { on = true, onDetailChange = null } = {}) {
  map = m;
  enabled = on;
  onDetail = onDetailChange;
  const pane = map.createPane("admin");
  pane.style.zIndex = 465;           // trên lớp màu (450) & nhãn nền (460), dưới bão (470)
  pane.style.pointerEvents = "none";
  const lp = map.createPane("adminLabels");
  lp.style.zIndex = 590;             // dưới ghim địa điểm (600)
  lp.style.pointerEvents = "none";

  renderer = L.canvas({ pane: "admin", padding: 0.3 });
  map.attributionControl.addAttribution(
    'Ranh giới hành chính: <a href="https://github.com/thanglequoc/vietnamese-provinces-database" target="_blank" rel="noopener">vietnamese-provinces-database</a> (MIT)');
  labelLayer = L.layerGroup().addTo(map);
  hoverLayer = L.layerGroup().addTo(map);
  selectedLayer = L.layerGroup().addTo(map);

  ready = getJSON(`${BASE}/provinces.json`).then(async (data) => {
    provinces = data.provinces;
    drawProvinces();
    await buildStaticLabels();
    if (enabled) {
      provLayer.addTo(map);
      staticLabels.addTo(map);
    }
    syncWards();
  }).catch((err) => {
    console.warn("Không tải được bản đồ hành chính:", err.message);
  });

  map.on("moveend", () => syncWards());
  map.on("zoomstart", () => labelLayer.clearLayers());
  return ready;
}

export function setVnAdmin(on) {
  enabled = on;
  if (!provinces) return;
  if (on) {
    provLayer.addTo(map);
    staticLabels.addTo(map);
    syncWards();
  } else {
    provLayer.remove();
    staticLabels.remove();
    for (const [, l] of wardLayers) l.remove();
    wardLayers.clear();
    labelLayer.clearLayers();
    hoverLayer.clearLayers();
    selectedLayer.clearLayers();
    setDetail(false);
  }
}
