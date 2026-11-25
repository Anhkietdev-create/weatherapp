// js/ui/panel.js
// Panel chi tiết: thời tiết tại giờ đang xem, cảnh báo, các chỉ số, AQI, mặt
// trời, dải giờ 5 ngày, biểu đồ nhiệt độ + mưa, dự báo 10 ngày và so sánh các
// mô hình dự báo (ECMWF / GFS / ICON / JMA).
import { state, isFavorite, toggleFavorite } from "../state.js";
import { dayNamesLong, MODEL_COLORS } from "../config.js";
import * as api from "../api.js";
import {
  fmtDeg, fmtTemp, toUnit, fmtHour, fmtClock, fmtDate, fmtDow, parseLocal,
  windDirName, windArrow, beaufort, aqiInfo, uvInfo, escapeHtml,
  fmtWind, fmtWindNum, windUnitLabel, distanceKm,
} from "../utils.js";

const panel = document.getElementById("panel");
const $ = (id) => document.getElementById(id);

export function openPanel() { panel.classList.remove("closed"); }
export function closePanel() { panel.classList.add("closed"); }
export function isPanelOpen() { return !panel.classList.contains("closed"); }

/** Báo cho các module khác biết giờ đang xem đã đổi */
function setHour(i) {
  state.hourIdx = Math.max(0, Math.min(state.times.length - 1, i));
  window.dispatchEvent(new CustomEvent("hour-changed"));
}

/**
 * Vị trí trong weather.hourly tương ứng với giờ đang chọn trên timeline.
 * Timeline chạy theo giờ Việt Nam, còn dự báo chi tiết theo giờ địa phương
 * → so khớp qua trường `vn` (cùng thời điểm, quy đổi ra giờ Việt Nam).
 */
export function hourIndexIn(weather) {
  const t = state.times[state.hourIdx];
  const i = t ? weather.hourly.findIndex((h) => h.vn === t) : -1;
  return i >= 0 ? i : Math.min(state.hourIdx, weather.hourly.length - 1);
}

/** "GMT+9", "GMT+5:30"… từ độ lệch giây */
function gmtLabel(sec) {
  const sign = sec < 0 ? "−" : "+";
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600), m = Math.round((a % 3600) / 60);
  return `GMT${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}
const VN_OFFSET = 7 * 3600;

export function renderLoading(name) {
  openPanel();
  panel.classList.add("loading");
  if (name) $("loc-name").textContent = name;
}

/** Địa điểm hiện tại dưới dạng lưu được vào "yêu thích" */
function currentPlace(weather) {
  const loc = weather.location;
  return {
    id: loc.id || null,
    name: loc.name,
    sub: [loc.province, loc.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · "),
    lat: loc.lat,
    lon: loc.lon,
  };
}

function syncFavButton(weather) {
  const on = isFavorite(currentPlace(weather));
  const b = $("panel-fav");
  b.textContent = on ? "★" : "☆";
  b.classList.toggle("on", on);
  b.title = on ? "Bỏ khỏi yêu thích" : "Lưu vào yêu thích";
}

export function renderPanel(weather) {
  if (!weather) return;
  panel.classList.remove("loading");
  const loc = weather.location;
  const hi = hourIndexIn(weather);
  const h = weather.hourly[hi];
  const day = weather.daily.find((d) => d.date === h.time.slice(0, 10)) || weather.daily[0];

  // ---- Đầu panel ----
  $("loc-name").textContent = loc.name;
  syncFavButton(weather);
  const isVN = loc.country === "Việt Nam";
  $("loc-region").textContent = (isVN ? [loc.province, "Việt Nam"] : [loc.province, loc.region])
    .filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(" · ");
  const off = weather.utcOffset ?? VN_OFFSET;
  $("loc-meta").textContent =
    `${Math.abs(loc.lat).toFixed(2)}°${loc.lat >= 0 ? "B" : "N"}, ${loc.lon.toFixed(2)}°Đ` +
    (loc.elevation != null ? ` · Cao ${Math.round(loc.elevation)} m` : "") +
    ` · ${gmtLabel(off)}`;

  // Giờ địa phương; nếu khác múi giờ Việt Nam thì ghi kèm giờ VN tương ứng
  const t = parseLocal(h.time);
  $("when").textContent =
    (hi === 0 ? "Hiện tại · " : "Dự báo · ") + `${fmtClock(h.time)} ${dayNamesLong[t.dow]}, ${t.d}/${t.m}` +
    (off !== VN_OFFSET ? ` (giờ địa phương · ${fmtHour(h.vn)} giờ VN)` : "");

  $("now-icon").textContent = h.icon;
  $("now-temp").innerHTML = `${Math.round(toUnit(h.temp))}<sup>°${state.unit}</sup>`;
  $("now-cond").textContent = h.cond;
  $("now-feels").textContent = `Cảm giác như ${fmtTemp(h.feels)}`;
  $("now-hilo").innerHTML = `Cao <b>${fmtDeg(day.hi)}</b> · Thấp <b>${fmtDeg(day.lo)}</b>`;

  renderGpsBadge(loc);
  renderNowcast(weather);
  renderAlerts(weather);

  // ---- Các chỉ số ----
  const cape = h.cape ?? 0;
  const cards = [
    ["💨 Gió", `${windArrow(h.dir, 14)} ${fmtWindNum(h.wind)} <small>${windUnitLabel()}</small>`,
      `${windDirName(h.dir)} · cấp ${beaufort(h.wind)} · giật ${fmtWind(h.gust)}`],
    ["💧 Độ ẩm", `${h.humidity} <small>%</small>`,
      h.dew != null ? `Điểm sương ${fmtDeg(h.dew)} · ${dewInfo(h.dew)}` : ""],
    ["🌧 Mưa", `${h.rain} <small>mm</small>`, `Khả năng mưa ${h.rainProb}%`],
    ["⏱ Áp suất", `${h.pressure} <small>hPa</small>`, pressureTrend(weather, hi)],
    ["☁️ Mây", `${h.cloud} <small>%</small>`, h.visibility != null ? `Tầm nhìn ${h.visibility} km` : ""],
    ["🔆 UV", `${h.uv}`, uvInfo(h.uv)],
    ["⛈ Dông", `${cape} <small>J/kg</small>`, capeInfo(cape)],
    ["🌡 Cảm giác", `${fmtDeg(h.feels)}<small>${state.unit}</small>`, heatInfo(h.feels)],
  ];
  $("stat-grid").innerHTML = cards
    .map(([k, v, s]) => `<div class="stat-card"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`)
    .join("");

  // ---- AQI + mặt trời ----
  const aq = weather.aqi;
  const ai = aqiInfo(aq?.usAqi);
  $("aqi-card").innerHTML = `
    <div class="k">🌫 Không khí</div>
    <div class="v"><span class="aqi-dot" style="background:${ai.color}"></span>${aq ? aq.usAqi : "–"} <small>AQI</small></div>
    <div class="s" style="color:${ai.color}">${ai.label}</div>
    ${aq ? `<div class="s">PM2.5 ${aq.pm25} · PM10 ${aq.pm10} µg/m³</div>` : ""}`;
  $("sun-card").innerHTML = `
    <div class="k">🌅 Mặt trời · ${fmtDate(day.date)}</div>
    <div class="sun-row"><span>Mọc</span><b>${fmtClock(day.sunrise)}</b></div>
    <div class="sun-row"><span>Lặn</span><b>${fmtClock(day.sunset)}</b></div>
    <div class="sun-row"><span>Ngày dài</span><b>${dayLength(day.sunrise, day.sunset)}</b></div>`;

  $("hourly-title").textContent = `Theo giờ · ${Math.round(weather.hourly.length / 24)} ngày tới`;
  renderHourly(weather, hi);
  renderChart(weather, hi);
  renderDaily(weather, day.date);
  syncModels(weather);

  const upd = new Date(weather.updatedAt);
  $("source").innerHTML =
    `Nguồn dữ liệu: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · ` +
    `Cập nhật ${String(upd.getHours()).padStart(2, "0")}:${String(upd.getMinutes()).padStart(2, "0")}`;
}

// ----------------------------- Vị trí GPS & mưa 2 giờ tới --------------------
function renderGpsBadge(loc) {
  const el = $("gps-badge");
  if (!loc.gps) { el.hidden = true; return; }
  const acc = loc.gps.accuracy;
  const accText = acc >= 1000 ? `±${(acc / 1000).toFixed(1)} km (gần đúng)` : `±${acc} m`;
  el.hidden = false;
  el.innerHTML = `<span class="gb-dot"></span>Vị trí hiện tại của bạn · sai số ${accText}` +
    (loc.gps.watching ? ` · <span class="gb-live">đang theo dõi</span>` : "");
}

/** Dự báo mưa ngắn hạn: 8 bước × 15 phút (luôn tính từ BÂY GIỜ, không theo timeline) */
function renderNowcast(weather) {
  const el = $("nowcast");
  const N = weather.nowcast || [];
  if (N.length < 2) { el.hidden = true; return; }
  el.hidden = false;
  const rain = N.map((n) => n.rain || 0);
  const wet = (v) => v >= 0.1;
  const total = Math.round(rain.reduce((a, b) => a + b, 0) * 10) / 10;
  let icon, text;
  if (!rain.some(wet)) {
    icon = "🌤"; text = "Không mưa trong 2 giờ tới";
  } else if (wet(rain[0])) {
    const stop = rain.findIndex((v) => !wet(v));
    icon = "🌧";
    text = stop < 0 ? "Đang mưa, kéo dài ít nhất 2 giờ tới" : `Đang mưa, có thể tạnh khoảng ${fmtClock(N[stop].time)}`;
  } else {
    icon = "🌦"; text = `Mưa có thể bắt đầu khoảng ${fmtClock(N[rain.findIndex(wet)].time)}`;
  }
  const level = total >= 10 ? "to" : total >= 2.5 ? "vừa" : "nhỏ";
  const max = Math.max(1, ...rain);
  const bars = N.map((n, i) => {
    const h = rain[i] > 0 ? Math.max(8, (rain[i] / max) * 100) : 3;
    return `<i style="height:${h}%" class="${wet(rain[i]) ? "wet" : ""}" title="${fmtClock(n.time)} · ${rain[i]} mm"></i>`;
  }).join("");
  el.innerHTML = `
    <div class="nc-head"><span class="nc-ic">${icon}</span>
      <div><b>${text}</b><small>${total > 0 ? `Tổng ~${total} mm · mưa ${level}` : `Dự báo 15 phút/lần · ${fmtClock(N[0].time)}–${fmtClock(N[N.length - 1].time)}`}</small></div></div>` +
    // Không mưa thì bỏ biểu đồ cột trống cho thẻ gọn
    (total > 0 ? `
    <div class="nc-bars">${bars}</div>
    <div class="nc-axis"><span>${fmtClock(N[0].time)}</span><span>+1 giờ</span><span>${fmtClock(N[N.length - 1].time)}</span></div>` : "");
}

// ----------------------------- Diễn giải chỉ số ------------------------------
function dewInfo(dew) {
  if (dew >= 24) return "rất oi bức";
  if (dew >= 20) return "oi";
  if (dew >= 16) return "hơi ẩm";
  if (dew >= 10) return "dễ chịu";
  return "khô";
}

function capeInfo(cape) {
  if (cape >= 2500) return "Nguy cơ dông mạnh";
  if (cape >= 1000) return "Có thể có dông";
  if (cape >= 300) return "Khí quyển hơi bất ổn";
  return "Ổn định";
}

function heatInfo(feels) {
  if (feels >= 41) return "Nguy hiểm, hạn chế ra ngoài";
  if (feels >= 35) return "Rất nóng, uống đủ nước";
  if (feels >= 30) return "Nóng";
  if (feels <= 10) return "Rét";
  if (feels <= 17) return "Lạnh";
  return "Dễ chịu";
}

/** Xu hướng áp suất 3 giờ tới (tăng/giảm nhanh thường báo hiệu thời tiết đổi) */
function pressureTrend(weather, i) {
  const a = weather.hourly[i]?.pressure, b = weather.hourly[i + 3]?.pressure;
  if (a == null || b == null) return "Mực nước biển";
  const d = b - a;
  if (d <= -2) return `Giảm nhanh (${d} hPa/3h)`;
  if (d >= 2) return `Tăng nhanh (+${d} hPa/3h)`;
  if (d < 0) return "Giảm nhẹ";
  if (d > 0) return "Tăng nhẹ";
  return "Ổn định";
}

function dayLength(rise, set) {
  const a = parseLocal(rise), b = parseLocal(set);
  const mins = b.h * 60 + b.min - (a.h * 60 + a.min);
  if (!(mins > 0)) return "–";
  return `${Math.floor(mins / 60)}g ${String(mins % 60).padStart(2, "0")}p`;
}

// ----------------------------- Cảnh báo -------------------------------------
// Ngưỡng tham khảo theo cách phân loại của khí tượng Việt Nam (nắng nóng ≥35°C,
// rét đậm khi nhiệt độ TB ngày ≤15°C, mưa to ≥50 mm/ngày, gió giật cấp 8 ≥62 km/h).
function renderAlerts(weather) {
  const days = weather.daily.slice(0, 7);
  const found = [];
  const add = (type, level, icon, text, d, value) => {
    const prev = found.find((f) => f.type === type);
    if (prev && prev.level >= level) return;
    if (prev) found.splice(found.indexOf(prev), 1);
    found.push({ type, level, icon, text, date: d.date, value });
  };
  for (const d of days) {
    if (d.hi >= 39) add("heat", 3, "🔥", "Nắng nóng đặc biệt gay gắt", d, fmtDeg(d.hi));
    else if (d.hi >= 37) add("heat", 2, "🔥", "Nắng nóng gay gắt", d, fmtDeg(d.hi));
    else if (d.hi >= 35) add("heat", 1, "☀️", "Nắng nóng", d, fmtDeg(d.hi));
    const mean = (d.hi + d.lo) / 2;
    if (mean <= 13) add("cold", 2, "🥶", "Rét hại", d, fmtDeg(d.lo));
    else if (mean <= 15) add("cold", 1, "❄️", "Rét đậm", d, fmtDeg(d.lo));
    if (d.rainSum >= 100) add("rain", 3, "🌊", "Mưa rất to", d, `${Math.round(d.rainSum)} mm`);
    else if (d.rainSum >= 50) add("rain", 2, "🌧", "Mưa to", d, `${Math.round(d.rainSum)} mm`);
    if (d.gustMax >= 89) add("wind", 3, "🌀", "Gió giật rất mạnh (cấp 10+)", d, fmtWind(d.gustMax));
    else if (d.gustMax >= 62) add("wind", 2, "💨", "Gió giật mạnh (cấp 8+)", d, fmtWind(d.gustMax));
    if (d.code >= 95) add("storm", 2, "⛈", "Dông, có thể kèm lốc, sét", d, "");
  }
  // Bão / áp thấp đang hoạt động có vị trí hoặc quỹ đạo dự báo trong 600 km
  const loc = weather.location;
  for (const s of state.stormList.filter((x) => x.current)) {
    const pts = [s.position, ...s.points.filter((p) => p.forecast).map((p) => [p.lat, p.lon])];
    const km = Math.min(...pts.map(([la, lo]) => distanceKm(loc.lat, loc.lon, la, lo)));
    if (km <= 600) {
      found.push({
        type: "storm-" + s.id, level: km <= 250 ? 3 : 2, icon: "🌀",
        text: `${s.category} ${s.name}`, date: days[0].date, value: `cách ~${Math.round(km / 10) * 10} km`,
      });
    }
  }
  if (weather.aqi?.usAqi > 150) {
    found.push({ type: "aqi", level: 2, icon: "😷", text: "Không khí xấu", date: days[0].date, value: `AQI ${weather.aqi.usAqi}` });
  }
  found.sort((a, b) => b.level - a.level || a.date.localeCompare(b.date));

  $("alerts").innerHTML = found.slice(0, 4).map((a) => {
    const when = a.date === days[0].date ? "Hôm nay" : `${fmtDow(a.date)} ${fmtDate(a.date)}`;
    return `<button class="alert lv${a.level}" data-date="${a.date}" title="Xem ngày này">
      <span class="ai">${a.icon}</span><span class="at">${a.text}</span>
      <span class="aw">${when}${a.value ? " · " + a.value : ""}</span></button>`;
  }).join("");
}

// ----------------------------- Theo giờ -------------------------------------
function renderHourly(weather, activeIdx) {
  const strip = $("hourly-strip");
  strip.innerHTML = weather.hourly
    .map((d, i) => {
      const t = parseLocal(d.time);
      const dayMark = t.h === 0 ? `<div class="day-mark">${fmtDow(d.time)} ${t.d}/${t.m}</div>` : "";
      return `${dayMark}<button class="hour-item${i === activeIdx ? " active" : ""}" data-i="${i}">
        <div class="t">${i === 0 ? "Nay" : t.min ? fmtClock(d.time) : String(t.h).padStart(2, "0") + "h"}</div>
        <div class="ic">${d.icon}</div>
        <div class="v">${fmtDeg(d.temp)}</div>
        <div class="w">${windArrow(d.dir, 9)}${fmtWindNum(d.wind)}</div>
        <div class="p">${d.rainProb >= 20 ? d.rainProb + "%" : "&nbsp;"}</div>
      </button>`;
    })
    .join("");
  const el = strip.querySelector(".hour-item.active");
  if (el) strip.scrollLeft = el.offsetLeft - strip.clientWidth / 2 + el.offsetWidth / 2;
}

function renderChart(weather, activeIdx) {
  const svg = $("chart");
  const H = weather.hourly;
  const n = H.length;
  const temps = H.map((d) => d.temp);
  const min = Math.min(...temps), max = Math.max(...temps);
  const maxRain = Math.max(2, ...H.map((d) => d.rain));
  const x = (i) => (i / (n - 1)) * 300;
  const y = (v) => 62 - ((v - min) / (max - min || 1)) * 52;

  const line = temps.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L300,90L0,90Z`;
  const bw = 300 / n;
  const bars = H.map((d, i) => {
    if (d.rain <= 0) return "";
    const bh = Math.max(1.5, (d.rain / maxRain) * 24);
    return `<rect x="${(x(i) - bw / 2 + 0.3).toFixed(2)}" y="${(90 - bh).toFixed(1)}" width="${Math.max(0.6, bw - 0.6).toFixed(2)}" height="${bh.toFixed(1)}" fill="#4f8dff" opacity=".75"/>`;
  }).join("");
  const days = H.map((d, i) => (parseLocal(d.time).h === 0 && i > 0
    ? `<line x1="${x(i)}" y1="0" x2="${x(i)}" y2="90" stroke="rgba(255,255,255,.12)" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>` : "")).join("");

  svg.innerHTML = `
    <defs><linearGradient id="tfill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff9d4d" stop-opacity=".28"/><stop offset="1" stop-color="#ff9d4d" stop-opacity="0"/>
    </linearGradient></defs>
    ${days}
    <path d="${area}" fill="url(#tfill)"/>
    ${bars}
    <path d="${line}" fill="none" stroke="#ff9d4d" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <line x1="${x(activeIdx)}" y1="0" x2="${x(activeIdx)}" y2="90" stroke="#ffd166" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(activeIdx)}" cy="${y(temps[activeIdx])}" r="3" fill="#ffd166"/>`;
  $("chart-wrap").querySelector(".chart-legend .t").textContent =
    `— Nhiệt độ ${fmtDeg(min)} → ${fmtDeg(max)}`;
}

function renderDaily(weather, activeDate) {
  const list = $("daily-list");
  const D = weather.daily;
  const gMin = Math.min(...D.map((d) => d.lo)), gMax = Math.max(...D.map((d) => d.hi));
  const span = gMax - gMin || 1;
  list.innerHTML = D.map((d, i) => {
    const left = ((d.lo - gMin) / span) * 100;
    const width = Math.max(4, ((d.hi - d.lo) / span) * 100);
    const inTimeline = weather.hourly.some((h) => h.time.startsWith(d.date) && state.times.includes(h.vn));
    return `<div class="day-row${d.date === activeDate ? " active" : ""}${inTimeline ? " clickable" : ""}" data-date="${d.date}"
        title="${escapeHtml(d.cond)} · gió tối đa ${fmtWind(d.windMax)}${d.gustMax != null ? ", giật " + fmtWind(d.gustMax) : ""} · UV ${d.uvMax}">
      <div class="d">${i === 0 ? "Hôm nay" : fmtDow(d.date)}<small>${fmtDate(d.date)}</small></div>
      <div class="ic">${d.icon}</div>
      <div class="rain">${d.rainChance}%<small>${d.rainSum > 0 ? d.rainSum + "mm" : ""}</small></div>
      <div class="dw">${windArrow(d.dir, 10)}${fmtWindNum(d.windMax)}</div>
      <div class="range">
        <span class="lo">${fmtDeg(d.lo)}</span>
        <div class="track"><div class="fill" style="left:${left}%; width:${width}%"></div></div>
        <span class="hi">${fmtDeg(d.hi)}</span>
      </div>
    </div>`;
  }).join("");
}

// ----------------------------- So sánh mô hình -------------------------------
let modelsKey = null;   // toạ độ của dữ liệu so sánh đang hiển thị
let modelsData = null;
let modelsSeq = 0;

const coordKey = (loc) => `${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}`;

/** Đổi địa điểm → reset phần so sánh về nút "Xem"; cùng địa điểm → vẽ lại (vd đổi °C/°F) */
function syncModels(weather) {
  const key = coordKey(weather.location);
  if (key !== modelsKey) {
    modelsKey = key;
    modelsData = null;
    modelsSeq++;
    $("models").innerHTML = `<button class="models-btn" id="models-btn">
      So sánh ECMWF · GFS · ICON · JMA <span>→</span></button>
      <div class="models-note">Xem các mô hình dự báo lớn trên thế giới có đồng thuận với nhau không.</div>`;
  } else if (modelsData) {
    renderModels(modelsData);
  }
}

async function loadModels() {
  const w = state.weather;
  if (!w) return;
  const seq = ++modelsSeq;
  $("models").innerHTML = `<div class="models-note">Đang tải dữ liệu 4 mô hình…</div>`;
  try {
    const data = await api.fetchModels(w.location.lat, w.location.lon);
    if (seq !== modelsSeq) return;
    modelsData = data;
    renderModels(data);
  } catch (err) {
    if (seq !== modelsSeq) return;
    $("models").innerHTML = `<div class="models-note err">Không tải được: ${escapeHtml(err.message)}</div>
      <button class="models-btn" id="models-btn">Thử lại <span>↻</span></button>`;
  }
}

function renderModels(data) {
  const ids = data.models.map((m) => m.id);
  const T = data.hourly.temp;
  const n = data.hourly.time.length;
  const all = ids.flatMap((id) => T[id]).filter((v) => v != null);
  if (!all.length) {
    $("models").innerHTML = `<div class="models-note">Không có dữ liệu mô hình cho vị trí này.</div>`;
    return;
  }
  const min = Math.min(...all), max = Math.max(...all);
  const x = (i) => (i / (n - 1)) * 300;
  const y = (v) => 100 - ((v - min) / (max - min || 1)) * 88 - 6;

  const lines = ids.map((id) => {
    let d = "", pen = false;
    T[id].forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return `<path d="${d}" fill="none" stroke="${MODEL_COLORS[id] || "#fff"}" stroke-width="1.6" opacity=".9" vector-effect="non-scaling-stroke"/>`;
  }).join("");
  const days = data.hourly.time.map((t, i) => (parseLocal(t).h === 0 && i > 0
    ? `<line x1="${x(i)}" y1="0" x2="${x(i)}" y2="110" stroke="rgba(255,255,255,.1)" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>` : "")).join("");

  const legend = data.models.map((m) =>
    `<span><i style="background:${MODEL_COLORS[m.id]}"></i>${m.name}</span>`).join("");

  // Bảng theo ngày: cao/thấp + mưa của từng mô hình, kèm độ tin cậy theo độ lệch
  const D = data.daily;
  const head = `<div class="mt-row mt-head"><span></span>${data.models
    .map((m) => `<span style="color:${MODEL_COLORS[m.id]}">${m.name}</span>`).join("")}</div>`;
  const rows = D.time.map((date, i) => {
    const his = ids.map((id) => D.hi[id][i]).filter((v) => v != null);
    const rains = ids.map((id) => D.rain[id][i]).filter((v) => v != null);
    const spread = his.length > 1 ? Math.max(...his) - Math.min(...his) : 0;
    const rainSpread = rains.length > 1 ? Math.max(...rains) - Math.min(...rains) : 0;
    const conf = spread <= 2 && rainSpread <= 10 ? ["cao", "hi"] : spread <= 4 && rainSpread <= 25 ? ["vừa", "mid"] : ["thấp", "lo"];
    const cells = ids.map((id) => {
      const h = D.hi[id][i], l = D.lo[id][i], r = D.rain[id][i];
      if (h == null) return `<span class="na">–</span>`;
      return `<span><b>${fmtDeg(h)}</b>/${fmtDeg(l)}<small>${r > 0.1 ? Math.round(r * 10) / 10 + "mm" : "&nbsp;"}</small></span>`;
    }).join("");
    return `<div class="mt-row"><span class="mt-day" title="Độ tin cậy ${conf[0]}">
      <i class="conf ${conf[1]}"></i>${i === 0 ? "Nay" : fmtDow(date)}<small>${fmtDate(date)}</small></span>${cells}</div>`;
  }).join("");

  $("models").innerHTML = `
    <svg class="models-chart" viewBox="0 0 300 110" preserveAspectRatio="none" width="100%" height="110">
      ${days}${lines}
    </svg>
    <div class="models-axis"><span>${fmtDeg(min)}</span><span>Nhiệt độ theo giờ · 7 ngày</span><span>${fmtDeg(max)}</span></div>
    <div class="models-legend">${legend}</div>
    <div class="models-table">${head}${rows}</div>
    <div class="models-note">Chấm màu bên trái: độ tin cậy (các mô hình càng giống nhau → càng chắc chắn).</div>`;
}

// ----------------------------- Sự kiện --------------------------------------
/**
 * Gắn sự kiện một lần: bấm giờ, biểu đồ, ngày, cảnh báo, yêu thích, chia sẻ.
 * @param {{onToast:(msg:string)=>void}} hooks
 */
export function initPanelInteractions({ onToast } = {}) {
  $("hourly-strip").addEventListener("click", (e) => {
    const b = e.target.closest(".hour-item");
    if (b && state.weather) setHourFromLocal(+b.dataset.i);
  });

  $("chart").addEventListener("click", (e) => {
    if (!state.weather) return;
    const r = e.currentTarget.getBoundingClientRect();
    const n = state.weather.hourly.length;
    setHourFromLocal(Math.round(((e.clientX - r.left) / r.width) * (n - 1)));
  });

  const gotoDate = (date) => {
    // Nhảy tới ~13 giờ (địa phương) của ngày đó, hoặc giờ đầu tiên còn trong timeline
    const H = state.weather.hourly;
    let i = H.findIndex((h) => h.time.startsWith(`${date}T13`));
    if (i < 0) i = H.findIndex((h) => h.time.startsWith(date));
    if (i >= 0) setHourFromLocal(i);
  };

  $("daily-list").addEventListener("click", (e) => {
    const row = e.target.closest(".day-row.clickable");
    if (row && state.weather) gotoDate(row.dataset.date);
  });

  $("alerts").addEventListener("click", (e) => {
    const a = e.target.closest(".alert");
    if (a && state.weather) gotoDate(a.dataset.date);
  });

  $("models").addEventListener("click", (e) => {
    if (e.target.closest("#models-btn")) loadModels();
  });

  $("panel-fav").addEventListener("click", () => {
    if (!state.weather) return;
    const on = toggleFavorite(currentPlace(state.weather));
    syncFavButton(state.weather);
    onToast?.(on ? "Đã lưu vào yêu thích — xem lại trong ô tìm kiếm" : "Đã bỏ khỏi yêu thích");
  });

  $("panel-share").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: document.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        onToast?.("Đã sao chép liên kết tới địa điểm này");
      }
    } catch { /* người dùng huỷ chia sẻ */ }
  });
}

/** Chọn giờ theo chỉ số trong dự báo chi tiết (giờ địa phương) → quy về timeline */
function setHourFromLocal(i) {
  const h = state.weather.hourly[i];
  if (!h) return;
  const idx = state.times.indexOf(h.vn);
  setHour(idx >= 0 ? idx : i);
}
