// backend/services/openMeteo.js
// Lấy dữ liệu thời tiết THẬT từ Open-Meteo (https://open-meteo.com) — miễn phí,
// không cần API key. Mọi kết quả đều được cache trong bộ nhớ.
//
// LƯU Ý HẠN MỨC: gói miễn phí của Open-Meteo cho ~10.000 lượt/ngày, và một
// request nhiều toạ độ được tính bằng số toạ độ. Vì vậy dữ liệu bản đồ (nhiều
// điểm) được cache lâu và chỉ làm mới khi có người truy cập (lazy).

const { describe } = require("../utils/wmo");

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";

/** Múi giờ chung cho timeline (mọi dữ liệu bản đồ được căn theo giờ Việt Nam) */
const TIMELINE_TZ = "Asia/Ho_Chi_Minh";
const TIMELINE_OFFSET_SEC = 7 * 3600;

const HOURS = 120;  // số giờ dự báo theo giờ (5 ngày — timeline bản đồ)
const DAYS = 10;    // số ngày dự báo theo ngày

const TTL_FORECAST = 15 * 60 * 1000;
const TTL_OVERVIEW = 60 * 60 * 1000;
const TTL_GEO = 24 * 60 * 60 * 1000;
const TTL_MODELS = 60 * 60 * 1000;

const CHUNK = 20;        // số toạ độ mỗi request khi gọi nhiều điểm (5 ngày × 11 biến khá nặng)
const BATCH_TIMEOUT = 90000; // request nhiều điểm có thể chậm khi Open-Meteo quá tải
const CONCURRENCY = 3;   // số request chạy song song (nhiều hơn dễ bị 429)

// ---------------------------------------------------------------------------
// Cache có TTL + gộp các request trùng nhau đang chạy (in-flight)
// ---------------------------------------------------------------------------
const cache = new Map();

async function cached(key, ttl, loader) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.promise;

  const promise = loader();
  cache.set(key, { promise, expires: now + ttl });
  try {
    return await promise;
  } catch (err) {
    cache.delete(key);
    if (hit) return hit.promise; // còn bản cũ thì dùng tạm
    throw err;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
}, 10 * 60 * 1000).unref();

/**
 * Cache kiểu stale-while-revalidate: có bản cũ thì trả ngay và làm mới ngầm khi
 * hết hạn — dùng cho dữ liệu bản đồ tải chậm.
 */
function swr(name, ttl, loader) {
  const s = { value: null, at: 0, pending: null };
  function refresh() {
    if (!s.pending) {
      const t0 = Date.now();
      s.pending = loader()
        .then((v) => {
          s.value = v;
          s.at = Date.now();
          console.log(`[${name}] cập nhật trong ${((Date.now() - t0) / 1000).toFixed(1)}s`);
          return v;
        })
        .finally(() => { s.pending = null; });
    }
    return s.pending;
  }
  return {
    refresh,
    async get() {
      if (s.value) {
        if (Date.now() - s.at > ttl) refresh().catch((e) => console.warn(`[${name}] làm mới lỗi:`, e.message));
        return s.value;
      }
      return refresh();
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET JSON, tự thử lại khi Open-Meteo báo quá tải (429) hoặc lỗi mạng tạm thời */
async function getJSON(url, params, retries = 3, timeout = 30000) {
  const qs = new URLSearchParams(params).toString();
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${url}?${qs}`, { signal: AbortSignal.timeout(timeout) });
    } catch (err) {
      if (attempt < retries) { await sleep(1000 * (attempt + 1)); continue; }
      throw err;
    }
    if (res.ok) return res.json();
    const text = await res.text().catch(() => "");
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(1500 * (attempt + 1) + Math.random() * 500);
      continue;
    }
    throw new Error(`Open-Meteo ${res.status}: ${text.slice(0, 200)}`);
  }
}

/** Chạy các tác vụ async với số lượng song song giới hạn */
async function pool(tasks, limit) {
  const out = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

/**
 * Bộ điều tiết: Open-Meteo miễn phí giới hạn 600 lượt/phút (mỗi toạ độ = 1
 * lượt). Giữ tổng trong 60 giây gần nhất dưới mức an toàn, vượt thì chờ.
 */
const MINUTE_BUDGET = 480;
const usage = []; // [{t, n}]
async function budget(n) {
  for (;;) {
    const now = Date.now();
    while (usage.length && now - usage[0].t > 60000) usage.shift();
    const used = usage.reduce((s, u) => s + u.n, 0);
    if (used + n <= MINUTE_BUDGET || !usage.length) {
      usage.push({ t: now, n });
      return;
    }
    await sleep(60000 - (now - usage[0].t) + 50);
  }
}

/** Gọi dự báo cho nhiều toạ độ: chia lô + song song. Trả về mảng theo đúng thứ tự. */
/**
 * Open-Meteo tính >10 biến/toạ độ là nhiều hơn 1 lượt (vd 13 biến = 1,3 lượt)
 * → tính đúng trọng số để bộ điều tiết không vượt hạn mức.
 */
function callWeight(params) {
  const n = ["hourly", "daily", "current"]
    .map((k) => (params[k] ? String(params[k]).split(",").length : 0))
    .reduce((a, b) => a + b, 0);
  return Math.max(1, n / 10);
}

async function fetchMany(points, params, url = FORECAST_URL) {
  const chunks = [];
  for (let i = 0; i < points.length; i += CHUNK) chunks.push(points.slice(i, i + CHUNK));
  const w = callWeight(params);
  // Một lô bị quá thời gian → chia đôi rồi thử lại (lô nhỏ được phục vụ nhanh hơn)
  async function fetchChunk(chunk) {
    await budget(Math.ceil(chunk.length * w));
    try {
      const raw = await getJSON(url, {
        latitude: chunk.map((p) => p.lat).join(","),
        longitude: chunk.map((p) => p.lon).join(","),
        ...params,
      }, chunk.length > 5 ? 0 : 2, BATCH_TIMEOUT);
      return Array.isArray(raw) ? raw : [raw];
    } catch (err) {
      if (chunk.length <= 5) throw err;
      const mid = Math.ceil(chunk.length / 2);
      console.warn(`Lô ${chunk.length} điểm lỗi (${err.message}) → chia đôi`);
      return [...(await fetchChunk(chunk.slice(0, mid))), ...(await fetchChunk(chunk.slice(mid)))];
    }
  }
  const results = await pool(chunks.map((chunk) => () => fetchChunk(chunk)), CONCURRENCY);
  return results.flat();
}

const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const roundInt = (v) => (v == null ? null : Math.round(v));

/** Đổi giờ địa phương "2026-11-21T19:00" (lệch UTC offsetSec) sang giờ Việt Nam */
function toTimelineTime(local, offsetSec) {
  const ms = Date.parse(local + ":00Z") - offsetSec * 1000 + TIMELINE_OFFSET_SEC * 1000;
  return new Date(ms).toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Dự báo chi tiết cho 1 toạ độ (theo GIỜ ĐỊA PHƯƠNG của nơi đó)
// ---------------------------------------------------------------------------
const HOURLY_VARS = [
  "temperature_2m", "apparent_temperature", "relative_humidity_2m",
  "precipitation_probability", "precipitation", "weather_code",
  "pressure_msl", "cloud_cover", "wind_speed_10m", "wind_direction_10m",
  "wind_gusts_10m", "uv_index", "is_day", "visibility",
  "dew_point_2m", "cape",
];
const DAILY_VARS = [
  "weather_code", "temperature_2m_max", "temperature_2m_min",
  "precipitation_sum", "precipitation_probability_max",
  "wind_speed_10m_max", "wind_gusts_10m_max", "wind_direction_10m_dominant",
  "uv_index_max", "sunrise", "sunset",
];

function transformForecast(raw) {
  const H = raw.hourly;
  const off = raw.utc_offset_seconds || 0;
  const hourly = H.time.map((time, i) => {
    const isDay = H.is_day[i] === 1;
    return {
      time,                              // giờ địa phương
      vn: toTimelineTime(time, off),     // cùng thời điểm, theo giờ Việt Nam (khớp timeline)
      temp: round1(H.temperature_2m[i]),
      feels: round1(H.apparent_temperature[i]),
      humidity: H.relative_humidity_2m[i],
      rainProb: H.precipitation_probability[i] ?? 0,
      rain: round1(H.precipitation[i]) ?? 0,
      code: H.weather_code[i],
      ...describe(H.weather_code[i], isDay),
      pressure: Math.round(H.pressure_msl[i]),
      cloud: H.cloud_cover[i],
      wind: round1(H.wind_speed_10m[i]),
      gust: round1(H.wind_gusts_10m[i]),
      dir: H.wind_direction_10m[i],
      uv: round1(H.uv_index[i]) ?? 0,
      visibility: H.visibility[i] == null ? null : Math.round(H.visibility[i] / 100) / 10, // km
      dew: round1(H.dew_point_2m[i]),
      cape: roundInt(H.cape[i]),
      isDay,
    };
  });

  const D = raw.daily;
  const daily = D.time.map((date, i) => ({
    date,
    hi: round1(D.temperature_2m_max[i]),
    lo: round1(D.temperature_2m_min[i]),
    rainSum: round1(D.precipitation_sum[i]) ?? 0,
    rainChance: D.precipitation_probability_max[i] ?? 0,
    code: D.weather_code[i],
    ...describe(D.weather_code[i], true),
    windMax: round1(D.wind_speed_10m_max[i]),
    gustMax: round1(D.wind_gusts_10m_max[i]),
    dir: D.wind_direction_10m_dominant[i],
    uvMax: round1(D.uv_index_max[i]) ?? 0,
    sunrise: D.sunrise[i],
    sunset: D.sunset[i],
  }));

  return {
    elevation: raw.elevation,
    utcOffset: off,
    timezone: raw.timezone,
    hourly,
    daily,
  };
}

function fetchForecast(lat, lon) {
  const key = `fc:${lat.toFixed(2)},${lon.toFixed(2)}`;
  return cached(key, TTL_FORECAST, async () => {
    await budget(3); // 16 biến theo giờ + 11 theo ngày
    const raw = await getJSON(FORECAST_URL, {
      latitude: lat,
      longitude: lon,
      hourly: HOURLY_VARS.join(","),
      daily: DAILY_VARS.join(","),
      forecast_hours: HOURS,
      forecast_days: DAYS,
      timezone: "auto",
      wind_speed_unit: "kmh",
    });
    return transformForecast(raw);
  });
}

function fetchAirQuality(lat, lon) {
  const key = `aq:${lat.toFixed(2)},${lon.toFixed(2)}`;
  return cached(key, TTL_FORECAST, async () => {
    const raw = await getJSON(AIR_URL, {
      latitude: lat,
      longitude: lon,
      current: "us_aqi,pm2_5,pm10",
      timezone: "auto",
    });
    const c = raw.current || {};
    if (c.us_aqi == null) return null;
    return { usAqi: c.us_aqi, pm25: round1(c.pm2_5), pm10: round1(c.pm10) };
  });
}

/** Dự báo đầy đủ (theo giờ + theo ngày + AQI) cho một vị trí */
async function getWeather(location) {
  const [forecast, aqi] = await Promise.all([
    fetchForecast(location.lat, location.lon),
    fetchAirQuality(location.lat, location.lon).catch(() => null), // AQI là thông tin phụ
  ]);
  return {
    location: { ...location, elevation: forecast.elevation },
    utcOffset: forecast.utcOffset,
    timezone: forecast.timezone,
    hourly: forecast.hourly,
    daily: forecast.daily,
    aqi,
    source: "Open-Meteo",
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tổng quan: 48h dữ liệu rút gọn cho TẤT CẢ địa điểm (nhãn ghim + bản đồ màu)
// ---------------------------------------------------------------------------
const MAP_VARS = [
  "temperature_2m", "apparent_temperature", "relative_humidity_2m", "dew_point_2m",
  "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
  "precipitation", "pressure_msl", "cloud_cover", "cape",
].join(",");

function compactSeries(H) {
  return {
    temp: H.temperature_2m.map(round1),
    feels: H.apparent_temperature.map(round1),
    humidity: H.relative_humidity_2m,
    dew: H.dew_point_2m.map(round1),
    wind: H.wind_speed_10m.map(round1),
    gust: H.wind_gusts_10m.map(round1),
    dir: H.wind_direction_10m,
    rain: H.precipitation.map((v) => round1(v) ?? 0),
    pressure: H.pressure_msl.map(roundInt),
    cloud: H.cloud_cover,
    cape: H.cape.map(roundInt),
  };
}

function getOverview(locations) {
  return cached("overview", TTL_OVERVIEW, async () => {
    const list = await fetchMany(locations, {
      hourly: MAP_VARS + ",weather_code,is_day",
      forecast_hours: HOURS,
      timezone: TIMELINE_TZ,
      wind_speed_unit: "kmh",
    });
    return {
      times: list[0].hourly.time,
      locations: list.map((r, i) => {
        const H = r.hourly;
        return {
          id: locations[i].id,
          ...compactSeries(H),
          code: H.weather_code,
          icon: H.weather_code.map((c, j) => describe(c, H.is_day[j] === 1).icon),
        };
      }),
      source: "Open-Meteo",
      updatedAt: new Date().toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// Lưới điểm phủ vùng: lưới DÀY cho Việt Nam + lưới THƯA cho toàn châu Á.
// Giúp lớp màu & hạt gió liên tục cả trên biển và nơi không có trạm.
// ---------------------------------------------------------------------------
function makeGrid({ minLat, maxLat, minLon, maxLon, step, exclude }) {
  const pts = [];
  const ex = exclude;
  for (let lat = minLat; lat <= maxLat + 1e-9; lat += step) {
    for (let lon = minLon; lon <= maxLon + 1e-9; lon += step) {
      if (ex && lat >= ex.minLat && lat <= ex.maxLat && lon >= ex.minLon && lon <= ex.maxLon) continue;
      pts.push({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 });
    }
  }
  return pts;
}

const GRIDS = {
  vietnam: { minLat: 7, maxLat: 23.5, minLon: 101, maxLon: 113, step: 1.5, ttl: 2 * 3600e3 },
  asia:    { minLat: -10, maxLat: 65, minLon: 26, maxLon: 176, step: 7.5, ttl: 3 * 3600e3 },
};

const gridStores = Object.fromEntries(Object.entries(GRIDS).map(([name, g]) => {
  const pts = makeGrid(g);
  return [name, swr(`lưới ${name}: ${pts.length} điểm`, g.ttl, async () => {
    const list = await fetchMany(pts, {
      hourly: MAP_VARS,
      forecast_hours: HOURS,
      timezone: TIMELINE_TZ,
      wind_speed_unit: "kmh",
    });
    return {
      name,
      times: list[0].hourly.time,
      points: list.map((r, i) => ({ lat: pts[i].lat, lon: pts[i].lon, ...compactSeries(r.hourly) })),
      updatedAt: new Date().toISOString(),
    };
  })];
}));

/** Tất cả lưới (lưới nào lỗi thì bỏ qua, không làm hỏng cả response) */
async function getGrids() {
  const settled = await Promise.allSettled(Object.values(gridStores).map((s) => s.get()));
  const grids = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!grids.length) throw settled[0].reason;
  return { grids };
}

// ---------------------------------------------------------------------------
// Lưới phụ — chỉ tải khi người dùng mở lớp tương ứng (tiết kiệm hạn mức API):
//   marine: độ cao / hướng / chu kỳ sóng (Open-Meteo Marine)
//   air:    bụi mịn PM2.5 (Open-Meteo Air Quality, mô hình CAMS)
// `r` = bán kính ảnh hưởng (km) của mỗi điểm khi tô màu ở frontend.
// ---------------------------------------------------------------------------
const VN_SEA = { minLat: 5, maxLat: 23.75, minLon: 102.5, maxLon: 117.5 };
const MARINE_GRIDS = {
  vietnam: { ...VN_SEA, step: 1.25, r: 85 },
  asia: { minLat: -10, maxLat: 44, minLon: 38, maxLon: 158, step: 6, r: 340, exclude: VN_SEA },
};
const AIR_GRIDS = {
  vietnam: { minLat: 7, maxLat: 23.5, minLon: 101, maxLon: 113, step: 1.5 },
  asia: { minLat: -10, maxLat: 60, minLon: 30, maxLon: 170, step: 10 },
};

async function loadMarine() {
  const grids = [];
  for (const [name, g] of Object.entries(MARINE_GRIDS)) {
    const pts = makeGrid(g);
    const list = await fetchMany(pts, {
      hourly: "wave_height,wave_direction,wave_period",
      forecast_hours: HOURS,
      timezone: TIMELINE_TZ,
    }, MARINE_URL);
    grids.push({
      name,
      times: list[0].hourly.time,
      points: list
        .map((r, i) => ({
          lat: pts[i].lat, lon: pts[i].lon, r: g.r,
          wave: r.hourly.wave_height.map(round1),
          wdir: r.hourly.wave_direction,
          wper: r.hourly.wave_period.map(round1),
        }))
        .filter((p) => p.wave.some((v) => v != null)), // bỏ điểm trên đất liền
    });
  }
  return { name: "marine", grids, updatedAt: new Date().toISOString() };
}

async function loadAir(locations) {
  const params = { hourly: "pm2_5", forecast_hours: HOURS, timezone: TIMELINE_TZ };
  const grids = [];
  for (const [name, g] of Object.entries(AIR_GRIDS)) {
    const pts = makeGrid(g);
    const list = await fetchMany(pts, params, AIR_URL);
    grids.push({
      name,
      times: list[0].hourly.time,
      points: list.map((r, i) => ({ lat: pts[i].lat, lon: pts[i].lon, pm25: r.hourly.pm2_5.map(round1) })),
    });
  }
  // Thêm các địa điểm Việt Nam + thủ đô châu Á để ghim có nhãn PM2.5
  const locs = locations.filter((l) => l.country === "Việt Nam" || l.tier === 1);
  const list = await fetchMany(locs, params, AIR_URL);
  grids.push({
    name: "locations",
    times: list[0].hourly.time,
    points: list.map((r, i) => ({ id: locs[i].id, lat: locs[i].lat, lon: locs[i].lon, pm25: r.hourly.pm2_5.map(round1) })),
  });
  return { name: "air", grids, updatedAt: new Date().toISOString() };
}

let extraStores = null;
const EXTRA_SETS = ["marine", "air"];

/** Lưới phụ theo tên (marine | air) — cache vài giờ, làm mới ngầm */
function getExtra(name, locations) {
  if (!extraStores) {
    extraStores = {
      marine: swr("lưới sóng biển", 3 * 3600e3, loadMarine),
      air: swr("lưới bụi mịn", 2 * 3600e3, () => loadAir(locations)),
    };
  }
  return extraStores[name].get();
}

// ---------------------------------------------------------------------------
// So sánh các mô hình dự báo (giống tính năng "Compare" của Windy)
// ---------------------------------------------------------------------------
const MODELS = [
  ["ecmwf_ifs025", "ECMWF"],
  ["gfs_seamless", "GFS"],
  ["icon_seamless", "ICON"],
  ["jma_seamless", "JMA"],
];

function getModels(lat, lon) {
  const key = `md:${lat.toFixed(2)},${lon.toFixed(2)}`;
  return cached(key, TTL_MODELS, async () => {
    await budget(MODELS.length * 2);
    const raw = await getJSON(FORECAST_URL, {
      latitude: lat,
      longitude: lon,
      hourly: "temperature_2m,precipitation",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
      models: MODELS.map((m) => m[0]).join(","),
      forecast_days: 7,
      timezone: "auto",
      wind_speed_unit: "kmh",
    });
    const pick = (block, v) =>
      Object.fromEntries(MODELS.map(([id]) => [id, (block[`${v}_${id}`] || []).map(round1)]));
    return {
      models: MODELS.map(([id, name]) => ({ id, name })),
      utcOffset: raw.utc_offset_seconds || 0,
      hourly: {
        time: raw.hourly.time,
        temp: pick(raw.hourly, "temperature_2m"),
        rain: pick(raw.hourly, "precipitation"),
      },
      daily: {
        time: raw.daily.time,
        hi: pick(raw.daily, "temperature_2m_max"),
        lo: pick(raw.daily, "temperature_2m_min"),
        rain: pick(raw.daily, "precipitation_sum"),
        wind: pick(raw.daily, "wind_speed_10m_max"),
      },
      updatedAt: new Date().toISOString(),
    };
  });
}

/** Tải trước tuần tự (không dồn request cùng lúc → tránh lỗi 429) */
async function warmUp(locations) {
  const steps = [() => getOverview(locations), ...Object.values(gridStores).map((s) => () => s.refresh())];
  for (const step of steps) {
    try { await step(); } catch (e) { console.warn("Tải trước lỗi:", e.message); }
  }
}

// ---------------------------------------------------------------------------
// Tìm địa danh trong châu Á (geocoding)
// ---------------------------------------------------------------------------
const ASIA_CODES = new Set([
  "VN", "LA", "KH", "TH", "MM", "MY", "SG", "ID", "PH", "BN", "TL",
  "CN", "HK", "MO", "TW", "JP", "KR", "KP", "MN",
  "IN", "PK", "BD", "NP", "BT", "LK", "MV", "AF",
  "KZ", "UZ", "KG", "TJ", "TM",
  "IR", "IQ", "SA", "AE", "QA", "KW", "BH", "OM", "YE", "JO", "SY", "LB", "IL", "PS",
  "TR", "GE", "AM", "AZ", "CY", "RU",
]);

function geocode(query) {
  const key = `geo:${query.toLowerCase()}`;
  return cached(key, TTL_GEO, async () => {
    const raw = await getJSON(GEO_URL, { name: query, count: 30, language: "vi", format: "json" });
    return (raw.results || [])
      // chỉ giữ địa danh ở châu Á (riêng Nga: chỉ phần phía đông dãy Ural)
      .filter((r) => ASIA_CODES.has(r.country_code) && (r.country_code !== "RU" || r.longitude >= 60))
      // ưu tiên Việt Nam lên đầu, giữ nguyên thứ tự còn lại
      .sort((a, b) => (b.country_code === "VN") - (a.country_code === "VN"))
      .slice(0, 10)
      .map((r) => ({
        name: r.name,
        sub: [r.admin1, r.country].filter(Boolean).join(", "),
        country: r.country,
        lat: r.latitude,
        lon: r.longitude,
      }));
  });
}

module.exports = {
  getWeather, getOverview, getGrids, getExtra, getModels, warmUp, geocode,
  EXTRA_SETS, HOURS, DAYS,
};
