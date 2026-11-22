// js/ui/fieldLayer.js
// Lớp "trường dữ liệu" phủ lên bản đồ — yếu tố hình ảnh đặc trưng của app:
//   1) Lớp màu: nội suy (IDW) giá trị thật của các trạm/lưới thành bề mặt màu.
//   2) Đường đẳng trị (đẳng áp / đẳng nhiệt) vẽ bằng thuật toán marching squares.
//   3) Hạt chuyển động: hàng nghìn hạt trôi theo vector gió (hoặc hướng sóng).
//
// Ba canvas nằm trong một pane riêng của Leaflet (dưới lớp nhãn & ghim), nên
// khi kéo bản đồ chúng di chuyển theo; khi dừng kéo/phóng thì vẽ lại.
//
// Dữ liệu vào (setData):
//   {
//     layer,                                     // khoá lớp (layerMeta)
//     value: { pts:[{lat,lon,val,r?}], reach, fade },   // giá trị tô màu
//     flow:  { pts:[{lat,lon,u,v,r?}], reach, fade } | null,  // vector hạt
//     iso:   { pts:[{lat,lon,iso}], reach, fade, step(zoom), conv, fmt } | null,
//   }
// Các tập điểm giống hệt nhau (cùng mảng) được nội suy chung trong 1 lượt.
import { layerMeta } from "../config.js";
import { compileStops, colorAt } from "../utils.js";

const SPEED_SCALE = 0.14;       // px mỗi khung hình cho mỗi km/h
const ISO_MIN_MASK = 0.35;      // chỉ vẽ đường đẳng trị nơi đủ dữ liệu

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initField(map) {
  const pane = map.createPane("field");
  pane.style.zIndex = 450;
  pane.style.pointerEvents = "none";
  pane.classList.add("field-pane");

  const colorCanvas = document.createElement("canvas");
  const isoCanvas = document.createElement("canvas");
  const flowCanvas = document.createElement("canvas");
  colorCanvas.className = "field-color";
  isoCanvas.className = "field-iso";
  flowCanvas.className = "field-flow";
  pane.append(colorCanvas, isoCanvas, flowCanvas);
  const canvases = [colorCanvas, isoCanvas, flowCanvas];
  const cctx = colorCanvas.getContext("2d");
  const ictx = isoCanvas.getContext("2d");
  const fctx = flowCanvas.getContext("2d");

  // Canvas phụ độ phân giải thấp (1 pixel = 1 ô lưới), phóng to khi vẽ để mịn
  const small = document.createElement("canvas");
  const sctx = small.getContext("2d");

  let CELL = 10;
  let W = 0, H = 0, DPR = 1, cols = 0, rows = 0, pxPerKm = 1;
  let input = null;
  let valGrid, uGrid, vGrid, isoGrid, valMask, flowMask, isoMask;
  let particles = [];
  let particlesOn = true;

  // ---------------------------------------------------------------------
  function resize() {
    const size = map.getSize();
    W = size.x; H = size.y;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    for (const c of canvases) {
      L.DomUtil.setPosition(c, topLeft);
      c.width = Math.round(W * DPR);
      c.height = Math.round(H * DPR);
      c.style.width = W + "px";
      c.style.height = H + "px";
    }
    for (const ctx of [cctx, ictx, fctx]) ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /**
   * Nội suy IDW (Inverse Distance Weighting) bậc 3 cho một tập điểm, tính
   * nhiều kênh cùng lúc + "mặt nạ" độ tin cậy theo khoảng cách tới điểm gần nhất.
   */
  function interp(pts, keys, reach, fade) {
    const n = cols * rows;
    const outs = keys.map(() => new Float32Array(n));
    const mask = new Float32Array(n);
    if (!pts?.length) return { outs, mask };

    const K = keys.length;
    const stride = 4 + K;
    // Phép chiếu Mercator kéo giãn vùng vĩ độ cao: số px/km tại mỗi điểm tỉ lệ
    // với 1/cos(vĩ độ) — tính riêng cho từng điểm để vùng phủ không bị thủng.
    const kEq = pxPerKm * Math.cos((map.getCenter().lat * Math.PI) / 180);
    const scaleAt = (lat) => kEq / Math.max(0.17, Math.cos((lat * Math.PI) / 180));
    const flat = [];
    for (const p of pts) {
      const s = scaleAt(p.lat);
      // Chỉ giữ điểm trong/gần khung nhìn để nội suy nhanh
      const margin = Math.max(250, (Math.max(reach, 550) + fade) * s);
      const c = map.latLngToContainerPoint([p.lat, p.lon]);
      if (c.x < -margin || c.y < -margin || c.x > W + margin || c.y > H + margin) continue;
      flat.push(c.x, c.y, (p.r || reach) * s, 1 / s);
      for (const k of keys) flat.push(p[k]);
    }
    const P = Float64Array.from(flat);
    const count = P.length / stride;
    if (!count) return { outs, mask };

    const acc = new Float64Array(K);
    const fadeKm = Math.max(1, fade);
    for (let j = 0; j < rows; j++) {
      const y = j * CELL;
      for (let i = 0; i < cols; i++) {
        const x = i * CELL;
        let sw = 0, minEx = Infinity;
        acc.fill(0);
        for (let o = 0; o < P.length; o += stride) {
          const dx = x - P[o], dy = y - P[o + 1];
          const d2 = dx * dx + dy * dy + 1;
          const d = Math.sqrt(d2);
          const ex = (d - P[o + 2]) * P[o + 3]; // km vượt ra ngoài vùng phủ
          if (ex < minEx) minEx = ex;
          const w = 1 / (d2 * d);
          sw += w;
          for (let k = 0; k < K; k++) acc[k] += w * P[o + 4 + k];
        }
        const idx = j * cols + i;
        for (let k = 0; k < K; k++) outs[k][idx] = acc[k] / sw;
        mask[idx] = Math.max(0, Math.min(1, 1 - minEx / fadeKm));
      }
    }
    return { outs, mask };
  }

  function computeGrid() {
    CELL = map.getZoom() < 5 ? 14 : 10;
    cols = Math.ceil(W / CELL) + 1;
    rows = Math.ceil(H / CELL) + 1;
    const n = cols * rows;
    valGrid = uGrid = vGrid = isoGrid = null;
    valMask = flowMask = isoMask = new Float32Array(n);
    if (!input) return;

    // Số pixel / km tại tâm bản đồ (để tính độ mờ theo khoảng cách thật)
    const center = map.getCenter();
    const a = map.latLngToContainerPoint(center);
    const b = map.latLngToContainerPoint([center.lat + 1, center.lng]);
    pxPerKm = Math.max(1e-4, Math.abs(b.y - a.y) / 111);

    // Gom các yêu cầu theo tập điểm để nội suy chung
    const groups = new Map(); // pts → { keys, reach, fade, roles }
    const need = (spec, keys, role) => {
      if (!spec?.pts) return;
      let g = groups.get(spec.pts);
      if (!g) groups.set(spec.pts, (g = { keys: [], reach: spec.reach ?? 550, fade: spec.fade ?? 400, roles: [] }));
      g.keys.push(...keys);
      g.roles.push(role);
    };
    need(input.value, ["val"], "value");
    need(input.flow, ["u", "v"], "flow");
    need(input.iso, ["iso"], "iso");

    for (const [pts, g] of groups) {
      const { outs, mask } = interp(pts, g.keys, g.reach, g.fade);
      g.keys.forEach((k, i) => {
        if (k === "val") valGrid = outs[i];
        else if (k === "u") uGrid = outs[i];
        else if (k === "v") vGrid = outs[i];
        else if (k === "iso") isoGrid = outs[i];
      });
      if (g.roles.includes("value")) valMask = mask;
      if (g.roles.includes("flow")) flowMask = mask;
      if (g.roles.includes("iso")) isoMask = mask;
    }
  }

  function drawColor() {
    cctx.clearRect(0, 0, W, H);
    if (!input || !valGrid) return;
    small.width = cols;
    small.height = rows;
    const img = sctx.createImageData(cols, rows);
    const stops = compileStops(layerMeta[input.layer].stops);
    for (let idx = 0; idx < cols * rows; idx++) {
      const c = colorAt(stops, valGrid[idx]);
      const o = idx * 4;
      img.data[o] = c.r;
      img.data[o + 1] = c.g;
      img.data[o + 2] = c.b;
      img.data[o + 3] = c.a * valMask[idx] * 255;
    }
    sctx.putImageData(img, 0, 0);
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(small, -CELL / 2, -CELL / 2, cols * CELL, rows * CELL);
  }

  // ----------------------- Đường đẳng trị (marching squares) -----------------
  // Mỗi ô có 4 góc: a (trên-trái, bit 8), b (trên-phải, 4), c (dưới-phải, 2),
  // d (dưới-trái, 1). Bảng cho biết đường cắt qua những cạnh nào.
  const T = 0, R = 1, B = 2, Lf = 3;
  const CASES = {
    1: [[Lf, B]], 2: [[B, R]], 3: [[Lf, R]], 4: [[T, R]], 5: [[Lf, T], [B, R]],
    6: [[T, B]], 7: [[Lf, T]], 8: [[Lf, T]], 9: [[T, B]], 10: [[Lf, B], [T, R]],
    11: [[T, R]], 12: [[Lf, R]], 13: [[B, R]], 14: [[Lf, B]],
  };

  /** Box blur tách trục (ngang rồi dọc) bán kính r ô */
  function blur(src, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let s = 0, c = 0;
        for (let k = Math.max(0, i - r); k <= Math.min(cols - 1, i + r); k++) { s += src[j * cols + k]; c++; }
        tmp[j * cols + i] = s / c;
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let s = 0, c = 0;
        for (let k = Math.max(0, j - r); k <= Math.min(rows - 1, j + r); k++) { s += tmp[k * cols + i]; c++; }
        out[j * cols + i] = s / c;
      }
    }
    return out;
  }

  function drawIso() {
    ictx.clearRect(0, 0, W, H);
    if (!input?.iso || !isoGrid) return;
    const spec = input.iso;
    const step = typeof spec.step === "function" ? spec.step(map.getZoom()) : spec.step;
    const conv = spec.conv || ((v) => v);
    const n = cols * rows;
    // Làm mượt (box blur 2 lượt) để tránh các vòng "mắt bò" quanh điểm lưới thưa
    const g = blur(blur(isoGrid.map(conv), 3), 3);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) {
      if (isoMask[i] >= ISO_MIN_MASK) {
        if (g[i] < min) min = g[i];
        if (g[i] > max) max = g[i];
      }
    }
    if (!(max > min)) return;

    const levels = [];
    for (let L = Math.ceil(min / step) * step; L <= max; L += step) levels.push(L);
    if (levels.length > 80) return;

    const segs = []; // [x1,y1,x2,y2,level]
    const lerp = (p, q, L) => (q === p ? 0.5 : (L - p) / (q - p));
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const ia = j * cols + i, ib = ia + 1, id = ia + cols, ic = id + 1;
        if (isoMask[ia] < ISO_MIN_MASK || isoMask[ib] < ISO_MIN_MASK ||
            isoMask[ic] < ISO_MIN_MASK || isoMask[id] < ISO_MIN_MASK) continue;
        const a = g[ia], b = g[ib], c = g[ic], d = g[id];
        const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
        for (const L of levels) {
          if (L <= lo || L > hi) continue;
          const cs = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
          const pairs = CASES[cs];
          if (!pairs) continue;
          const edge = (e) => {
            switch (e) {
              case T: return [(i + lerp(a, b, L)) * CELL, j * CELL];
              case R: return [(i + 1) * CELL, (j + lerp(b, c, L)) * CELL];
              case B: return [(i + lerp(d, c, L)) * CELL, (j + 1) * CELL];
              default: return [i * CELL, (j + lerp(a, d, L)) * CELL];
            }
          };
          for (const [e1, e2] of pairs) {
            const p1 = edge(e1), p2 = edge(e2);
            segs.push([p1[0], p1[1], p2[0], p2[1], L]);
          }
        }
      }
    }

    ictx.lineWidth = 1;
    ictx.strokeStyle = "rgba(255,255,255,0.42)";
    ictx.beginPath();
    for (const s of segs) { ictx.moveTo(s[0], s[1]); ictx.lineTo(s[2], s[3]); }
    ictx.stroke();

    // Nhãn: rải đều, cách nhau tối thiểu ~170px, tránh mép màn hình
    const fmt = spec.fmt || ((v) => String(v));
    const placed = [];
    ictx.font = "600 10.5px 'JetBrains Mono', monospace";
    ictx.textAlign = "center";
    ictx.textBaseline = "middle";
    const stride = Math.max(1, Math.floor(segs.length / 600));
    for (let k = 0; k < segs.length && placed.length < 50; k += stride) {
      const s = segs[(k * 7919) % segs.length]; // xáo trộn nhẹ để nhãn không dồn 1 góc
      const x = (s[0] + s[2]) / 2, y = (s[1] + s[3]) / 2;
      if (x < 40 || y < 30 || x > W - 40 || y > H - 30) continue;
      if (placed.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < 170 * 170)) continue;
      placed.push([x, y]);
      const text = fmt(Math.round(s[4] * 10) / 10);
      const w = ictx.measureText(text).width + 8;
      ictx.fillStyle = "rgba(6,13,23,0.78)";
      ictx.beginPath();
      if (ictx.roundRect) ictx.roundRect(x - w / 2, y - 8, w, 16, 4);
      else ictx.rect(x - w / 2, y - 8, w, 16);
      ictx.fill();
      ictx.fillStyle = "rgba(255,255,255,0.88)";
      ictx.fillText(text, x, y + 0.5);
    }
  }

  // ----------------------------- Hạt chuyển động ------------------------------
  function sample(grid, x, y) {
    if (!grid) return 0;
    const i = Math.round(x / CELL), j = Math.round(y / CELL);
    if (i < 0 || j < 0 || i >= cols || j >= rows) return 0;
    return grid[j * cols + i];
  }

  function spawn(p) {
    for (let tries = 0; tries < 12; tries++) {
      p.x = Math.random() * W;
      p.y = Math.random() * H;
      if (sample(flowMask, p.x, p.y) > 0.3) break;
    }
    p.age = 0;
    p.maxAge = 40 + Math.random() * 70;
  }

  function resetParticles() {
    const count = Math.min(1800, Math.round((W * H) / 1400));
    particles = Array.from({ length: count }, () => {
      const p = {};
      spawn(p);
      p.age = Math.random() * p.maxAge; // lệch pha để không sinh/chết cùng lúc
      return p;
    });
    fctx.clearRect(0, 0, W, H);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!particlesOn || !input?.flow || !uGrid || !W) return;

    // Làm mờ dần vệt cũ nhưng vẫn giữ nền trong suốt (để thấy bản đồ bên dưới)
    fctx.globalCompositeOperation = "destination-in";
    fctx.fillStyle = "rgba(0,0,0,0.9)";
    fctx.fillRect(0, 0, W, H);
    fctx.globalCompositeOperation = "source-over";

    const strong = input.layer === "wind" || input.layer === "gust" || input.layer === "waves";
    fctx.strokeStyle = strong ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)";
    fctx.lineWidth = 1.1;
    fctx.beginPath();
    for (const p of particles) {
      const u = sample(uGrid, p.x, p.y);
      const v = sample(vGrid, p.x, p.y);
      const nx = p.x + u * SPEED_SCALE;
      const ny = p.y - v * SPEED_SCALE; // trục y màn hình hướng xuống
      p.age++;
      if (p.age > p.maxAge || nx < 0 || ny < 0 || nx > W || ny > H || sample(flowMask, nx, ny) < 0.15) {
        spawn(p);
        continue;
      }
      fctx.moveTo(p.x, p.y);
      fctx.lineTo(nx, ny);
      p.x = nx;
      p.y = ny;
    }
    fctx.stroke();
  }

  // ----------------------------- Vòng đời -------------------------------
  function redraw() {
    computeGrid();
    drawColor();
    drawIso();
  }

  function rebuild() {
    resize();
    redraw();
    resetParticles();
    pane.style.opacity = 1;
  }

  map.on("zoomstart", () => (pane.style.opacity = 0));
  map.on("moveend", rebuild);
  map.on("resize", rebuild);

  if (!reduceMotion) requestAnimationFrame(frame);

  /** Nội suy song tuyến tại một điểm màn hình */
  function bilinear(grid, x, y) {
    const fx = x / CELL, fy = y / CELL;
    const i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= cols - 1 || j >= rows - 1) return null;
    const tx = fx - i, ty = fy - j;
    const o = j * cols + i;
    return (
      grid[o] * (1 - tx) * (1 - ty) + grid[o + 1] * tx * (1 - ty) +
      grid[o + cols] * (1 - tx) * ty + grid[o + cols + 1] * tx * ty
    );
  }

  return {
    setData(data) {
      input = data;
      if (!W) resize();
      redraw();
      if (!particles.length) resetParticles();
    },

    /** Vẽ lại (vd khi đổi đơn vị — nhãn đường đẳng trị thay đổi) */
    redraw() {
      if (input) redraw();
    },

    setParticles(on) {
      particlesOn = on;
      fctx.clearRect(0, 0, W, H);
    },

    /**
     * Giá trị tại điểm màn hình (x, y) — cho "picker" khi rê chuột.
     * @returns {{value:number, mask:number, u:number|null, v:number|null} | null}
     */
    sampleAt(x, y) {
      if (!input || !valGrid) return null;
      const value = bilinear(valGrid, x, y);
      if (value == null) return null;
      return {
        value,
        mask: bilinear(valMask, x, y),
        u: uGrid ? bilinear(uGrid, x, y) : null,
        v: vGrid ? bilinear(vGrid, x, y) : null,
      };
    },
  };
}
