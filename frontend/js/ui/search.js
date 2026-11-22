// js/ui/search.js
// Ô tìm kiếm: gọi /api/search (địa điểm có sẵn + mọi địa danh trong Việt Nam),
// hỗ trợ tìm không dấu, điều hướng bằng bàn phím ↑ ↓ Enter Esc.
import * as api from "../api.js";
import { state } from "../state.js";
import { escapeHtml } from "../utils.js";

const input = document.getElementById("search");
const resultsEl = document.getElementById("search-results");

let results = [];
let activeIdx = -1;
let timer = null;
let controller = null;

function close() {
  resultsEl.classList.remove("open");
  activeIdx = -1;
}

/** Khi ô tìm kiếm trống: hiện danh sách địa điểm yêu thích */
function showFavorites() {
  results = state.favorites.map((f) => ({
    kind: f.id ? "location" : "place", fav: true,
    id: f.id, name: f.name, sub: f.sub, lat: f.lat, lon: f.lon,
  }));
  activeIdx = -1;
  if (!results.length) {
    resultsEl.innerHTML = `<div class="result-empty">Bấm ☆ trong bảng chi tiết để lưu địa điểm yêu thích</div>`;
    resultsEl.classList.add("open");
    return;
  }
  render();
}

function render() {
  const heading = results[0]?.fav ? "Địa điểm yêu thích" : "";
  if (!results.length) {
    resultsEl.innerHTML = `<div class="result-empty">Không tìm thấy địa điểm phù hợp</div>`;
  } else {
    resultsEl.innerHTML = (heading ? `<div class="result-head">${heading}</div>` : "") + results
      .map((r, i) => `<div class="result-item${i === activeIdx ? " active" : ""}" role="option" data-i="${i}">
          <span class="ri">${r.fav ? "⭐" : r.kind === "location" ? "📍" : "🔎"}</span>
          <span class="rt"><b>${escapeHtml(r.name)}</b><span>${escapeHtml(r.sub || "")}</span></span>
        </div>`)
      .join("");
  }
  resultsEl.classList.add("open");
}

/**
 * @param {(item:{kind,id?,name,sub,lat,lon}) => void} onPick chọn 1 kết quả
 */
export function initSearch(onPick) {
  async function run(q) {
    controller?.abort();
    controller = new AbortController();
    try {
      results = await api.search(q, controller.signal);
      activeIdx = results.length ? 0 : -1;
      render();
    } catch (err) {
      if (err.name !== "AbortError") {
        resultsEl.innerHTML = `<div class="result-empty">Lỗi tìm kiếm, thử lại sau</div>`;
        resultsEl.classList.add("open");
      }
    }
  }

  function pick(i) {
    const r = results[i];
    if (!r) return;
    input.value = r.name;
    input.blur();
    close();
    onPick(r);
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (!q) {
      controller?.abort();
      return showFavorites();
    }
    timer = setTimeout(() => run(q), 220);
  });

  input.addEventListener("focus", () => {
    if (!input.value.trim()) showFavorites();
    else if (results.length) render();
    input.select();
  });

  input.addEventListener("keydown", (e) => {
    if (!resultsEl.classList.contains("open")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = results.length;
      if (!n) return;
      activeIdx = (activeIdx + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(activeIdx);
    } else if (e.key === "Escape") {
      close();
      input.blur();
    }
  });

  resultsEl.addEventListener("click", (e) => {
    const item = e.target.closest(".result-item");
    if (item) pick(+item.dataset.i);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#search-wrap")) close();
  });

  // Phím "/" để nhảy nhanh vào ô tìm kiếm
  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
}
