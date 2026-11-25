# Luồng Gió — Bản đồ dự báo thời tiết Việt Nam (lấy cảm hứng từ Windy)

Web dự báo thời tiết **dữ liệu thật** cho toàn bộ Việt Nam trên bản đồ tương tác:
12 lớp màu (gió, gió giật, nhiệt độ, cảm giác, điểm sương, độ ẩm, mưa, mây,
dông/CAPE, áp suất, sóng biển, bụi mịn PM2.5), hạt chuyển động theo gió thật,
đường đẳng áp/đẳng nhiệt, radar mưa trực tiếp, timeline 5 ngày, dự báo 10 ngày,
so sánh 4 mô hình dự báo (ECMWF, GFS, ICON, JMA).

- **Backend:** Node.js/Express, lấy dữ liệu từ [Open-Meteo](https://open-meteo.com/)
  (miễn phí, **không cần API key**), có cache trong bộ nhớ.
- **Frontend:** HTML/CSS/JS thuần (ES Modules), bản đồ [Leaflet](https://leafletjs.com/).

## Tính năng

- 34 tỉnh/thành theo đơn vị hành chính mới (từ 01/07/2025) và khoảng 40 đô thị,
  điểm du lịch, huyện đảo (Sa Pa, Phú Quốc, Côn Đảo, Lý Sơn, Hoàng Sa, Trường Sa…).
  Các địa điểm phụ hiện khi phóng to bản đồ.
- **Xem dự báo ở bất kỳ đâu:** bấm thẳng lên bản đồ, hoặc tìm mọi địa danh trong Việt Nam
  (tìm được cả khi gõ không dấu, ví dụ "da lat").
- **Dự báo tại vị trí thực của bạn** (nút định vị, link `#me`):
  - lấy vị trí GPS/Wi-Fi của thiết bị, hiện chấm xanh + vòng sai số trên bản đồ;
  - tên địa danh thật tới phường/xã (OpenStreetMap Nominatim), ví dụ "Phường Hải Châu · Đà Nẵng";
  - **theo dõi khi di chuyển**: đi xa hơn 2 km thì tự cập nhật dự báo (bấm lại nút để tắt);
  - lần đầu mở trang sẽ hỏi có dùng vị trí không; đồng ý thì những lần sau tự mở tại
    vị trí của bạn (bật/tắt trong Cài đặt). Vị trí không được lưu trên máy chủ.
  - Lưu ý: trình duyệt chỉ cho định vị trên **HTTPS** hoặc **http://localhost**.
- **Mưa 2 giờ tới** (bước 15 phút): "Không mưa", "Mưa có thể bắt đầu khoảng 17:30",
  "Đang mưa, có thể tạnh khoảng 18:15"… cho mọi địa điểm.
- **13 lớp bản đồ** (5 lớp chính trên thanh bên trái, các lớp còn lại trong menu
  **Thêm**): Gió, Gió giật, Nhiệt độ, Cảm giác như, Điểm sương, Độ ẩm, Mưa, Mây,
  Dông (CAPE), Áp suất, **Mưa tích luỹ** (24 giờ / 3 ngày / 5 ngày tới), **Sóng biển** (hạt chạy theo hướng truyền sóng) và
  **Bụi mịn PM2.5**. Lớp sóng & PM2.5 chỉ tải khi được mở để tiết kiệm hạn mức API.
- Màu được nội suy (IDW) từ các địa điểm + lưới phủ Việt Nam và châu Á; chú giải
  dạng thang phi tuyến có mốc số giống Windy.
- **Đường đẳng trị**: đẳng áp (isobar) hoặc đẳng nhiệt, có nhãn giá trị
  (chế độ Tự động: đẳng áp khi xem áp suất, đẳng nhiệt khi xem nhiệt độ).
- **Rê chuột** trên bản đồ để xem giá trị tại con trỏ + hướng/tốc độ gió.
- **Bão & áp thấp nhiệt đới** (GDACS/JTWC): quỹ đạo tô màu theo cấp, đường dự báo
  nét đứt, nón sai số, bấm biểu tượng 🌀 xem cấp gió (thang Việt Nam), gió mạnh nhất…
  Menu liệt kê bão đang hoạt động và trong 30 ngày qua; panel cảnh báo khi bão cách
  địa điểm đang xem dưới 600 km. Phím `B` bật/tắt.
- Thước tỉ lệ (km) và toạ độ tại con trỏ.
- **Radar mưa trực tiếp** (RainViewer, ~1 giờ gần nhất, có hoạt ảnh) — phím `R`.
- **Cài đặt bản đồ**: nền Tối / Địa hình / Vệ tinh, bật/tắt tên địa danh & ranh giới
  (vẽ đè lên lớp màu), bật/tắt hạt chuyển động, đường đẳng trị, đơn vị gió
  km/h · m/s · kt. Mọi cài đặt được ghi nhớ.
- Timeline **5 ngày** theo giờ Việt Nam: kéo, bấm, phím ← → (Shift: 6 giờ,
  PageUp/PageDown: 1 ngày, Home/End), Space để phát/dừng. Phím 1–9 đổi lớp.
- Panel chi tiết gồm: **cảnh báo** (nắng nóng, rét đậm/rét hại, mưa to, gió giật
  mạnh, dông, không khí xấu — bấm để nhảy tới ngày đó), nhiệt độ, cảm giác như,
  gió (hướng, cấp Beaufort, gió giật), độ ẩm + điểm sương, mưa, áp suất kèm xu
  hướng 3 giờ, mây, tầm nhìn, UV, CAPE, AQI và PM2.5, mặt trời mọc/lặn, biểu đồ
  nhiệt độ + mưa 5 ngày, dự báo 10 ngày.
- **So sánh mô hình**: biểu đồ nhiệt độ 7 ngày của ECMWF, GFS, ICON, JMA và bảng
  cao/thấp/mưa từng ngày, kèm chấm độ tin cậy (các mô hình càng giống nhau càng chắc).
- **Yêu thích**: bấm ☆ trong panel, danh sách hiện khi bấm vào ô tìm kiếm trống.
  Nút 🔗 sao chép link chia sẻ (`#hanoi`, `#@10.93,108.28`).
- Chuyển °C/°F (được ghi nhớ).
- Tự làm mới dữ liệu mỗi 20 phút. Giao diện dùng được trên mobile.

## Cách chạy

Yêu cầu **Node.js ≥ 18** và có kết nối Internet.

```bash
cd weather-app/backend
npm install
npm start            # hoặc: npm run dev (nodemon, tự reload)
```

Sau đó mở **http://localhost:4000**. Backend phục vụ luôn cả frontend.
Muốn đổi cổng thì sao chép `.env.example` thành `.env` rồi sửa `PORT`.

Muốn chạy frontend riêng (Live Server, Vite…): đổi `API_BASE` trong
`frontend/js/config.js` thành `"http://localhost:4000/api"` (backend đã bật CORS).

## Cây thư mục

```
weather-app/
├── backend/
│   ├── data/locations.js      # 34 tỉnh/thành + các địa điểm khác (toạ độ thật)
│   ├── routes/weather.js      # Các endpoint /api/...
│   ├── services/openMeteo.js  # Gọi Open-Meteo, chuẩn hoá dữ liệu, cache
│   ├── services/storms.js     # Bão từ GDACS: quỹ đạo, dự báo, nón sai số
│   ├── services/reverse.js    # Toạ độ → tên phường/xã (Nominatim, ≤1 request/giây)
│   ├── utils/wmo.js           # Mã thời tiết WMO → mô tả tiếng Việt + icon
│   ├── server.js              # Express: API + frontend tĩnh + tải trước dữ liệu
│   └── package.json
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── main.js            # Điểm khởi động, kết nối các module
        ├── api.js             # Gọi API backend
        ├── config.js          # Hằng số: thang màu các lớp, khung bản đồ…
        ├── state.js           # Trạng thái dùng chung
        ├── utils.js           # Định dạng, thời gian, thang màu
        └── ui/
            ├── map.js         # Bản đồ Leaflet + ghim địa điểm
            ├── fieldLayer.js  # Lớp màu (IDW) + đường đẳng trị + hạt chuyển động + picker
            ├── radar.js       # Radar mưa trực tiếp (RainViewer)
            ├── storms.js      # Lớp bão: quỹ đạo, nón dự báo, danh sách
            ├── geolocate.js   # Vị trí thực: GPS, chấm xanh, theo dõi khi di chuyển
            ├── panel.js       # Panel chi tiết
            ├── timeline.js    # Timeline 5 ngày
            ├── search.js      # Tìm kiếm địa điểm
            └── controls.js    # Đơn vị, chọn lớp, cài đặt, chú giải, thông báo
```

## API

| Method | Endpoint                              | Mô tả                                                        |
|--------|---------------------------------------|--------------------------------------------------------------|
| GET    | `/api/cities`                         | Danh sách địa điểm có sẵn                                     |
| GET    | `/api/search?q=...`                   | Tìm địa điểm có sẵn và mọi địa danh trong Việt Nam            |
| GET    | `/api/overview`                       | Dữ liệu 5 ngày rút gọn của mọi địa điểm (để vẽ bản đồ)       |
| GET    | `/api/grid`                           | Lưới điểm phủ toàn vùng (cho lớp màu và hạt gió)              |
| GET    | `/api/grid?set=marine` · `set=air`    | Lưới sóng biển / bụi mịn PM2.5 (tải khi mở lớp tương ứng)     |
| GET    | `/api/weather/:id`                    | Dự báo đầy đủ: 5 ngày theo giờ, 10 ngày, AQI                  |
| GET    | `/api/weather/:id/hourly` · `/daily`  | Chỉ phần theo giờ / theo ngày                                |
| GET    | `/api/forecast?lat=..&lon=..`         | Dự báo đầy đủ tại một toạ độ bất kỳ trong khu vực châu Á      |
| GET    | `/api/reverse?lat=..&lon=..`          | Tên địa danh tại toạ độ (phường/xã, tỉnh) — Nominatim          |
| GET    | `/api/storms?days=30`                 | Bão/áp thấp nhiệt đới đang hoạt động & gần đây ở châu Á       |
| GET    | `/api/models?lat=..&lon=..`           | So sánh dự báo 7 ngày của ECMWF, GFS, ICON, JMA              |

## Nguồn dữ liệu và bản quyền

- Thời tiết, chất lượng không khí, địa danh: [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).
- Sóng biển: Open-Meteo Marine · Bụi mịn: Open-Meteo Air Quality (mô hình CAMS).
- Tên địa danh theo vị trí: [OpenStreetMap Nominatim](https://nominatim.org/) (© OpenStreetMap, ODbL).
- Bão: [GDACS](https://www.gdacs.org/) (dữ liệu JTWC).
- Radar: [RainViewer](https://www.rainviewer.com/) (chỉ có ở nơi có trạm radar).
- Nền bản đồ & nhãn: Esri (World Dark Gray, World Terrain, World Imagery).

## Lưu ý về tốc độ

Lần đầu khởi động, backend tải trước dữ liệu bản đồ 5 ngày (~500 toạ độ). Khi
Open-Meteo đông, việc này có thể mất 1–3 phút; sau đó dữ liệu được cache và làm
mới ngầm. Lần đầu mở lớp Sóng biển / PM2.5 cũng cần chờ tải lưới tương ứng.
