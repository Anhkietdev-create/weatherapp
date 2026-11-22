// js/ui/timeline.js
// Thanh timeline 5 ngày: vạch chia theo giờ Việt Nam, đường cong nhiệt độ của
// địa điểm đang xem, playhead kéo được (chuột/cảm ứng/bàn phím) và nút phát.
import { state } from "../state.js";
import { parseLocal, fmtDow } from "../utils.js";

const tlTicks = document.getElementById("tl-ticks");
const playhead = document.getElementById("playhead");
const badge = document.getElementById("playhead-badge");
const scale = document.getElementById("timeline-scale");
const playBtn = document.getElementById("play-btn");
const playIcon = document.getElementById("play-icon");

const ICON_PLAY = '<path d="M8 5v14l11-7z"/>';
const ICON_PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';

let playTimer = null;
const last = () => Math.max(1, state.times.length - 1);

/** Vẽ vạch chia giờ/ngày từ danh sách mốc giờ thật */
export function buildTicks() {
  tlTicks.innerHTML = "";
  // Khoảng cách nhãn giờ theo độ rộng thực của thanh (5 ngày = 120 mốc)
  const pxPerHour = (scale.clientWidth || window.innerWidth - 120) / last();
  const every = [3, 6, 12].find((h) => h * pxPerHour >= 42) || 0; // 0 = chỉ nhãn ngày
  const tickEvery = pxPerHour >= 6 ? 1 : 3;
  state.times.forEach((time, h) => {
    const t = parseLocal(time);
    const pct = (h / last()) * 100;
    const isDayStart = t.h === 0;

    if (isDayStart || t.h % tickEvery === 0) {
      const tick = document.createElement("div");
      tick.className = "tl-tick" + (isDayStart ? " day" : "");
      tick.style.left = pct + "%";
      tlTicks.appendChild(tick);
    }

    // Nhãn giờ không đè lên nhãn ngày (nhãn ngày rộng ~50px)
    const nearDay = (24 - t.h) * pxPerHour < 30 || t.h * pxPerHour < 74;
    if (isDayStart || (every && t.h % every === 0 && h > 1 && !nearDay)) {
      const lbl = document.createElement("div");
      lbl.className = "tl-label" + (isDayStart ? " day" : "");
      lbl.style.left = pct + "%";
      lbl.textContent = isDayStart ? `${fmtDow(time)} ${t.d}/${t.m}` : String(t.h).padStart(2, "0") + "h";
      tlTicks.appendChild(lbl);
    }
  });
  playhead.setAttribute("aria-valuemax", last());
}

/** Đường cong nhiệt độ 48h của địa điểm đang xem */
export function updateCurve(temps) {
  const path = document.getElementById("tl-curve-path");
  if (!temps?.length) return path.setAttribute("d", "");
  const min = Math.min(...temps), max = Math.max(...temps);
  const norm = (t) => 34 - ((t - min) / (max - min || 1)) * 28 - 3;
  const step = 1000 / Math.max(1, temps.length - 1);
  path.setAttribute("d", temps.map((t, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${norm(t).toFixed(1)}`).join(" "));
}

export function positionPlayhead() {
  playhead.style.left = (state.hourIdx / last()) * 100 + "%";
  const time = state.times[state.hourIdx];
  if (!time) return;
  const t = parseLocal(time);
  badge.textContent = state.hourIdx === 0
    ? "Bây giờ"
    : `${fmtDow(time)} ${String(t.h).padStart(2, "0")}:00`;
  playhead.setAttribute("aria-valuenow", state.hourIdx);
  playhead.setAttribute("aria-valuetext", badge.textContent);
}

export function stopPlaying() {
  if (!state.playing) return;
  state.playing = false;
  playIcon.innerHTML = ICON_PLAY;
  clearInterval(playTimer);
}

/**
 * @param {() => void} onScrub gọi mỗi khi giờ đang xem thay đổi
 */
export function initTimelineInteractions(onScrub) {
  function setHour(i) {
    const v = Math.max(0, Math.min(last(), i));
    if (v === state.hourIdx) return;
    state.hourIdx = v;
    positionPlayhead();
    onScrub();
  }

  function setHourFromClientX(clientX) {
    const rect = scale.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHour(Math.round(pct * last()));
  }

  // Kéo bằng chuột / cảm ứng / bút (Pointer Events) — kéo ở bất kỳ đâu trên thanh
  let dragging = false;
  const track = document.getElementById("timeline-track-wrap");
  track.addEventListener("pointerdown", (e) => {
    dragging = true;
    stopPlaying();
    track.setPointerCapture(e.pointerId);
    setHourFromClientX(e.clientX);
  });
  track.addEventListener("pointermove", (e) => dragging && setHourFromClientX(e.clientX));
  track.addEventListener("pointerup", () => (dragging = false));
  track.addEventListener("pointercancel", () => (dragging = false));

  // Bàn phím: ← → đổi giờ, Shift + ← → đổi 6 giờ, Space phát/dừng
  window.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      stopPlaying();
      const step = e.shiftKey ? 6 : 1;
      setHour(state.hourIdx + (e.key === "ArrowRight" ? step : -step));
    } else if (e.key === "Home") {
      setHour(0);
    } else if (e.key === "End") {
      setHour(last());
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      stopPlaying();
      setHour(state.hourIdx + (e.key === "PageDown" ? 24 : -24));
    } else if (e.key === " " && !e.target.closest("button")) {
      e.preventDefault();
      playBtn.click();
    }
  });

  // Đồng bộ khi giờ được đổi từ nơi khác (panel: dải giờ, biểu đồ, danh sách ngày)
  window.addEventListener("hour-changed", () => {
    stopPlaying();
    positionPlayhead();
    onScrub();
  });

  playBtn.addEventListener("click", () => {
    if (state.playing) return stopPlaying();
    state.playing = true;
    playIcon.innerHTML = ICON_PAUSE;
    playTimer = setInterval(() => {
      state.hourIdx = (state.hourIdx + 1) % (last() + 1);
      positionPlayhead();
      onScrub();
    }, 420);
  });

  window.addEventListener("resize", () => buildTicks());
}
