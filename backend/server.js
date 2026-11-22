// backend/server.js
require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const weatherRouter = require("./routes/weather");
const meteo = require("./services/openMeteo");
const locations = require("./data/locations");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(compression()); // nén gzip — dữ liệu lưới 5 ngày khá lớn (vài MB → vài trăm KB)
app.use(express.json());

// ----- API -----
app.use("/api", weatherRouter);

// ----- 404 cho API -----
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Không tìm thấy endpoint" });
});

// ----- Frontend tĩnh (thư mục ../frontend) -----
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR));

// Trả về index.html cho mọi route còn lại (điều hướng phía client)
app.get("*", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// ----- Xử lý lỗi chung (vd: Open-Meteo không phản hồi) -----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[Lỗi]", req.method, req.originalUrl, "-", err.message);
  res.status(502).json({ error: "Không lấy được dữ liệu thời tiết từ nguồn. Vui lòng thử lại sau." });
});

app.listen(PORT, () => {
  console.log(`🌬️  Luồng Gió backend đang chạy tại http://localhost:${PORT}`);

  // Tải sẵn dữ liệu bản đồ để người dùng đầu tiên không phải chờ.
  // (Sau đó chỉ làm mới khi có người truy cập, để tiết kiệm hạn mức API.)
  meteo.warmUp(locations);
});
