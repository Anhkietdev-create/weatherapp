// js/ui/map.js
// Bản đồ nền thật (Leaflet + Esri) và các ghim địa điểm.
// Leaflet được nạp qua thẻ <script> nên dùng biến toàn cục `L`.
import { state } from "../state.js";
import { VN_BOUNDS, ASIA_BOUNDS, TIER_MIN_ZOOM, BASEMAPS, layerMeta } from "../config.js";
import {
  fmtDeg, windArrow, escapeHtml, fmtWindNum, fmtLayer, fmtLayerNum, fmtWind,
  dirFromUV, gridIndex,
} from "../utils.js";

let map;
const markers = new Map();   // id → { marker, el, loc }
let customMarker = null;     // ghim cho vị trí tự chọn (bấm bản đồ / tìm kiếm / GPS)
let baseLayer = null;        // nền bản đồ
let refLayer = null;         // nhãn địa danh + ranh giới (vẽ đè lên lớp màu)

const ATTRIBUTION =
  'Nền bản đồ &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> · ' +
  'Dữ liệu thời tiết: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>';

export function getMap() {
  return map;
}

const tierVisible = (tier) => map.getZoom() >= TIER_MIN_ZOOM[tier];

function updateTierClasses(el) {
  const z = map.getZoom();
  el.classList.toggle("show-t2", z >= TIER_MIN_ZOOM[2]);
  el.classList.toggle("show-t3", z >= TIER_MIN_ZOOM[3]);
}

/**
 * @param {HTMLElement} el phần tử chứa bản đồ
 * @param {(lat:number, lon:number) => void} onMapClick bấm vào vùng trống trên bản đồ
 */
export function initMap(el, onMapClick) {
  map = L.map(el, {
    zoomControl: false,
    minZoom: 3,
    maxZoom: 13,
    maxBounds: [[-40, 0], [85, 200]],
    maxBoundsViscosity: 0.8,
    worldCopyJump: false,
    zoomSnap: 0.25,
  });
  map.attributionControl.setPrefix(false);
  map.attributionControl.setPosition("bottomleft");

  // Pane cho nhãn địa danh/ranh giới: nằm TRÊN lớp màu (450) & radar (455),
  // dưới ghim (600) — giống Windy, đường biên luôn rõ dù lớp màu đậm.
  const refPane = map.createPane("labels");
  refPane.style.zIndex = 460;
  refPane.style.pointerEvents = "none";

  setBasemap(state.basemap, state.labels);
  fitAsia(false);

  map.on("click", (e) => onMapClick(e.latlng.lat, e.latlng.lng));
  map.on("zoomend", () => {
    updateTierClasses(el);
    declutter();
  });
  map.on("moveend resize", declutter);
  updateTierClasses(el);
  return map;
}

/** Đổi nền bản đồ (dark | terrain | satellite) và bật/tắt lớp nhãn + ranh giới */
export function setBasemap(name, labels = true) {
  const b = BASEMAPS[name] || BASEMAPS.dark;
  baseLayer?.remove();
  refLayer?.remove();
  baseLayer = L.tileLayer(b.url, { maxNativeZoom: b.maxNative, maxZoom: 18, attribution: ATTRIBUTION }).addTo(map);
  refLayer = labels
    ? L.tileLayer(b.ref, { pane: "labels", maxNativeZoom: 13, maxZoom: 18, opacity: name === "dark" ? 0.9 : 1 }).addTo(map)
    : null;
  map.getContainer().dataset.basemap = name;
}

function fitTo(bounds, animate) {
  const wide = window.innerWidth > 760;
  map.fitBounds(bounds, {
    paddingTopLeft: [wide ? 80 : 10, 70],
    paddingBottomRight: [wide ? 380 : 10, wide ? 120 : 260],
    animate,
  });
}

/** Xem toàn bộ Việt Nam (gồm Hoàng Sa, Trường Sa) */
export function fitVietnam(animate = true) { fitTo(VN_BOUNDS, animate); }
/** Xem toàn châu Á */
export function fitAsia(animate = true) { fitTo(ASIA_BOUNDS, animate); }

export function zoomIn() { map.zoomIn(); }
export function zoomOut() { map.zoomOut(); }

/** Nội dung nhãn của ghim theo lớp đang chọn + giờ đang xem */
function labelValue(id) {
  const m = layerMeta[state.layer];
  if (m.source === "air") {
    const g = state.extra.air?.grids.find((x) => x.name === "locations");
    const p = g?.byId?.[id];
    const v = p ? p.pm25[gridIndex(g, state.times[state.hourIdx])] : null;
    return v == null ? "" : fmtLayerNum("pm25", v);
  }
  if (m.source !== "base") return "";
  const ov = state.overviewById[id];
  if (!ov) return "";
  const i = Math.min(state.hourIdx, ov.temp.length - 1);
  const v = ov[m.key]?.[i];
  if (v == null) return "";
  switch (state.layer) {
    case "temp": return `${ov.icon[i]} ${fmtDeg(v)}`;
    case "feels": case "dew": return fmtDeg(v);
    case "wind": case "gust": return `${windArrow(ov.dir[i], 11)} ${fmtWindNum(v)}`;
    case "rain": return v > 0 ? `${v} mm` : "0";
    case "humidity": case "cloud": return `${v}%`;
    default: return fmtLayerNum(state.layer, v);
  }
}

/** Vẽ toàn bộ ghim địa điểm (gọi 1 lần sau khi có danh sách) */
export function renderPins(locations, onSelect) {
  markers.forEach(({ marker }) => marker.remove());
  markers.clear();

  // Vẽ cấp thấp trước để địa điểm quan trọng nằm phía trên
  const sorted = [...locations].sort((a, b) => b.tier - a.tier);
  for (const loc of sorted) {
    const el = document.createElement("div");
    el.className = `pin t${loc.tier}`;
    el.dataset.id = loc.id;
    el.title = `${loc.name} · ${loc.country === "Việt Nam" ? loc.province : loc.country}`;
    el.innerHTML = `<div class="label"><b>${escapeHtml(loc.name)}</b> <span class="val"></span></div><div class="dot"></div>`;

    const marker = L.marker([loc.lat, loc.lon], {
      icon: L.divIcon({ className: "pin-anchor", html: el, iconSize: [0, 0], iconAnchor: [0, 0] }),
      zIndexOffset: (4 - loc.tier) * 1000,
      keyboard: false,
    }).addTo(map);
    marker.on("click", () => onSelect(loc));
    markers.set(loc.id, { marker, el, loc });
  }
  updatePinLabels();
}

/** Cập nhật giá trị trên ghim khi đổi giờ / lớp / đơn vị */
export function updatePinLabels() {
  markers.forEach(({ el }, id) => {
    el.querySelector(".val").innerHTML = labelValue(id);
  });
  declutter();
}

export function highlightActive(id) {
  markers.forEach(({ el, marker, loc }, mid) => {
    const on = mid === id;
    el.classList.toggle("active", on);
    marker.setZIndexOffset(on ? 9000 : (4 - loc.tier) * 1000);
  });
  if (id && customMarker) {
    customMarker.remove();
    customMarker = null;
  }
  declutter();
}

/** Đặt ghim cho vị trí tự chọn (không thuộc danh sách có sẵn) */
export function setCustomMarker(lat, lon, name) {
  highlightActive(null);
  if (customMarker) customMarker.remove();
  const el = document.createElement("div");
  el.className = "pin custom active";
  el.innerHTML = `<div class="label"><b>${escapeHtml(name)}</b></div><div class="dot"></div>`;
  customMarker = L.marker([lat, lon], {
    icon: L.divIcon({ className: "pin-anchor", html: el, iconSize: [0, 0], iconAnchor: [0, 0] }),
    zIndexOffset: 10000,
    interactive: false,
  }).addTo(map);
}

export function updateCustomMarkerName(name) {
  if (customMarker) {
    const b = customMarker.getElement()?.querySelector(".label b");
    if (b) b.textContent = name;
  }
}

/**
 * Vùng bản đồ còn nhìn thấy (không bị panel/timeline/topbar che), toạ độ
 * container px: [x1, y1, x2, y2].
 */
function visibleRect() {
  const size = map.getSize();
  // Khi chọn địa điểm, panel luôn được mở → luôn chừa chỗ cho panel
  const mobile = window.innerWidth <= 760;
  const top = 70;
  if (mobile) {
    const ph = Math.min(window.innerHeight * 0.52, size.y - 250) + 170;
    return [10, top, size.x - 10, Math.max(top + 80, size.y - ph)];
  }
  return [90, top, size.x - 380, size.y - 120];
}

/** Đưa bản đồ tới vị trí (chỉ di chuyển nếu vị trí đang bị che / ngoài màn hình) */
export function focusOn(lat, lon, minZoom = 0) {
  const zoom = Math.max(map.getZoom(), minZoom);
  const [x1, y1, x2, y2] = visibleRect();
  const p = map.latLngToContainerPoint([lat, lon]);
  const padX = (x2 - x1) * 0.12, padY = (y2 - y1) * 0.12;
  const inside = p.x > x1 + padX && p.x < x2 - padX && p.y > y1 + padY && p.y < y2 - padY;
  if (inside && zoom === map.getZoom()) return;

  // Tính tâm bản đồ sao cho điểm nằm giữa vùng nhìn thấy
  const size = map.getSize();
  const offset = L.point((x1 + x2) / 2 - size.x / 2, (y1 + y2) / 2 - size.y / 2);
  const target = map.unproject(map.project([lat, lon], zoom).subtract(offset), zoom);
  map.flyTo(target, zoom, { duration: 0.8 });
}

/**
 * "Picker" giống Windy: rê chuột trên bản đồ để xem giá trị lớp đang chọn
 * (nội suy) cùng hướng/tốc độ gió tại con trỏ. Chỉ bật trên thiết bị có chuột.
 * @param {(x:number, y:number) => ({value,mask,u,v}|null)} sampler
 */
export function initPicker(sampler) {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const el = document.getElementById("picker");
  let last = null, queued = false;

  function render() {
    queued = false;
    if (!last) return (el.hidden = true);
    const s = sampler(last.x, last.y);
    if (!s || s.mask < 0.25) return (el.hidden = true);
    const m = layerMeta[state.layer];
    let sub = "";
    if (s.u != null && m.flow === "wind" && state.layer !== "wind") {
      const spd = Math.hypot(s.u, s.v);
      sub = `<span class="pk-sub">${windArrow(dirFromUV(s.u, s.v), 11)} ${fmtWind(spd)}</span>`;
    } else if (state.layer === "wind" || state.layer === "waves") {
      if (s.u != null) sub = `<span class="pk-sub">${windArrow(dirFromUV(s.u, s.v), 11)}</span>`;
    }
    el.innerHTML = `<b>${fmtLayer(state.layer, s.value)}</b>${sub}`;
    el.style.transform = `translate(${last.x + 14}px, ${last.y - 34}px)`;
    el.hidden = false;
  }

  map.on("mousemove", (e) => {
    last = e.containerPoint;
    if (!queued) { queued = true; requestAnimationFrame(render); }
  });
  map.on("mouseout movestart zoomstart", () => { last = null; el.hidden = true; });
  return { refresh: () => last && render() };
}

/** Mức zoom tối thiểu để thấy được một địa điểm theo cấp của nó */
export function minZoomFor(loc) {
  return TIER_MIN_ZOOM[loc.tier] || 0;
}

/**
 * Ẩn bớt nhãn bị chồng lên nhau: ưu tiên ghim đang chọn → cấp 1 → cấp 2 → cấp 3.
 * Ghim bị ẩn nhãn vẫn còn chấm tròn để bấm được.
 */
let declutterQueued = false;
function declutter() {
  if (declutterQueued) return;
  declutterQueued = true;
  requestAnimationFrame(() => {
    declutterQueued = false;
    const size = map.getSize();
    const items = [];
    markers.forEach(({ el, loc }) => {
      const active = el.classList.contains("active");
      if (!active && !tierVisible(loc.tier)) return;
      const p = map.latLngToContainerPoint([loc.lat, loc.lon]);
      if (p.x < -100 || p.y < -50 || p.x > size.x + 100 || p.y > size.y + 50) return;
      const label = el.querySelector(".label");
      const w = label.offsetWidth || 60, h = label.offsetHeight || 18;
      const prio = active ? 0 : loc.tier;
      items.push({ label, prio, rect: { x1: p.x - w / 2, x2: p.x + w / 2, y1: p.y - h - 8, y2: p.y - 4 } });
    });
    items.sort((a, b) => a.prio - b.prio);
    const placed = [];
    for (const it of items) {
      const r = it.rect;
      const hit = placed.some((q) => r.x1 < q.x2 + 2 && r.x2 > q.x1 - 2 && r.y1 < q.y2 && r.y2 > q.y1);
      it.label.classList.toggle("hidden", hit && it.prio > 0);
      if (!hit || it.prio === 0) placed.push(r);
    }
  });
}
