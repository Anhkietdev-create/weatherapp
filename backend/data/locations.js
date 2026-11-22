// backend/data/locations.js
// Danh sách địa điểm hiển thị trên bản đồ: Việt Nam (chi tiết) + châu Á.
//
// Việt Nam: major=true → trung tâm hành chính của 34 tỉnh/thành (theo sắp xếp
// đơn vị hành chính có hiệu lực từ 01/07/2025); major=false → tỉnh lỵ cũ,
// điểm du lịch, huyện đảo. Cuối file chuyển thành `tier` (1/2/3) — cấp hiển
// thị theo mức phóng to của bản đồ.
//
// Ngoài danh sách này, người dùng vẫn xem được dự báo ở BẤT KỲ đâu trong châu Á
// bằng cách tìm kiếm địa danh hoặc bấm trực tiếp lên bản đồ.

const R = {
  TB: "Tây Bắc Bộ",
  DB: "Đông Bắc Bộ",
  DBSH: "Đồng bằng sông Hồng",
  BTB: "Bắc Trung Bộ",
  NTB: "Nam Trung Bộ",
  TN: "Tây Nguyên",
  DNB: "Đông Nam Bộ",
  DBSCL: "Đồng bằng sông Cửu Long",
  BIEN: "Biển Đông",
};

// [id, tên, tỉnh/thành, vùng, lat, lon, major]
const rows = [
  // ===== 6 thành phố trực thuộc trung ương =====
  ["hanoi",       "Hà Nội",            "TP. Hà Nội",        R.DBSH, 21.0285, 105.8542, true],
  ["haiphong",    "Hải Phòng",         "TP. Hải Phòng",     R.DBSH, 20.8449, 106.6881, true],
  ["hue",         "Huế",               "TP. Huế",           R.BTB,  16.4637, 107.5909, true],
  ["danang",      "Đà Nẵng",           "TP. Đà Nẵng",       R.NTB,  16.0544, 108.2022, true],
  ["hcm",         "TP. Hồ Chí Minh",   "TP. Hồ Chí Minh",   R.DNB,  10.7769, 106.7009, true],
  ["cantho",      "Cần Thơ",           "TP. Cần Thơ",       R.DBSCL, 10.0452, 105.7469, true],

  // ===== 28 tỉnh =====
  ["laichau",     "Lai Châu",          "Lai Châu",          R.TB,   22.3964, 103.4582, true],
  ["dienbien",    "Điện Biên Phủ",     "Điện Biên",         R.TB,   21.3860, 103.0230, true],
  ["sonla",       "Sơn La",            "Sơn La",            R.TB,   21.3256, 103.9188, true],
  ["laocai",      "Yên Bái",           "Lào Cai",           R.TB,   21.7229, 104.9113, true],
  ["caobang",     "Cao Bằng",          "Cao Bằng",          R.DB,   22.6657, 106.2570, true],
  ["langson",     "Lạng Sơn",          "Lạng Sơn",          R.DB,   21.8537, 106.7615, true],
  ["tuyenquang",  "Tuyên Quang",       "Tuyên Quang",       R.DB,   21.8236, 105.2180, true],
  ["thainguyen",  "Thái Nguyên",       "Thái Nguyên",       R.DB,   21.5942, 105.8482, true],
  ["phutho",      "Việt Trì",          "Phú Thọ",           R.DB,   21.3227, 105.4019, true],
  ["quangninh",   "Hạ Long",           "Quảng Ninh",        R.DB,   20.9599, 107.0425, true],
  ["bacninh",     "Bắc Giang",         "Bắc Ninh",          R.DBSH, 21.2731, 106.1946, true],
  ["hungyen",     "Hưng Yên",          "Hưng Yên",          R.DBSH, 20.6464, 106.0511, true],
  ["ninhbinh",    "Ninh Bình",         "Ninh Bình",         R.DBSH, 20.2506, 105.9745, true],
  ["thanhhoa",    "Thanh Hóa",         "Thanh Hóa",         R.BTB,  19.8067, 105.7852, true],
  ["nghean",      "Vinh",              "Nghệ An",           R.BTB,  18.6796, 105.6813, true],
  ["hatinh",      "Hà Tĩnh",           "Hà Tĩnh",           R.BTB,  18.3428, 105.9057, true],
  ["quangtri",    "Đồng Hới",          "Quảng Trị",         R.BTB,  17.4689, 106.6223, true],
  ["quangngai",   "Quảng Ngãi",        "Quảng Ngãi",        R.NTB,  15.1205, 108.7923, true],
  ["gialai",      "Quy Nhơn",          "Gia Lai",           R.NTB,  13.7820, 109.2192, true],
  ["daklak",      "Buôn Ma Thuột",     "Đắk Lắk",           R.TN,   12.6667, 108.0500, true],
  ["khanhhoa",    "Nha Trang",         "Khánh Hòa",         R.NTB,  12.2388, 109.1967, true],
  ["lamdong",     "Đà Lạt",            "Lâm Đồng",          R.TN,   11.9404, 108.4583, true],
  ["dongnai",     "Biên Hòa",          "Đồng Nai",          R.DNB,  10.9574, 106.8429, true],
  ["tayninh",     "Tân An",            "Tây Ninh",          R.DNB,  10.5360, 106.4130, true],
  ["dongthap",    "Mỹ Tho",            "Đồng Tháp",         R.DBSCL, 10.3600, 106.3600, true],
  ["vinhlong",    "Vĩnh Long",         "Vĩnh Long",         R.DBSCL, 10.2537, 105.9722, true],
  ["angiang",     "Rạch Giá",          "An Giang",          R.DBSCL, 10.0125, 105.0809, true],
  ["camau",       "Cà Mau",            "Cà Mau",            R.DBSCL,  9.1769, 105.1524, true],

  // ===== Đô thị / địa danh khác =====
  ["sapa",        "Sa Pa",             "Lào Cai",           R.TB,   22.3364, 103.8438, false],
  ["tplaocai",    "TP. Lào Cai",       "Lào Cai",           R.TB,   22.4856, 103.9707, false],
  ["mocchau",     "Mộc Châu",          "Sơn La",            R.TB,   20.8478, 104.6366, false],
  ["hagiang",     "Hà Giang",          "Tuyên Quang",       R.DB,   22.8233, 104.9836, false],
  ["backan",      "Bắc Kạn",           "Thái Nguyên",       R.DB,   22.1470, 105.8348, false],
  ["hoabinh",     "Hòa Bình",          "Phú Thọ",           R.TB,   20.8171, 105.3376, false],
  ["vinhyen",     "Vĩnh Yên",          "Phú Thọ",           R.DBSH, 21.3089, 105.6049, false],
  ["tpbacninh",   "TP. Bắc Ninh",      "Bắc Ninh",          R.DBSH, 21.1861, 106.0763, false],
  ["haiduong",    "Hải Dương",         "TP. Hải Phòng",     R.DBSH, 20.9373, 106.3146, false],
  ["catba",       "Cát Bà",            "TP. Hải Phòng",     R.DBSH, 20.7270, 107.0480, false],
  ["bachlongvi",  "Bạch Long Vĩ",      "TP. Hải Phòng",     R.BIEN, 20.1330, 107.7280, false],
  ["mongcai",     "Móng Cái",          "Quảng Ninh",        R.DB,   21.5240, 107.9660, false],
  ["thaibinh",    "Thái Bình",         "Hưng Yên",          R.DBSH, 20.4463, 106.3366, false],
  ["namdinh",     "Nam Định",          "Ninh Bình",         R.DBSH, 20.4200, 106.1683, false],
  ["phuly",       "Phủ Lý",            "Ninh Bình",         R.DBSH, 20.5411, 105.9139, false],
  ["dongha",      "Đông Hà",           "Quảng Trị",         R.BTB,  16.8163, 107.1003, false],
  ["hoian",       "Hội An",            "TP. Đà Nẵng",       R.NTB,  15.8801, 108.3380, false],
  ["tamky",       "Tam Kỳ",            "TP. Đà Nẵng",       R.NTB,  15.5736, 108.4740, false],
  ["hoangsa",     "Quần đảo Hoàng Sa", "TP. Đà Nẵng",       R.BIEN, 16.5333, 111.6167, false],
  ["lyson",       "Lý Sơn",            "Quảng Ngãi",        R.BIEN, 15.3800, 109.1200, false],
  ["kontum",      "Kon Tum",           "Quảng Ngãi",        R.TN,   14.3545, 108.0076, false],
  ["pleiku",      "Pleiku",            "Gia Lai",           R.TN,   13.9833, 108.0000, false],
  ["tuyhoa",      "Tuy Hòa",           "Đắk Lắk",           R.NTB,  13.0955, 109.3209, false],
  ["phanrang",    "Phan Rang",         "Khánh Hòa",         R.NTB,  11.5643, 108.9886, false],
  ["truongsa",    "Quần đảo Trường Sa","Khánh Hòa",         R.BIEN,  8.6447, 111.9200, false],
  ["gianghia",    "Gia Nghĩa",         "Lâm Đồng",          R.TN,   12.0042, 107.6907, false],
  ["phanthiet",   "Phan Thiết",        "Lâm Đồng",          R.NTB,  10.9289, 108.1021, false],
  ["dongxoai",    "Đồng Xoài",         "Đồng Nai",          R.DNB,  11.5349, 106.8832, false],
  ["thudaumot",   "Thủ Dầu Một",       "TP. Hồ Chí Minh",   R.DNB,  10.9804, 106.6519, false],
  ["vungtau",     "Vũng Tàu",          "TP. Hồ Chí Minh",   R.DNB,  10.3460, 107.0843, false],
  ["condao",      "Côn Đảo",           "TP. Hồ Chí Minh",   R.BIEN,  8.6833, 106.6000, false],
  ["tptayninh",   "TP. Tây Ninh",      "Tây Ninh",          R.DNB,  11.3100, 106.0983, false],
  ["caolanh",     "Cao Lãnh",          "Đồng Tháp",         R.DBSCL, 10.4600, 105.6329, false],
  ["bentre",      "Bến Tre",           "Vĩnh Long",         R.DBSCL, 10.2434, 106.3756, false],
  ["travinh",     "Trà Vinh",          "Vĩnh Long",         R.DBSCL,  9.9347, 106.3453, false],
  ["longxuyen",   "Long Xuyên",        "An Giang",          R.DBSCL, 10.3864, 105.4352, false],
  ["chaudoc",     "Châu Đốc",          "An Giang",          R.DBSCL, 10.7000, 105.1167, false],
  ["phuquoc",     "Phú Quốc",          "An Giang",          R.BIEN, 10.2899, 103.9840, false],
  ["soctrang",    "Sóc Trăng",         "TP. Cần Thơ",       R.DBSCL,  9.6025, 105.9739, false],
  ["vithanh",     "Vị Thanh",          "TP. Cần Thơ",       R.DBSCL,  9.7845, 105.4701, false],
  ["baclieu",     "Bạc Liêu",          "Cà Mau",            R.DBSCL,  9.2940, 105.7216, false],
];

// ===========================================================================
// CHÂU Á — thủ đô (tier 1) và thành phố lớn (tier 2) của các nước châu Á.
// [id, tên tiếng Việt, quốc gia, tiểu vùng, lat, lon, tier]
// ===========================================================================
const A = {
  DA: "Đông Á", DNA: "Đông Nam Á", NA: "Nam Á", TA: "Trung Á", TAY: "Tây Á", BA: "Bắc Á",
};

const asiaRows = [
  // ----- Đông Á -----
  ["beijing",      "Bắc Kinh",          "Trung Quốc",        A.DA,  39.9042, 116.4074, 1],
  ["shanghai",     "Thượng Hải",        "Trung Quốc",        A.DA,  31.2304, 121.4737, 2],
  ["guangzhou",    "Quảng Châu",        "Trung Quốc",        A.DA,  23.1291, 113.2644, 2],
  ["shenzhen",     "Thâm Quyến",        "Trung Quốc",        A.DA,  22.5431, 114.0579, 2],
  ["hongkong",     "Hồng Kông",         "Trung Quốc",        A.DA,  22.3193, 114.1694, 2],
  ["macau",        "Ma Cao",            "Trung Quốc",        A.DA,  22.1987, 113.5439, 2],
  ["chongqing",    "Trùng Khánh",       "Trung Quốc",        A.DA,  29.5630, 106.5516, 2],
  ["chengdu",      "Thành Đô",          "Trung Quốc",        A.DA,  30.5728, 104.0668, 2],
  ["kunming",      "Côn Minh",          "Trung Quốc",        A.DA,  25.0389, 102.7183, 2],
  ["nanning",      "Nam Ninh",          "Trung Quốc",        A.DA,  22.8170, 108.3665, 2],
  ["haikou",       "Hải Khẩu",          "Trung Quốc",        A.DA,  20.0440, 110.1999, 2],
  ["wuhan",        "Vũ Hán",            "Trung Quốc",        A.DA,  30.5928, 114.3055, 2],
  ["xian",         "Tây An",            "Trung Quốc",        A.DA,  34.3416, 108.9398, 2],
  ["harbin",       "Cáp Nhĩ Tân",       "Trung Quốc",        A.DA,  45.8038, 126.5350, 2],
  ["lhasa",        "Lhasa",             "Trung Quốc",        A.DA,  29.6520,  91.1721, 2],
  ["urumqi",       "Urumqi",            "Trung Quốc",        A.DA,  43.8256,  87.6168, 2],
  ["taipei",       "Đài Bắc",           "Đài Loan (Trung Quốc)", A.DA, 25.0330, 121.5654, 2],
  ["tokyo",        "Tokyo",             "Nhật Bản",          A.DA,  35.6762, 139.6503, 1],
  ["osaka",        "Osaka",             "Nhật Bản",          A.DA,  34.6937, 135.5023, 2],
  ["sapporo",      "Sapporo",           "Nhật Bản",          A.DA,  43.0618, 141.3545, 2],
  ["fukuoka",      "Fukuoka",           "Nhật Bản",          A.DA,  33.5902, 130.4017, 2],
  ["naha",         "Okinawa (Naha)",    "Nhật Bản",          A.DA,  26.2124, 127.6809, 2],
  ["seoul",        "Seoul",             "Hàn Quốc",          A.DA,  37.5665, 126.9780, 1],
  ["busan",        "Busan",             "Hàn Quốc",          A.DA,  35.1796, 129.0756, 2],
  ["pyongyang",    "Bình Nhưỡng",       "Triều Tiên",        A.DA,  39.0392, 125.7625, 1],
  ["ulaanbaatar",  "Ulaanbaatar",       "Mông Cổ",           A.DA,  47.8864, 106.9057, 1],

  // ----- Đông Nam Á -----
  ["vientiane",    "Viêng Chăn",        "Lào",               A.DNA, 17.9757, 102.6331, 1],
  ["luangprabang", "Luang Prabang",     "Lào",               A.DNA, 19.8856, 102.1347, 2],
  ["pakse",        "Pakse",             "Lào",               A.DNA, 15.1202, 105.7990, 2],
  ["phnompenh",    "Phnôm Pênh",        "Campuchia",         A.DNA, 11.5564, 104.9282, 1],
  ["siemreap",     "Siem Reap",         "Campuchia",         A.DNA, 13.3671, 103.8448, 2],
  ["bangkok",      "Băng Cốc",          "Thái Lan",          A.DNA, 13.7563, 100.5018, 1],
  ["chiangmai",    "Chiang Mai",        "Thái Lan",          A.DNA, 18.7883,  98.9853, 2],
  ["phuket",       "Phuket",            "Thái Lan",          A.DNA,  7.8804,  98.3923, 2],
  ["naypyidaw",    "Nay Pyi Taw",       "Myanmar",           A.DNA, 19.7633,  96.0785, 1],
  ["yangon",       "Yangon",            "Myanmar",           A.DNA, 16.8409,  96.1735, 2],
  ["mandalay",     "Mandalay",          "Myanmar",           A.DNA, 21.9588,  96.0891, 2],
  ["kualalumpur",  "Kuala Lumpur",      "Malaysia",          A.DNA,  3.1390, 101.6869, 1],
  ["penang",       "Penang",            "Malaysia",          A.DNA,  5.4141, 100.3288, 2],
  ["kotakinabalu", "Kota Kinabalu",     "Malaysia",          A.DNA,  5.9804, 116.0735, 2],
  ["kuching",      "Kuching",           "Malaysia",          A.DNA,  1.5535, 110.3593, 2],
  ["singapore",    "Singapore",         "Singapore",         A.DNA,  1.3521, 103.8198, 1],
  ["jakarta",      "Jakarta",           "Indonesia",         A.DNA, -6.2088, 106.8456, 1],
  ["surabaya",     "Surabaya",          "Indonesia",         A.DNA, -7.2575, 112.7521, 2],
  ["bali",         "Bali (Denpasar)",   "Indonesia",         A.DNA, -8.6705, 115.2126, 2],
  ["medan",        "Medan",             "Indonesia",         A.DNA,  3.5952,  98.6722, 2],
  ["makassar",     "Makassar",          "Indonesia",         A.DNA, -5.1477, 119.4327, 2],
  ["manila",       "Manila",            "Philippines",       A.DNA, 14.5995, 120.9842, 1],
  ["cebu",         "Cebu",              "Philippines",       A.DNA, 10.3157, 123.8854, 2],
  ["davao",        "Davao",             "Philippines",       A.DNA,  7.1907, 125.4553, 2],
  ["bandar",       "Bandar Seri Begawan", "Brunei",          A.DNA,  4.9031, 114.9398, 1],
  ["dili",         "Dili",              "Đông Timor",        A.DNA, -8.5569, 125.5603, 1],

  // ----- Nam Á -----
  ["newdelhi",     "New Delhi",         "Ấn Độ",             A.NA,  28.6139,  77.2090, 1],
  ["mumbai",       "Mumbai",            "Ấn Độ",             A.NA,  19.0760,  72.8777, 2],
  ["kolkata",      "Kolkata",           "Ấn Độ",             A.NA,  22.5726,  88.3639, 2],
  ["chennai",      "Chennai",           "Ấn Độ",             A.NA,  13.0827,  80.2707, 2],
  ["bengaluru",    "Bengaluru",         "Ấn Độ",             A.NA,  12.9716,  77.5946, 2],
  ["hyderabad",    "Hyderabad",         "Ấn Độ",             A.NA,  17.3850,  78.4867, 2],
  ["islamabad",    "Islamabad",         "Pakistan",          A.NA,  33.6844,  73.0479, 1],
  ["karachi",      "Karachi",           "Pakistan",          A.NA,  24.8607,  67.0011, 2],
  ["lahore",       "Lahore",            "Pakistan",          A.NA,  31.5204,  74.3587, 2],
  ["dhaka",        "Dhaka",             "Bangladesh",        A.NA,  23.8103,  90.4125, 1],
  ["kathmandu",    "Kathmandu",         "Nepal",             A.NA,  27.7172,  85.3240, 1],
  ["thimphu",      "Thimphu",           "Bhutan",            A.NA,  27.4728,  89.6390, 1],
  ["colombo",      "Colombo",           "Sri Lanka",         A.NA,   6.9271,  79.8612, 1],
  ["male",         "Malé",              "Maldives",          A.NA,   4.1755,  73.5093, 1],
  ["kabul",        "Kabul",             "Afghanistan",       A.NA,  34.5553,  69.2075, 1],

  // ----- Trung Á -----
  ["astana",       "Astana",            "Kazakhstan",        A.TA,  51.1694,  71.4491, 1],
  ["almaty",       "Almaty",            "Kazakhstan",        A.TA,  43.2220,  76.8512, 2],
  ["tashkent",     "Tashkent",          "Uzbekistan",        A.TA,  41.2995,  69.2401, 1],
  ["samarkand",    "Samarkand",         "Uzbekistan",        A.TA,  39.6270,  66.9750, 2],
  ["bishkek",      "Bishkek",           "Kyrgyzstan",        A.TA,  42.8746,  74.5698, 1],
  ["dushanbe",     "Dushanbe",          "Tajikistan",        A.TA,  38.5598,  68.7870, 1],
  ["ashgabat",     "Ashgabat",          "Turkmenistan",      A.TA,  37.9601,  58.3261, 1],

  // ----- Tây Á -----
  ["tehran",       "Tehran",            "Iran",              A.TAY, 35.6892,  51.3890, 1],
  ["mashhad",      "Mashhad",           "Iran",              A.TAY, 36.2605,  59.6168, 2],
  ["baghdad",      "Baghdad",           "Iraq",              A.TAY, 33.3152,  44.3661, 1],
  ["riyadh",       "Riyadh",            "Ả Rập Xê Út",       A.TAY, 24.7136,  46.6753, 1],
  ["jeddah",       "Jeddah",            "Ả Rập Xê Út",       A.TAY, 21.4858,  39.1925, 2],
  ["abudhabi",     "Abu Dhabi",         "UAE",               A.TAY, 24.4539,  54.3773, 1],
  ["dubai",        "Dubai",             "UAE",               A.TAY, 25.2048,  55.2708, 2],
  ["doha",         "Doha",              "Qatar",             A.TAY, 25.2854,  51.5310, 1],
  ["kuwait",       "Kuwait",            "Kuwait",            A.TAY, 29.3759,  47.9774, 1],
  ["manama",       "Manama",            "Bahrain",           A.TAY, 26.2285,  50.5860, 1],
  ["muscat",       "Muscat",            "Oman",              A.TAY, 23.5880,  58.3829, 1],
  ["sanaa",        "Sana'a",            "Yemen",             A.TAY, 15.3694,  44.1910, 1],
  ["amman",        "Amman",             "Jordan",            A.TAY, 31.9454,  35.9284, 1],
  ["damascus",     "Damascus",          "Syria",             A.TAY, 33.5138,  36.2765, 1],
  ["beirut",       "Beirut",            "Liban",             A.TAY, 33.8938,  35.5018, 1],
  ["telaviv",      "Tel Aviv",          "Israel",            A.TAY, 32.0853,  34.7818, 2],
  ["ramallah",     "Ramallah",          "Palestine",         A.TAY, 31.9038,  35.2034, 2],
  ["ankara",       "Ankara",            "Thổ Nhĩ Kỳ",        A.TAY, 39.9334,  32.8597, 1],
  ["istanbul",     "Istanbul",          "Thổ Nhĩ Kỳ",        A.TAY, 41.0082,  28.9784, 2],
  ["nicosia",      "Nicosia",           "Síp",               A.TAY, 35.1856,  33.3823, 1],
  ["tbilisi",      "Tbilisi",           "Gruzia",            A.TAY, 41.7151,  44.8271, 1],
  ["yerevan",      "Yerevan",           "Armenia",           A.TAY, 40.1792,  44.4991, 1],
  ["baku",         "Baku",              "Azerbaijan",        A.TAY, 40.4093,  49.8671, 1],

  // ----- Bắc Á (vùng Siberia & Viễn Đông của Nga) -----
  ["novosibirsk",  "Novosibirsk",       "Nga",               A.BA,  55.0084,  82.9357, 2],
  ["krasnoyarsk",  "Krasnoyarsk",       "Nga",               A.BA,  56.0153,  92.8932, 2],
  ["irkutsk",      "Irkutsk",           "Nga",               A.BA,  52.2870, 104.3050, 2],
  ["yakutsk",      "Yakutsk",           "Nga",               A.BA,  62.0355, 129.6755, 2],
  ["vladivostok",  "Vladivostok",       "Nga",               A.BA,  43.1155, 131.8855, 2],
  ["magadan",      "Magadan",           "Nga",               A.BA,  59.5612, 150.8301, 2],
];

// tier: 1 = luôn hiện (thủ đô), 2 = hiện khi phóng tới cỡ quốc gia, 3 = khi phóng gần
const VN_CAPITAL_TIER1 = new Set(["hanoi", "hcm"]);

const locations = [
  ...rows.map(([id, name, province, region, lat, lon, major]) => ({
    id, name, province, region, country: "Việt Nam", lat, lon,
    tier: VN_CAPITAL_TIER1.has(id) ? 1 : major ? 2 : 3,
  })),
  ...asiaRows.map(([id, name, country, region, lat, lon, tier]) => ({
    id, name, province: country, region, country, lat, lon, tier,
  })),
];

module.exports = locations;
