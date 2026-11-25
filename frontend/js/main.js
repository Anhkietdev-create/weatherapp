// js/main.js
// Điểm vào của ứng dụng: tải dữ liệu từ backend rồi kết nối toàn bộ UI.
import { state, saveSettings } from "./state.js";
import * as api from "./api.js";
import { layerMeta, DEFAULT_LOCATION_ID, REFRESH_MS } from "./config.js";
import { toUnit, gridIndex, sumRange } from "./utils.js";
import {
  initMap,
  renderPins,
  updatePinLabels,
  highlightActive,
  setCustomMarker,
  removeCustomMarker,
  updateCustomMarkerName,
  focusOn,
  fitVietnam,
  fitAsia,
  zoomIn,
  zoomOut,
  minZoomFor,
  setBasemap,
  initPicker,
} from "./ui/map.js";
import { initField } from "./ui/fieldLayer.js";
import { initRadar, setRadar, refreshRadar } from "./ui/radar.js";
import { initStorms, setStorms, toggleStorms } from "./ui/storms.js";
import {
  initGeolocate,
  getPosition,
  permissionState,
  geoSupported,
  geoErrorMessage,
  showUserMarker,
  markReported,
  startWatch,
  stopWatch,
  isWatching,
} from "./ui/geolocate.js";
import { initSearch } from "./ui/search.js";
import {
  renderPanel,
  renderLoading,
  closePanel,
  initPanelInteractions,
} from "./ui/panel.js";
import {
  buildTicks,
  updateCurve,
  positionPlayhead,
  initTimelineInteractions,
} from "./ui/timeline.js";
import {
  initUnitToggle,
  initLayerRail,
  initSettings,
  updateLegend,
  showToast,
  hideToast,
} from "./ui/controls.js";

let field = null;
let picker = null;
let loadSeq = 0;
let lastRefresh = 0;
const extraLoading = {};

// ---------------------------------------------------------------------------
// Bản đồ: dựng dữ liệu cho lớp màu + đường đẳng trị + hạt chuyển động
// ---------------------------------------------------------------------------

/** Vector chuyển động từ tốc độ + hướng khí tượng (hướng THỔI TỪ) */
function toUV(speed, dirDeg) {
  const rad = (dirDeg * Math.PI) / 180;
  return { u: -speed * Math.sin(rad), v: -speed * Math.cos(rad) };
}

/** Đường đẳng trị cần vẽ theo cài đặt + lớp đang xem */
function isoSpec() {
  let which = state.iso;
  if (which === "auto") {
    which = state.layer === "pressure" ? "pressure"
      : ["temp", "feels", "dew"].includes(state.layer) ? "temp" : "none";
  }
  if (which === "pressure") {
    return { key: "pressure", step: (z) => (z < 5 ? 4 : 2), fmt: (v) => String(v) };
  }
  if (which === "temp") {
    return {
      key: "temp",
      step: () => (state.unit === "C" ? 2 : 4),
      conv: toUnit,
      fmt: (v) => `${Math.round(v)}°`,
    };
  }
  return null;
}

/**
 * Điểm từ lưới chính (địa điểm + lưới Việt Nam + lưới châu Á) tại giờ đang xem:
 * luôn có vector gió (u, v); thêm `val` nếu lớp lấy từ lưới chính, `iso` nếu
 * đang vẽ đường đẳng trị. Lớp cộng dồn (mưa tích luỹ) lấy tổng từ giờ đầu
 * timeline ("bây giờ") trong state.accHours giờ — không phụ thuộc giờ đang xem.
 * @param {object|null} m layerMeta của lớp (null nếu lớp không lấy từ lưới chính)
 */
function basePoints(m, isoKey) {
  const time = state.times[state.hourIdx];
  const out = [];
  const push = (lat, lon, d, j, j0) => {
    if (j < 0) return;
    const spd = d.wind[j], dir = d.dir[j];
    if (spd == null || dir == null) return;
    const p = { lat, lon, ...toUV(spd, dir) };
    if (m) {
      const v = m.accum ? sumRange(d[m.key], j0, state.accHours) : d[m.key]?.[j];
      if (v == null) return;
      p.val = v;
    }
    if (isoKey) {
      const v = d[isoKey]?.[j];
      if (v == null) return;
      p.iso = v;
    }
    out.push(p);
  };
  for (const loc of state.locations) {
    const ov = state.overviewById[loc.id];
    if (ov) push(loc.lat, loc.lon, ov, state.hourIdx, 0);
  }
  for (const grid of state.grids) {
    const j = gridIndex(grid, time);
    const j0 = gridIndex(grid, state.times[0]);
    for (const p of grid.points) push(p.lat, p.lon, p, j, j0);
  }
  return out;
}

/** Điểm từ lưới phụ (sóng / bụi mịn) tại giờ đang xem */
function extraPoints(m) {
  const set = state.extra[m.source];
  if (!set) return [];
  const time = state.times[state.hourIdx];
  const out = [];
  for (const grid of set.grids) {
    const j = gridIndex(grid, time);
    if (j < 0) continue;
    for (const p of grid.points) {
      const v = p[m.key]?.[j];
      if (v == null) continue;
      const pt = { lat: p.lat, lon: p.lon, r: p.r, val: v };
      if (m.flow === "wave") {
        const dir = p.wdir?.[j];
        if (dir == null) continue;
        // Hạt sóng: tốc độ tỉ lệ độ cao sóng, đi theo hướng truyền sóng
        Object.assign(pt, toUV(8 + v * 10, dir));
      }
      out.push(pt);
    }
  }
  return out;
}

function buildFieldInput() {
  const m = layerMeta[state.layer];
  const iso = isoSpec();
  const fromBase = m.source === "base";
  const base = basePoints(fromBase ? m : null, iso?.key);
  const baseSpec = { pts: base, reach: 550, fade: 400 };

  let value, flow;
  if (fromBase) {
    value = baseSpec;
    flow = baseSpec;
  } else {
    const ex = extraPoints(m);
    value = { pts: ex, reach: m.reach ?? 550, fade: m.fade ?? 400 };
    flow = m.flow === "wave" ? value : baseSpec;
  }
  return { layer: state.layer, value, flow, iso: iso ? { ...baseSpec, ...iso } : null };
}

function refreshMapLayers() {
  if (field && state.overview) field.setData(buildFieldInput());
  updatePinLabels();
  picker?.refresh();
}

/** Tải lưới phụ (sóng / bụi mịn) khi lớp cần đến nó */
async function ensureExtra(source, { silent = false } = {}) {
  if (source === "base" || extraLoading[source]) return;
  if (state.extra[source] && !silent) return;
  extraLoading[source] = true;
  const label = source === "marine" ? "sóng biển" : "bụi mịn PM2.5";
  if (!silent) showToast(`Đang tải dữ liệu ${label} (lần đầu có thể mất ~1 phút)…`);
  try {
    const data = await api.fetchExtra(source);
    for (const g of data.grids) {
      if (g.name === "locations") g.byId = Object.fromEntries(g.points.map((p) => [p.id, p]));
    }
    state.extra[source] = data;
    if (!silent) hideToast();
    refreshMapLayers();
  } catch (err) {
    console.warn(`Không tải được lưới ${source}:`, err.message);
    if (!silent) showToast(`Không tải được dữ liệu ${label}. Thử lại sau.`, { error: true, duration: 5000 });
  } finally {
    extraLoading[source] = false;
  }
}

async function loadGrid() {
  try {
    state.grids = (await api.fetchGrid()).grids;
    refreshMapLayers();
  } catch (err) {
    console.warn("Không tải được lưới:", err.message);
  }
}

function onHourChange() {
  refreshMapLayers();
  if (state.weather) renderPanel(state.weather);
}

function onLayerChange() {
  refreshMapLayers();
  ensureExtra(layerMeta[state.layer].source);
}

function onSettingChange(key) {
  switch (key) {
    case "basemap":
    case "labels":
      setBasemap(state.basemap, state.labels);
      break;
    case "particles":
      field?.setParticles(state.particles);
      break;
    case "autoLocate":
      if (state.autoLocate) hideGeoBanner();
      break;
    case "windUnit":
      updatePinLabels();
      if (state.weather) renderPanel(state.weather);
      break;
    default:
      refreshMapLayers();
  }
}

/** Tải danh sách bão (không báo lỗi lên màn hình — đây là thông tin phụ) */
async function loadStorms() {
  try {
    const { storms } = await api.fetchStorms(30);
    setStorms(storms);
    if (state.weather) renderPanel(state.weather); // cập nhật cảnh báo bão gần
  } catch (err) {
    console.warn("Không tải được dữ liệu bão:", err.message);
  }
}

function toggleRadar(on = !state.radar) {
  state.radar = on;
  saveSettings();
  document.getElementById("btn-radar").classList.toggle("active", on);
  setRadar(on);
}

// ---------------------------------------------------------------------------
// Chọn địa điểm
// ---------------------------------------------------------------------------
function setHash(h) {
  history.replaceState(null, "", h ? `#${h}` : location.pathname);
}

async function loadWeather(fetcher, name, { silent = false, after } = {}) {
  const seq = ++loadSeq;
  if (!silent) {
    renderLoading(name);
    showToast(`Đang tải dự báo ${name}…`);
  }
  try {
    const w = await fetcher();
    if (seq !== loadSeq) return; // người dùng đã chọn nơi khác trong lúc chờ
    state.weather = w;
    hideToast();
    renderPanel(w);
    updateCurve(w.hourly.map((h) => h.temp));
    document.title = `${w.location.name} ${Math.round(w.hourly[0].temp)}° · Luồng Gió`;
    after?.(w);
  } catch (err) {
    if (seq !== loadSeq) return;
    console.error(err);
    showToast(err.message || "Không tải được dữ liệu thời tiết.", {
      error: true,
      duration: 5000,
    });
  }
}

function selectLocation(loc, { fly = true } = {}) {
  state.active = { ...loc };
  highlightActive(loc.id);
  setHash(loc.id);
  if (fly) focusOn(loc.lat, loc.lon, minZoomFor(loc));
  return loadWeather(() => api.fetchWeather(loc.id), loc.name);
}

function selectPoint(lat, lon, { name = "", sub = "", zoom = 0 } = {}) {
  state.active = { id: null, lat, lon, name, sub };
  setCustomMarker(lat, lon, name || "Đang tải…");
  setHash(`@${lat.toFixed(4)},${lon.toFixed(4)}`);
  if (zoom) focusOn(lat, lon, zoom);
  return loadWeather(
    () => api.fetchForecastAt(lat, lon, name, sub),
    name || "vị trí đã chọn",
    {
      after: (w) => updateCustomMarkerName(w.location.name),
    },
  );
}

function reloadActive() {
  const a = state.active;
  if (!a) return;
  if (a.gps) return selectMyLocation(a.gps, { fly: false, silent: true });
  if (a.id)
    return loadWeather(() => api.fetchWeather(a.id), a.name, { silent: true });
  return loadWeather(() => api.fetchForecastAt(a.lat, a.lon, a.name, a.sub), a.name, {
    silent: true,
  });
}

// ---------------------------------------------------------------------------
// Vị trí thực của người dùng (GPS / Wi-Fi của thiết bị)
// ---------------------------------------------------------------------------
const locateBtn = () => document.getElementById("btn-locate");

/** Tải dự báo tại vị trí GPS, kèm tên địa danh thật (phường/xã, tỉnh/thành) */
function selectMyLocation(pos, { fly = true, silent = false } = {}) {
  showUserMarker(pos);
  markReported(pos);
  removeCustomMarker();
  highlightActive(null);
  state.active = { id: null, lat: pos.lat, lon: pos.lon, name: "Vị trí của bạn", gps: pos };
  setHash("me");
  if (fly) focusOn(pos.lat, pos.lon, 10);
  return loadWeather(async () => {
    const [w, place] = await Promise.all([
      api.fetchForecastAt(pos.lat, pos.lon),
      api.reverse(pos.lat, pos.lon).catch(() => null),
    ]);
    if (place?.name) {
      w.location.name = place.name;
      const detail = [place.road && place.road !== place.name ? place.road : null, place.province];
      w.location.province = detail.filter(Boolean).join(" · ") || w.location.province;
      if (place.country) w.location.country = place.country;
    }
    w.location.gps = { accuracy: pos.accuracy, at: pos.at, watching: isWatching() };
    if (state.active?.gps === pos) state.active.name = w.location.name;
    return w;
  }, "vị trí của bạn", { silent });
}

/** Người dùng di chuyển xa → cập nhật dự báo nếu đang xem vị trí của mình */
function onMoved(pos) {
  if (state.active?.gps) {
    selectMyLocation(pos, { fly: false, silent: true });
    showToast("Bạn đã di chuyển — đã cập nhật dự báo tại vị trí mới", { duration: 3000 });
  } else {
    markReported(pos);
  }
}

function setFollowing(on) {
  if (on) {
    startWatch(onMoved, (err) => {
      if (err.code === 1) setFollowing(false);
    });
  } else {
    stopWatch();
  }
  locateBtn().classList.toggle("active", isWatching());
  locateBtn().title = isWatching()
    ? "Đang theo dõi vị trí của bạn — bấm để tắt"
    : "Dự báo tại vị trí của tôi";
  if (state.weather?.location.gps) {
    state.weather.location.gps.watching = isWatching();
    renderPanel(state.weather);
  }
}

/**
 * Xác định vị trí rồi mở dự báo tại đó + bật theo dõi khi di chuyển.
 * @returns {Promise<boolean>} thành công hay không
 */
async function locateMe({ silent = false, fly = true } = {}) {
  hideGeoBanner();
  if (!geoSupported()) {
    if (!silent) showToast("Trình duyệt không hỗ trợ định vị.", { error: true, duration: 4000 });
    return false;
  }
  if (!silent) showToast("Đang xác định vị trí của bạn…");
  try {
    const pos = await getPosition();
    await selectMyLocation(pos, { fly });
    setFollowing(true);
    return true;
  } catch (err) {
    console.warn("Định vị lỗi:", err.message || err.code);
    if (!silent) showToast(geoErrorMessage(err), { error: true, duration: 6000 });
    else hideToast();
    return false;
  }
}

/** Nút định vị: lần đầu → lấy vị trí; đang xem vị trí mình & đang theo dõi → tắt theo dõi */
function onLocateClick() {
  if (isWatching() && state.active?.gps) {
    setFollowing(false);
    showToast("Đã tắt theo dõi vị trí", { duration: 2000 });
  } else {
    locateMe();
  }
}

// Thanh hỏi quyền vị trí (chỉ hiện khi người dùng chưa từng chọn)
const geoBanner = () => document.getElementById("geo-banner");
function showGeoBanner() { geoBanner().hidden = false; }
function hideGeoBanner() { geoBanner().hidden = true; }

function initGeoBanner() {
  geoBanner().addEventListener("click", (e) => {
    const b = e.target.closest("[data-geo]");
    if (!b) return;
    state.autoLocate = b.dataset.geo === "yes";
    saveSettings();
    hideGeoBanner();
    if (state.autoLocate) locateMe();
  });
}

// ---------------------------------------------------------------------------
// Dữ liệu tổng quan (mọi địa điểm) + tự làm mới định kỳ
// ---------------------------------------------------------------------------
async function loadOverview() {
  const ov = await api.fetchOverview();
  // Nếu mốc giờ đầu đã trôi (vd sang giờ mới) thì dịch giờ đang xem cho khớp
  if (state.times.length && ov.times[0] !== state.times[0]) {
    const idx = ov.times.indexOf(state.times[state.hourIdx]);
    state.hourIdx = idx >= 0 ? idx : 0;
  }
  state.overview = ov;
  state.times = ov.times;
  state.overviewById = Object.fromEntries(ov.locations.map((l) => [l.id, l]));
  lastRefresh = Date.now();
  buildTicks();
  positionPlayhead();
  refreshMapLayers();
  if (state.weather) renderPanel(state.weather);
}

async function periodicRefresh() {
  try {
    await loadOverview();
    await reloadActive();
    loadGrid();
    for (const source of Object.keys(state.extra)) ensureExtra(source, { silent: true });
    refreshRadar();
    loadStorms();
  } catch (err) {
    console.warn("Làm mới thất bại:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Khởi động
// ---------------------------------------------------------------------------
async function initialSelection() {
  const h = decodeURIComponent(location.hash.slice(1));
  const selectDefault = () => {
    const loc = state.locations.find((l) => l.id === DEFAULT_LOCATION_ID);
    if (loc) return selectLocation(loc, { fly: false });
  };
  const locateOrDefault = async () => {
    if (!(await locateMe({ silent: true }))) return selectDefault();
  };

  if (h === "me") return locateOrDefault();
  const m = h.match(/^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (m) return selectPoint(+m[1], +m[2], { zoom: 8 });
  const loc = h && state.locations.find((l) => l.id === h);
  if (loc) return selectLocation(loc, { fly: true });

  // Không có địa điểm trong link → mở tại vị trí thực nếu người dùng đã đồng ý
  const perm = await permissionState();
  if (perm !== "denied" && (state.autoLocate === true || (state.autoLocate !== false && perm === "granted"))) {
    return locateOrDefault();
  }
  if (state.autoLocate == null && perm !== "denied") showGeoBanner();
  return selectDefault();
}

async function init() {
  if (typeof L === "undefined") {
    showToast("Không tải được thư viện bản đồ. Kiểm tra kết nối Internet.", {
      error: true,
    });
    return;
  }

  const map = initMap(document.getElementById("map"), (lat, lon) => {
    document.getElementById("hint").classList.add("gone");
    selectPoint(lat, lon);
  });
  field = initField(map);
  field.setParticles(state.particles);
  picker = initPicker((x, y) => field.sampleAt(x, y));
  initRadar(map, document.getElementById("radar-badge"));
  initStorms(map);
  initGeolocate(map);
  if (state.radar) toggleRadar(true);

  updateLegend();
  initUnitToggle(() => {
    updatePinLabels();
    refreshMapLayers();
    if (state.weather) renderPanel(state.weather);
  });
  initLayerRail(onLayerChange);
  initSettings(onSettingChange);
  initTimelineInteractions(onHourChange);
  initPanelInteractions({ onToast: (msg) => showToast(msg, { duration: 2500 }) });
  initSearch((item) => {
    if (item.kind === "location") {
      const loc = state.locations.find((l) => l.id === item.id);
      if (loc) return selectLocation(loc);
    }
    selectPoint(item.lat, item.lon, {
      name: item.name,
      sub: item.sub,
      zoom: 9,
    });
  });

  document.getElementById("panel-close").addEventListener("click", closePanel);
  document.getElementById("btn-locate").addEventListener("click", onLocateClick);
  initGeoBanner();
  document.getElementById("btn-radar").addEventListener("click", () => toggleRadar());
  document
    .getElementById("btn-asia")
    .addEventListener("click", () => fitAsia());
  document
    .getElementById("btn-vn")
    .addEventListener("click", () => fitVietnam());
  document.getElementById("btn-zoom-in").addEventListener("click", zoomIn);
  document.getElementById("btn-zoom-out").addEventListener("click", zoomOut);
  window.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if (e.key === "Escape") closePanel();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "r" || e.key === "R") toggleRadar();
    if (e.key === "b" || e.key === "B") {
      showToast(toggleStorms() ? "Hiện bão đang hoạt động" : "Đã ẩn lớp bão", { duration: 1800 });
    }
  });
  setTimeout(() => document.getElementById("hint").classList.add("gone"), 9000);

  showToast("Đang tải dữ liệu thời tiết châu Á…");
  try {
    state.locations = await api.fetchCities();
    renderPins(state.locations, (loc) => selectLocation(loc, { fly: false }));
  } catch (err) {
    console.error(err);
    showToast(
      "Không kết nối được tới máy chủ. Kiểm tra backend đã chạy chưa?",
      { error: true },
    );
    return;
  }

  // Tải tổng quan và dự báo địa điểm đầu tiên song song
  const overviewP = loadOverview().catch((err) => {
    console.error(err);
    showToast("Không tải được dữ liệu bản đồ. Đang thử lại…", {
      error: true,
      duration: 5000,
    });
    setTimeout(periodicRefresh, 15000);
  });
  loadGrid(); // không chờ — bản đồ hiện ngay với dữ liệu trạm, lưới bổ sung sau
  loadStorms();
  await Promise.all([overviewP, initialSelection()]);
  ensureExtra(layerMeta[state.layer].source); // lớp đã lưu từ lần trước có thể cần lưới phụ

  setInterval(periodicRefresh, REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastRefresh > REFRESH_MS)
      periodicRefresh();
  });
}

init();
