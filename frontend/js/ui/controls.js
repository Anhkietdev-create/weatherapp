// js/ui/controls.js
// Các điều khiển: đơn vị nhiệt độ, chọn lớp bản đồ (thanh bên + menu "Thêm"),
// bảng cài đặt bản đồ, chú giải màu, và toast thông báo loading/lỗi.
import { state, saveSettings } from "../state.js";
import { layerMeta, PRIMARY_LAYERS, LAYER_GROUPS, BASEMAPS, WIND_UNITS, ACC_PERIODS } from "../config.js";
import { gradientCss, fmtLayerNum, layerUnit } from "../utils.js";

const unitToggle = document.getElementById("unit-toggle");
const rail = document.getElementById("rail");
const toast = document.getElementById("toast");
const layerMenu = document.getElementById("layer-menu");
const settingsMenu = document.getElementById("settings-menu");
const moreBtn = document.getElementById("btn-more");
const settingsBtn = document.getElementById("btn-settings");
const stormMenu = document.getElementById("storm-menu");
const stormBtn = document.getElementById("btn-storms");

// ------------------------------ Popover chung ------------------------------
const popovers = [
  [layerMenu, moreBtn],
  [settingsMenu, settingsBtn],
  [stormMenu, stormBtn],
];

function closePopovers(except) {
  for (const [pop, btn] of popovers) {
    if (pop === except) continue;
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }
}

export function togglePopover(pop, btn) {
  const open = pop.hidden;
  closePopovers(pop);
  pop.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".popover, #btn-more, #btn-settings, #btn-storms")) closePopovers();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePopovers();
});

// ------------------------------ Đơn vị nhiệt độ ----------------------------
/** @param {() => void} onChange gọi khi đơn vị đổi */
export function initUnitToggle(onChange) {
  const sync = () =>
    unitToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.unit === state.unit));
  sync();
  unitToggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-unit]");
    if (!btn || btn.dataset.unit === state.unit) return;
    state.unit = btn.dataset.unit;
    saveSettings();
    sync();
    updateLegend();
    onChange();
  });
}

// ------------------------------ Chọn lớp -----------------------------------
function syncLayerButtons() {
  rail.querySelectorAll(".layer-btn[data-layer]").forEach((b) =>
    b.classList.toggle("active", b.dataset.layer === state.layer));
  const extra = !PRIMARY_LAYERS.includes(state.layer);
  moreBtn.classList.toggle("active", extra);
  moreBtn.querySelector("span").textContent = extra ? layerMeta[state.layer].short : "THÊM";
  layerMenu.querySelectorAll("[data-layer]").forEach((b) =>
    b.classList.toggle("active", b.dataset.layer === state.layer));
}

/** @param {(layer:string) => void} onChange gọi khi lớp bản đồ đổi */
export function initLayerRail(onChange) {
  // Menu "Thêm lớp" dựng từ cấu hình
  layerMenu.innerHTML =
    `<div class="pop-title">Lớp bản đồ</div>` +
    LAYER_GROUPS.map(([title, ids]) => `
      <div class="pop-group">${title}</div>
      <div class="layer-grid">
        ${ids.map((id) => `
          <button data-layer="${id}" title="${layerMeta[id].desc}">
            <span class="li">${layerMeta[id].icon}</span>
            <span class="lt">${layerMeta[id].label}</span>
          </button>`).join("")}
      </div>`).join("");

  function select(layer) {
    if (!layerMeta[layer] || layer === state.layer) return;
    state.layer = layer;
    saveSettings();
    syncLayerButtons();
    updateLegend();
    onChange(layer);
  }

  rail.addEventListener("click", (e) => {
    const btn = e.target.closest(".layer-btn[data-layer]");
    if (btn) select(btn.dataset.layer);
  });
  moreBtn.addEventListener("click", () => togglePopover(layerMenu, moreBtn));
  layerMenu.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-layer]");
    if (!btn) return;
    select(btn.dataset.layer);
    closePopovers();
  });

  // Phím tắt: 1–9 chọn lớp theo thứ tự trong menu
  const order = LAYER_GROUPS.flatMap(([, ids]) => ids);
  window.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9 && order[n - 1]) select(order[n - 1]);
  });

  syncLayerButtons();
}

// ------------------------------ Cài đặt bản đồ -----------------------------
const SETTINGS_SPEC = [
  { key: "basemap", label: "Nền bản đồ", options: Object.entries(BASEMAPS).map(([v, b]) => [v, b.label]) },
  { key: "labels", label: "Tên địa danh & ranh giới", options: [[true, "Hiện"], [false, "Ẩn"]] },
  { key: "particles", label: "Hạt chuyển động", options: [[true, "Bật"], [false, "Tắt"]] },
  {
    key: "iso", label: "Đường đẳng trị",
    options: [["auto", "Tự động"], ["pressure", "Đẳng áp"], ["temp", "Đẳng nhiệt"], ["none", "Tắt"]],
    hint: "Tự động: đẳng áp khi xem áp suất, đẳng nhiệt khi xem nhiệt độ",
  },
  {
    key: "accHours", label: "Mưa tích luỹ trong",
    options: Object.entries(ACC_PERIODS).map(([v, l]) => [v, l.replace(" tới", "")]),
    hint: "Áp dụng cho lớp ☔ Mưa tích luỹ (menu Thêm)",
  },
  { key: "windUnit", label: "Đơn vị gió", options: Object.entries(WIND_UNITS).map(([v, u]) => [v, u.label]) },
];

/** @param {(key:string) => void} onChange gọi sau khi một cài đặt đổi */
export function initSettings(onChange) {
  settingsMenu.innerHTML =
    `<div class="pop-title">Cài đặt bản đồ</div>` +
    SETTINGS_SPEC.map((s) => `
      <div class="set-row">
        <div class="set-label">${s.label}</div>
        <div class="seg" data-key="${s.key}">
          ${s.options.map(([v, l]) => `<button data-val="${v}">${l}</button>`).join("")}
        </div>
        ${s.hint ? `<div class="set-hint">${s.hint}</div>` : ""}
      </div>`).join("") +
    `<div class="set-hint keys">Phím tắt: <kbd>←</kbd><kbd>→</kbd> đổi giờ · <kbd>Space</kbd> phát ·
      <kbd>1</kbd>–<kbd>9</kbd> đổi lớp · <kbd>/</kbd> tìm kiếm · <kbd>R</kbd> radar · <kbd>B</kbd> bão</div>`;

  const sync = () =>
    settingsMenu.querySelectorAll(".seg").forEach((seg) => {
      const cur = String(state[seg.dataset.key]);
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.val === cur));
    });

  settingsBtn.addEventListener("click", () => togglePopover(settingsMenu, settingsBtn));
  settingsMenu.addEventListener("click", (e) => {
    const b = e.target.closest(".seg button");
    if (!b) return;
    const key = b.closest(".seg").dataset.key;
    const raw = b.dataset.val;
    const val = raw === "true" ? true : raw === "false" ? false : /^d+$/.test(raw) ? Number(raw) : raw;
    if (state[key] === val) return;
    state[key] = val;
    saveSettings();
    sync();
    if (key === "windUnit" || key === "accHours") updateLegend();
    onChange(key);
  });
  sync();
}

// ------------------------------ Chú giải -----------------------------------
export function updateLegend() {
  const m = layerMeta[state.layer];
  document.getElementById("legend-title").textContent =
    m.accum ? `${m.label} · ${ACC_PERIODS[state.accHours]}` : m.label;
  document.getElementById("legend-unit").textContent = layerUnit(state.layer);
  document.getElementById("legend-bar").style.background = gradientCss(m.stops);
  // Thang nhiều mốc thì chỉ ghi số ở mốc cách quãng để khỏi chồng chữ
  const n = m.stops.length;
  const every = n > 8 || (n > 6 && window.innerWidth <= 760) ? 2 : 1;
  document.getElementById("legend-ticks").innerHTML = m.stops
    .map(([v], i) => {
      const show = i % every === 0 || i === n - 1;
      return `<span style="left:${((i / (n - 1)) * 100).toFixed(1)}%">${show ? fmtLayerNum(state.layer, v) : ""}</span>`;
    })
    .join("");
  document.getElementById("legend").title = m.desc;
}

// ------------------------------ Toast --------------------------------------
let toastTimer = null;
/**
 * @param {string} message
 * @param {{error?:boolean, duration?:number}} opts duration > 0 thì tự ẩn
 */
export function showToast(message, { error = false, duration = 0 } = {}) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  if (duration) toastTimer = setTimeout(hideToast, duration);
}

export function hideToast() {
  clearTimeout(toastTimer);
  toast.classList.remove("show");
}
