// js/ui/storms.js
// Lớp bão / áp thấp nhiệt đới (dữ liệu GDACS – JTWC qua backend):
//   - quỹ đạo đã qua (nét liền) & dự báo (nét đứt), tô màu theo cấp bão
//   - nón sai số dự báo, các điểm theo thời gian (rê chuột xem giờ)
//   - biểu tượng xoáy tại vị trí mới nhất, bấm để xem chi tiết
//   - menu liệt kê bão đang hoạt động + bão trong 30 ngày qua
import { state, saveSettings } from "../state.js";
import { STORM_COLORS, STORM_CAT_LABEL } from "../config.js";
import { escapeHtml, fmtWind } from "../utils.js";
import { togglePopover } from "./controls.js";

const menu = document.getElementById("storm-menu");
const btn = document.getElementById("btn-storms");

let map = null;
const drawn = new Map();   // id → L.LayerGroup
const pinned = new Set();  // bão cũ người dùng chọn xem

const colorOf = (cat) => STORM_COLORS[cat] || "#c9d3de";

/** ISO (UTC) → "03/11 13:00" theo giờ Việt Nam (tự định dạng cho thống nhất mọi trình duyệt) */
function fmtVN(iso, withTime = true) {
  if (!iso) return "";
  const ms = Date.parse(iso.endsWith("Z") ? iso : iso + "Z");
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + 7 * 3600e3);
  const p = (n) => String(n).padStart(2, "0");
  const date = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`;
  return withTime ? `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : date;
}

/** Cấp của điểm quỹ đạo = cấp của đoạn có đầu mút gần điểm đó nhất */
function catNear(storm, lat, lon) {
  let best = "", bd = Infinity;
  for (const s of storm.segments) {
    for (const [a, b] of [s.coords[0], s.coords[s.coords.length - 1]]) {
      const d = (a - lat) ** 2 + (b - lon) ** 2;
      if (d < bd) { bd = d; best = s.cat; }
    }
  }
  return best;
}

function popupHtml(s) {
  const status = s.current ? `<span class="st-live">Đang hoạt động</span>` : `<span class="st-old">Đã tan</span>`;
  return `<div class="storm-pop">
    <div class="sp-head"><b>${escapeHtml(s.name)}</b>${status}</div>
    <div class="sp-cat">${escapeHtml(s.category)}${s.level ? ` · cấp ${s.level}` : ""}</div>
    <div class="sp-row"><span>Gió mạnh nhất</span><b>${s.maxWind ? fmtWind(s.maxWind) : "–"}</b></div>
    <div class="sp-row"><span>Thời gian</span><b>${fmtVN(s.from, false)} → ${fmtVN(s.to, false)}</b></div>
    ${s.advisory ? `<div class="sp-row"><span>Bản tin</span><b>${fmtVN(s.advisory)}</b></div>` : ""}
    ${s.countries ? `<div class="sp-row"><span>Ảnh hưởng</span><b>${escapeHtml(s.countries)}</b></div>` : ""}
    ${s.report ? `<a href="${escapeHtml(s.report)}" target="_blank" rel="noopener">Báo cáo chi tiết (GDACS) ↗</a>` : ""}
  </div>`;
}

function draw(storm) {
  if (drawn.has(storm.id)) return drawn.get(storm.id);
  const g = L.layerGroup();
  const opts = { pane: "storms", interactive: false };

  if (storm.cone?.length > 2) {
    L.polygon(storm.cone, {
      ...opts, color: "#ffffff", weight: 1, opacity: 0.55, dashArray: "4 4",
      fillColor: "#ffffff", fillOpacity: 0.08,
    }).addTo(g);
  }
  // Viền tối dưới quỹ đạo để nổi trên mọi lớp màu
  for (const s of storm.segments) {
    L.polyline(s.coords, { ...opts, color: "#060d17", weight: s.forecast ? 4 : 5, opacity: 0.55 }).addTo(g);
  }
  for (const s of storm.segments) {
    L.polyline(s.coords, {
      ...opts, color: colorOf(s.cat), weight: s.forecast ? 2 : 3,
      dashArray: s.forecast ? "6 6" : null, opacity: 0.95,
    }).addTo(g);
  }
  for (const p of storm.points) {
    const cat = catNear(storm, p.lat, p.lon);
    L.circleMarker([p.lat, p.lon], {
      pane: "storms", radius: p.forecast ? 3.5 : 4.5, weight: 1.5,
      color: "#060d17", fillColor: colorOf(cat), fillOpacity: p.forecast ? 0.6 : 1,
    })
      .bindTooltip(`${fmtVN(p.time)}${p.forecast ? " · dự báo" : ""}${cat ? " · " + (STORM_CAT_LABEL[cat] || cat) : ""}`,
        { direction: "top", offset: [0, -4], className: "storm-tip" })
      .addTo(g);
  }

  const icon = L.divIcon({
    className: "storm-anchor",
    html: `<div class="storm-icon${storm.current ? " live" : ""}">
        <span class="spin">🌀</span>
        <span class="sl"><b>${escapeHtml(storm.name)}</b><small>${escapeHtml(storm.category)}${storm.level ? " · cấp " + storm.level : ""}${storm.current ? "" : " · đã tan"}</small></span>
      </div>`,
    iconSize: [0, 0],
  });
  L.marker(storm.position, { icon, pane: "storms", zIndexOffset: 500, keyboard: false })
    .bindPopup(popupHtml(storm), { className: "storm-popup", maxWidth: 260 })
    .addTo(g);

  g.addTo(map);
  drawn.set(storm.id, g);
  return g;
}

function remove(id) {
  drawn.get(id)?.remove();
  drawn.delete(id);
}

function fitStorm(storm) {
  const pts = [storm.position, ...storm.points.map((p) => [p.lat, p.lon]), ...(storm.cone || [])];
  const wide = window.innerWidth > 760;
  map.fitBounds(L.latLngBounds(pts), {
    paddingTopLeft: [wide ? 90 : 20, 80],
    paddingBottomRight: [wide ? 390 : 20, wide ? 150 : 280],
    maxZoom: 7,
  });
}

/** Vẽ/ẩn bão đang hoạt động theo cài đặt; bão cũ theo lựa chọn của người dùng */
function sync() {
  for (const s of state.stormList) {
    const want = (s.current && state.storms) || pinned.has(s.id);
    if (want) draw(s);
    else remove(s.id);
  }
  const live = state.stormList.filter((s) => s.current).length;
  btn.classList.toggle("has-live", live > 0);
  btn.dataset.count = live || "";
  btn.title = live ? `${live} cơn bão / áp thấp đang hoạt động (phím B)` : "Bão & áp thấp nhiệt đới (phím B)";
}

function itemHtml(s) {
  const on = drawn.has(s.id);
  return `<button class="storm-item${on ? " active" : ""}" data-storm="${s.id}">
    <span class="si-dot" style="background:${s.current ? "#ff5a4d" : "#5b708a"}"></span>
    <span class="si-main"><b>${escapeHtml(s.name)}</b>
      <small>${escapeHtml(s.category)}${s.level ? " · cấp " + s.level : ""} · ${fmtVN(s.from, false)} – ${fmtVN(s.to, false)}</small>
      ${s.countries ? `<small class="si-c">${escapeHtml(s.countries)}</small>` : ""}</span>
    <span class="si-act">${on ? "✓" : "→"}</span>
  </button>`;
}

function renderMenu(status = "") {
  const live = state.stormList.filter((s) => s.current);
  const old = state.stormList.filter((s) => !s.current);
  const legend = [["TD", "Áp thấp NĐ"], ["TS", "Bão"], ["HU", "Bão rất mạnh"], ["ST", "Siêu bão"]]
    .map(([c, l]) => `<span><i style="background:${colorOf(c)}"></i>${l}</span>`).join("");
  menu.innerHTML = `
    <div class="pop-title">Bão & áp thấp nhiệt đới</div>
    <div class="set-row">
      <div class="set-label">Hiện bão đang hoạt động trên bản đồ</div>
      <div class="seg"><button data-show="1" class="${state.storms ? "active" : ""}">Hiện</button><button data-show="0" class="${state.storms ? "" : "active"}">Ẩn</button></div>
    </div>
    ${status ? `<div class="set-hint">${status}</div>` : ""}
    <div class="pop-group">Đang hoạt động</div>
    ${live.length ? live.map(itemHtml).join("") : `<div class="storm-empty">Hiện không có bão hay áp thấp nhiệt đới nào ở châu Á – Tây Thái Bình Dương. 🌤</div>`}
    ${old.length ? `<div class="pop-group">30 ngày qua · bấm để xem quỹ đạo</div>${old.map(itemHtml).join("")}` : ""}
    <div class="storm-legend">${legend}</div>
    <div class="set-hint">Nét liền: đường đi đã qua · nét đứt: dự báo · vùng trắng: nón sai số dự báo.
      Nguồn: <a href="https://www.gdacs.org/" target="_blank" rel="noopener">GDACS</a> (JTWC).</div>`;
}

/** @param {L.Map} m */
export function initStorms(m) {
  map = m;
  const pane = map.createPane("storms");
  pane.style.zIndex = 470; // trên lớp màu (450), radar (455), nhãn (460); dưới ghim (600)

  btn.addEventListener("click", () => {
    renderMenu();
    togglePopover(menu, btn);
  });
  menu.addEventListener("click", (e) => {
    const show = e.target.closest("[data-show]");
    if (show) {
      state.storms = show.dataset.show === "1";
      saveSettings();
      sync();
      return renderMenu();
    }
    const item = e.target.closest("[data-storm]");
    if (!item) return;
    const s = state.stormList.find((x) => x.id === item.dataset.storm);
    if (!s) return;
    if (!s.current && drawn.has(s.id)) {
      pinned.delete(s.id);
      remove(s.id);
    } else {
      if (!s.current) pinned.add(s.id);
      draw(s);
      fitStorm(s);
    }
    renderMenu();
  });
}

/** Nhận danh sách bão mới từ API */
export function setStorms(list) {
  const ids = new Set(list.map((s) => s.id));
  // Bỏ hình vẽ của bão đã có bản tin mới (id đổi theo episode) để vẽ lại
  for (const id of [...drawn.keys()]) if (!ids.has(id)) remove(id);
  for (const s of list) if (drawn.has(s.id)) remove(s.id);
  state.stormList = list;
  sync();
  if (!menu.hidden) renderMenu();
}

/** Bật/tắt hiển thị bão đang hoạt động (phím B) */
export function toggleStorms() {
  state.storms = !state.storms;
  saveSettings();
  sync();
  if (!menu.hidden) renderMenu();
  return state.storms;
}
