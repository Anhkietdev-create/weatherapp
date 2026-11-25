// js/core/wmo.js
// Module DÙNG CHUNG cho trình duyệt (GitHub Pages) và backend Node (npm start).
// Chuyển từ backend/utils/wmo.js — chỉ dùng fetch/setTimeout nên chạy được ở cả hai môi trường.
// Chuyển mã thời tiết WMO (Open-Meteo trả về) sang mô tả tiếng Việt + biểu tượng.

const TABLE = {
  0:  ["Trời quang", "☀️", "🌙"],
  1:  ["Ít mây", "🌤", "🌙"],
  2:  ["Mây rải rác", "⛅", "☁️"],
  3:  ["Nhiều mây", "☁️", "☁️"],
  45: ["Sương mù", "🌫", "🌫"],
  48: ["Sương mù giá", "🌫", "🌫"],
  51: ["Mưa phùn nhẹ", "🌦", "🌧"],
  53: ["Mưa phùn", "🌦", "🌧"],
  55: ["Mưa phùn dày", "🌧", "🌧"],
  56: ["Mưa phùn lạnh", "🌧", "🌧"],
  57: ["Mưa phùn lạnh", "🌧", "🌧"],
  61: ["Mưa nhỏ", "🌦", "🌧"],
  63: ["Mưa vừa", "🌧", "🌧"],
  65: ["Mưa to", "🌧", "🌧"],
  66: ["Mưa lạnh", "🌧", "🌧"],
  67: ["Mưa lạnh to", "🌧", "🌧"],
  71: ["Tuyết nhẹ", "🌨", "🌨"],
  73: ["Tuyết", "🌨", "🌨"],
  75: ["Tuyết dày", "❄️", "❄️"],
  77: ["Hạt tuyết", "🌨", "🌨"],
  80: ["Mưa rào nhẹ", "🌦", "🌧"],
  81: ["Mưa rào", "🌧", "🌧"],
  82: ["Mưa rào rất to", "⛈", "⛈"],
  85: ["Mưa tuyết", "🌨", "🌨"],
  86: ["Mưa tuyết dày", "🌨", "🌨"],
  95: ["Dông", "⛈", "⛈"],
  96: ["Dông kèm mưa đá", "⛈", "⛈"],
  99: ["Dông kèm mưa đá lớn", "⛈", "⛈"],
};

/** @returns {{cond:string, icon:string}} */
function describe(code, isDay = true) {
  const row = TABLE[code] || ["Không rõ", "❔", "❔"];
  return { cond: row[0], icon: isDay ? row[1] : row[2] };
}

export { describe };
