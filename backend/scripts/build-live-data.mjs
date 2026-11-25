// backend/scripts/build-live-data.mjs
// Chụp sẵn dữ liệu bản đồ thành file JSON tĩnh cho bản GitHub Pages.
//
// Ở chế độ tĩnh (không backend), nếu mỗi người xem tự tải dữ liệu ~500 toạ độ từ
// Open-Meteo thì lần đầu mở bản đồ mất cả phút. GitHub Actions chạy script này mỗi
// giờ (xem .github/workflows/pages.yml) → người xem chỉ cần tải vài file JSON có sẵn.
// File cũ quá 3 giờ hoặc thiếu thì trình duyệt tự lấy trực tiếp như bình thường.
//
// Chạy thử:  node backend/scripts/build-live-data.mjs frontend/data/live
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const svc = await import(new URL("../../frontend/js/core/service.js", import.meta.url));
const outDir = path.resolve(process.argv[2] || path.join(here, "..", "..", "frontend", "data", "live"));
await fs.mkdir(outDir, { recursive: true });

/** Mỗi tập dữ liệu chạy độc lập: lỗi tập nào thì bỏ tập đó, các tập khác vẫn được ghi */
const jobs = [
  ["overview", () => svc.overview(), true],
  ["grid-base", () => svc.grid("base"), true],
  ["storms", () => svc.storms(30), false],
  ["grid-marine", () => svc.grid("marine"), false],
  ["grid-air", () => svc.grid("air"), false],
];

let failedRequired = 0;
for (const [name, run, required] of jobs) {
  const t0 = Date.now();
  try {
    const data = await run();
    const body = JSON.stringify({ ...data, snapshotAt: new Date().toISOString() });
    await fs.writeFile(path.join(outDir, `${name}.json`), body);
    console.log(`✓ ${name}.json  ${(body.length / 1e6).toFixed(2)} MB  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    if (required) failedRequired++;
    console.warn(`✗ ${name}: ${err.message} (trình duyệt sẽ tự lấy trực tiếp)`);
  }
}
console.log(failedRequired ? "Một số dữ liệu chính lỗi — trang vẫn chạy nhưng tải chậm hơn." : "Xong.");
// Thoát hẳn (bộ dọn cache trong core dùng setInterval)
process.exit(0);
