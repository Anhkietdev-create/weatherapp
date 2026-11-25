// js/config.js
// Địa chỉ gốc của backend API. Vì server Express phục vụ luôn cả frontend
// (static files) nên dùng đường dẫn tương đối "/api" là đủ.
// Nếu bạn chạy frontend ở origin khác (vd Live Server cổng 5500) thì đổi
// thành "http://localhost:4000/api".
export const API_BASE = "/api";

export const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const dayNamesLong = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

/** Khung bản đồ Việt Nam, gồm cả Hoàng Sa & Trường Sa */
export const VN_BOUNDS = [[8.2, 102.1], [23.4, 112.3]];

/** Khung bản đồ châu Á (khung mặc định khi mở trang) */
export const ASIA_BOUNDS = [[-10, 30], [58, 148]];

/**
 * Mức zoom tối thiểu để hiện ghim theo cấp:
 * 1 = thủ đô (luôn hiện), 2 = thành phố lớn / tỉnh VN, 3 = địa điểm nhỏ ở VN
 */
export const TIER_MIN_ZOOM = { 1: 0, 2: 5, 3: 7 };

/** Địa điểm mở mặc định khi vào trang lần đầu */
export const DEFAULT_LOCATION_ID = "hanoi";

/** Tự làm mới dữ liệu sau mỗi khoảng thời gian này (ms) */
export const REFRESH_MS = 20 * 60 * 1000;

/**
 * Các lớp bản đồ.
 *  - key:    tên chuỗi dữ liệu trong overview/lưới
 *  - source: base (lưới chính) | marine (sóng biển) | air (chất lượng không khí)
 *  - kind:   temp → đổi °C/°F, wind → đổi km/h · m/s · kt
 *  - flow:   hạt chuyển động theo gió (wind) hoặc theo hướng sóng (wave)
 *  - stops:  thang màu [giá trị, màu hex, độ mờ tuỳ chọn]
 *  - reach/fade: (km) vùng phủ của mỗi điểm dữ liệu và độ dài vùng mờ dần
 */
export const layerMeta = {
  wind: {
    label: "Gió", short: "GIÓ", icon: "💨", key: "wind", source: "base", kind: "wind", unit: "km/h", flow: "wind",
    desc: "Tốc độ gió ở độ cao 10 m",
    stops: [[0, "#2c3f78"], [5, "#2f6db0"], [10, "#25a3a6"], [18, "#4fcf6f"], [28, "#e6d74a"], [40, "#ff8b3d"], [60, "#e8384f"], [90, "#a1206b"]],
  },
  gust: {
    label: "Gió giật", short: "GIẬT", icon: "🌬", key: "gust", source: "base", kind: "wind", unit: "km/h", flow: "wind",
    desc: "Tốc độ gió giật mạnh nhất trong giờ",
    stops: [[0, "#2c3f78"], [10, "#2f6db0"], [20, "#25a3a6"], [35, "#4fcf6f"], [50, "#e6d74a"], [65, "#ff8b3d"], [90, "#e8384f"], [120, "#a1206b"]],
  },
  temp: {
    label: "Nhiệt độ", short: "NHIỆT", icon: "🌡", key: "temp", source: "base", kind: "temp", unit: "°C", flow: "wind",
    desc: "Nhiệt độ không khí ở độ cao 2 m",
    stops: [[-20, "#e6e6ff"], [-5, "#8a6bff"], [5, "#6a4bff"], [12, "#3f7dff"], [17, "#2fc2e0"], [21, "#4fd58b"], [25, "#c6e04a"], [28, "#ffd166"], [31, "#ff9d4d"], [35, "#ff5a4d"], [40, "#c2185b"]],
  },
  feels: {
    label: "Cảm giác như", short: "C.GIÁC", icon: "🥵", key: "feels", source: "base", kind: "temp", unit: "°C", flow: "wind",
    desc: "Nhiệt độ cảm nhận (tính cả độ ẩm, gió, bức xạ)",
    stops: [[-20, "#e6e6ff"], [-5, "#8a6bff"], [5, "#6a4bff"], [12, "#3f7dff"], [17, "#2fc2e0"], [21, "#4fd58b"], [26, "#c6e04a"], [30, "#ffd166"], [34, "#ff9d4d"], [39, "#ff5a4d"], [45, "#8e1450"]],
  },
  dew: {
    label: "Điểm sương", short: "SƯƠNG", icon: "💧", key: "dew", source: "base", kind: "temp", unit: "°C", flow: "wind",
    desc: "Nhiệt độ mà không khí bão hoà hơi nước — càng cao càng oi",
    stops: [[-10, "#7a5a3d"], [0, "#a07b4f"], [8, "#c9a86a"], [14, "#c9d36a"], [18, "#6fcf7f"], [21, "#2fb5a8"], [24, "#2f7de1"], [27, "#5b3fd1"]],
  },
  humidity: {
    label: "Độ ẩm", short: "ẨM", icon: "💦", key: "humidity", source: "base", unit: "%", flow: "wind",
    desc: "Độ ẩm tương đối ở độ cao 2 m",
    stops: [[10, "#8a4a2a"], [30, "#c9843f"], [50, "#d9c25a"], [65, "#7fd06b"], [80, "#2fc2e0"], [90, "#2f7de1"], [100, "#4a35b8"]],
  },
  rain: {
    label: "Lượng mưa", short: "MƯA", icon: "🌧", key: "rain", source: "base", unit: "mm/h", flow: "wind",
    desc: "Lượng mưa tích luỹ trong 1 giờ",
    stops: [[0, "#1a2740", 0.05], [0.1, "#1d4f91", 0.45], [1, "#2f7de1"], [3, "#3fc1ff"], [6, "#7b5cff"], [12, "#d14bff"], [25, "#ff4fa3"]],
  },
  rainacc: {
    label: "Mưa tích luỹ", short: "T.LUỸ", icon: "☔", key: "rain", accum: true, source: "base", unit: "mm", flow: "wind",
    desc: "Tổng lượng mưa từ bây giờ đến hết khoảng thời gian chọn trong Cài đặt (24 giờ / 3 ngày / 5 ngày)",
    stops: [[0, "#1a2740", 0.05], [1, "#1d4f91", 0.4], [5, "#2f7de1"], [15, "#3fc1ff"], [30, "#4fcf6f"], [50, "#e6d74a"], [100, "#ff8b3d"], [200, "#e8384f"], [400, "#b02a8a"]],
  },
  cloud: {
    label: "Mây", short: "MÂY", icon: "☁️", key: "cloud", source: "base", unit: "%", flow: "wind",
    desc: "Tổng lượng mây che phủ",
    stops: [[0, "#14233a", 0.1], [30, "#2c3e57", 0.4], [60, "#5a6b80"], [100, "#c9d3de"]],
  },
  cape: {
    label: "Dông (CAPE)", short: "DÔNG", icon: "⛈", key: "cape", source: "base", unit: "J/kg", flow: "wind",
    desc: "Năng lượng đối lưu — trên 1000 J/kg dễ có dông, trên 2500 dông mạnh",
    stops: [[0, "#14233a", 0.05], [100, "#1d4f91", 0.3], [500, "#2b9aa0"], [1000, "#4fcf6f"], [1500, "#e6d74a"], [2500, "#ff8b3d"], [3500, "#e8384f"], [5000, "#b02a8a"]],
  },
  pressure: {
    label: "Áp suất", short: "ÁP", icon: "⏱", key: "pressure", source: "base", unit: "hPa", flow: "wind",
    desc: "Áp suất quy về mực nước biển",
    stops: [[990, "#3b1d5e"], [998, "#5a2d82"], [1004, "#7a5cc8"], [1008, "#5b8def"], [1012, "#47c1c0"], [1016, "#9bd96b"], [1020, "#f2d64b"], [1026, "#ff9d4d"], [1034, "#e8384f"]],
  },
  waves: {
    label: "Sóng biển", short: "SÓNG", icon: "🌊", key: "wave", source: "marine", unit: "m", flow: "wave",
    reach: 0, fade: 140,
    desc: "Độ cao sóng có ý nghĩa — hạt chuyển động theo hướng truyền sóng",
    stops: [[0, "#1b3a6b"], [0.5, "#2b6aa0"], [1, "#25a3a6"], [1.5, "#4fcf6f"], [2.5, "#e6d74a"], [4, "#ff8b3d"], [6, "#e8384f"], [9, "#a1206b"]],
  },
  pm25: {
    label: "Bụi mịn PM2.5", short: "PM2.5", icon: "😷", key: "pm25", source: "air", unit: "µg/m³", flow: "wind",
    desc: "Nồng độ bụi mịn PM2.5 (mô hình CAMS)",
    stops: [[0, "#3fae6a"], [12, "#9bd96b"], [25, "#e6d74a"], [35, "#ffb84d"], [55, "#ff7a3d"], [100, "#e8384f"], [150, "#a62a8a"], [250, "#6b1a3a"]],
  },
};

/** Lớp có nút riêng trên thanh bên trái; các lớp khác nằm trong menu "Thêm" */
export const PRIMARY_LAYERS = ["wind", "temp", "rain", "cloud", "pressure"];

/** Nhóm lớp trong menu "Thêm lớp" */
export const LAYER_GROUPS = [
  ["Gió", ["wind", "gust"]],
  ["Nhiệt độ & độ ẩm", ["temp", "feels", "dew", "humidity"]],
  ["Mưa, mây & dông", ["rain", "rainacc", "cloud", "cape"]],
  ["Áp suất, biển & không khí", ["pressure", "waves", "pm25"]],
];

/** Nền bản đồ (Esri, không cần API key) + lớp nhãn/ranh giới vẽ ĐÈ lên lớp màu */
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
export const BASEMAPS = {
  dark: {
    label: "Tối",
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    ref: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    maxNative: 16,
  },
  terrain: {
    label: "Địa hình",
    url: `${ESRI}/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}`,
    ref: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    maxNative: 13,
  },
  satellite: {
    label: "Vệ tinh",
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    ref: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    maxNative: 16,
  },
};

/** Đơn vị gió: hệ số đổi từ km/h */
export const WIND_UNITS = {
  kmh: { label: "km/h", f: 1 },
  ms: { label: "m/s", f: 1 / 3.6 },
  kt: { label: "kt", f: 1 / 1.852 },
};

/** Khoảng thời gian cộng dồn của lớp "Mưa tích luỹ" (giờ) */
export const ACC_PERIODS = { 24: "24 giờ tới", 72: "3 ngày tới", 120: "5 ngày tới" };

/**
 * Màu quỹ đạo bão theo cấp của JTWC/GDACS: TD áp thấp nhiệt đới, TS bão nhiệt đới,
 * HU/TY bão cuồng phong (typhoon), ST/STY siêu bão.
 */
export const STORM_COLORS = {
  TD: "#6fb1ff", TS: "#4fd58b", STS: "#e6d74a", HU: "#ff8b3d", TY: "#ff8b3d", ST: "#e8384f", STY: "#e8384f",
};
export const STORM_CAT_LABEL = {
  TD: "Áp thấp nhiệt đới", TS: "Bão", STS: "Bão mạnh", HU: "Bão rất mạnh", TY: "Bão rất mạnh", ST: "Siêu bão", STY: "Siêu bão",
};

/** Màu của từng mô hình trong phần so sánh */
export const MODEL_COLORS = {
  ecmwf_ifs025: "#37e0ff",
  gfs_seamless: "#ff9d4d",
  icon_seamless: "#4fd58b",
  jma_seamless: "#c497ff",
};
