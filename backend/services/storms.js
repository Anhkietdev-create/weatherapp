// backend/services/storms.js
// Bão / áp thấp nhiệt đới đang hoạt động & gần đây ở châu Á — dữ liệu từ GDACS
// (Global Disaster Alert and Coordination System, EU/UN; nguồn gốc JTWC).
// Miễn phí, không cần API key. Kết quả được rút gọn thành: quỹ đạo đã qua,
// quỹ đạo dự báo, các điểm theo thời gian, vùng nón dự báo và vị trí mới nhất.

const LIST_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const GEOM_URL = "https://www.gdacs.org/gdacsapi/api/polygons/getgeometry";

/** Khung châu Á – Tây Thái Bình Dương – Ấn Độ Dương (lon, lat) */
const AREA = { minLon: 25, maxLon: 180, minLat: -30, maxLat: 60 };
const TTL = 30 * 60 * 1000;
const MAX_STORMS = 10;

const cache = new Map(); // key → { at, value }

async function getJSON(url, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}?${qs}`, {
    signal: AbortSignal.timeout(30000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GDACS ${res.status}`);
  return res.json();
}

/** Cache đơn giản; lỗi thì trả bản cũ nếu có */
async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  try {
    const value = await loader();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    if (hit) return hit.value;
    throw err;
  }
}

const ymd = (d) => d.toISOString().slice(0, 10);
const round2 = (v) => Math.round(v * 100) / 100;

function inArea([lon, lat]) {
  return lon >= AREA.minLon && lon <= AREA.maxLon && lat >= AREA.minLat && lat <= AREA.maxLat;
}

/** Tâm của một vòng polygon [[lon,lat],...] → [lat, lon] */
function ringCenter(ring) {
  let x = 0, y = 0;
  const n = ring.length > 1 ? ring.length - 1 : ring.length; // bỏ điểm đóng vòng
  for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1]; }
  return [round2(y / n), round2(x / n)];
}

/** "01/11 06:00 UTC" (năm lấy theo ngày bắt đầu của cơn bão) → ISO UTC */
function parseLabelTime(label, fromIso) {
  const m = /^(\d{2})\/(\d{2}) (\d{2}):(\d{2})/.exec(label || "");
  if (!m) return null;
  const from = new Date(fromIso + "Z");
  let year = from.getUTCFullYear();
  if (+m[2] < from.getUTCMonth() + 1) year++; // bão kéo dài qua năm mới
  return `${year}-${m[2]}-${m[1]}T${m[3]}:${m[4]}:00Z`;
}

/**
 * Cấp gió theo thang Việt Nam (Beaufort mở rộng) từ km/h: cấp 6–7 áp thấp
 * nhiệt đới, 8–9 bão, 10–11 bão mạnh, 12–15 bão rất mạnh, ≥16 siêu bão.
 */
function vnLevel(kmh) {
  if (kmh == null || kmh < 39) return null;
  const lim = [39, 50, 62, 75, 89, 103, 118, 134, 150, 167, 184, 202];
  let lv = 5;
  for (const l of lim) if (kmh >= l) lv++;
  return lv;
}

function vnCategory(level) {
  if (level == null) return "Vùng áp thấp";
  if (level <= 7) return "Áp thấp nhiệt đới";
  if (level <= 9) return "Bão";
  if (level <= 11) return "Bão mạnh";
  if (level <= 15) return "Bão rất mạnh";
  return "Siêu bão";
}

function simplify(event, geom) {
  const p = event.properties;
  const feats = geom?.features || [];
  const advDate = feats.find((f) => f.properties.polygondate)?.properties.polygondate || p.todate;
  const advisory = Date.parse(advDate + "Z");

  const segments = feats
    .filter((f) => f.geometry?.type === "LineString" && /^Line_Line_/.test(f.properties.Class))
    .map((f) => ({
      coords: f.geometry.coordinates.map(([lon, lat]) => [round2(lat), round2(lon)]),
      cat: f.properties.polygonlabel || "",
      forecast: f.properties.forecast === true || f.properties.forecast === "true",
    }));

  const points = feats
    .filter((f) => f.properties.featuretype === "PointRadii" && f.geometry?.type === "Polygon")
    .map((f) => {
      const time = parseLabelTime(f.properties.polygonlabel, p.fromdate);
      const [lat, lon] = ringCenter(f.geometry.coordinates[0]);
      return { lat, lon, time, forecast: time ? Date.parse(time) > advisory : false };
    })
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  const coneF = feats.find((f) => f.properties.Class === "Poly_Cones" && f.geometry?.type === "Polygon");
  const cone = coneF ? coneF.geometry.coordinates[0].map(([lon, lat]) => [round2(lat), round2(lon)]) : null;

  const [lon, lat] = event.geometry.coordinates;
  const maxWind = p.severitydata?.severity ? Math.round(p.severitydata.severity) : null;
  const level = vnLevel(maxWind);

  return {
    id: `${p.eventid}-${p.episodeid}`,
    name: (p.eventname || p.name || "").replace(/-\d{2}$/, ""),
    current: p.iscurrent === "true" || p.iscurrent === true,
    alert: p.alertlevel,                 // Green | Orange | Red (mức ảnh hưởng theo GDACS)
    from: p.fromdate,
    to: p.todate,
    advisory: Number.isFinite(advisory) ? new Date(advisory).toISOString() : null,
    countries: p.country || "",
    report: p.url?.report,
    maxWind,                              // km/h, sức gió mạnh nhất trong đời cơn bão
    level,                                // cấp gió (thang Việt Nam)
    category: vnCategory(level),
    position: [round2(lat), round2(lon)], // vị trí mới nhất
    segments,
    points,
    cone,
  };
}

/**
 * Bão trong `days` ngày qua ở châu Á (đang hoạt động lên trước).
 * @returns {Promise<{storms:Array, updatedAt:string}>}
 */
function getStorms(days = 30) {
  const d = Math.max(1, Math.min(90, days | 0));
  return cached(`list:${d}`, async () => {
    const to = new Date(Date.now() + 86400e3);
    const from = new Date(Date.now() - d * 86400e3);
    const list = await getJSON(LIST_URL, { eventlist: "TC", fromdate: ymd(from), todate: ymd(to) });
    const events = (list.features || [])
      .filter((f) => f.properties?.eventtype === "TC" && f.geometry?.type === "Point" && inArea(f.geometry.coordinates))
      .sort((a, b) =>
        (b.properties.iscurrent === "true") - (a.properties.iscurrent === "true") ||
        String(b.properties.todate).localeCompare(String(a.properties.todate)))
      .slice(0, MAX_STORMS);

    const storms = [];
    for (const ev of events) {
      const p = ev.properties;
      try {
        const geom = await cached(`geom:${p.eventid}:${p.episodeid}`, () =>
          getJSON(GEOM_URL, { eventtype: "TC", eventid: p.eventid, episodeid: p.episodeid }));
        storms.push(simplify(ev, geom));
      } catch (err) {
        console.warn(`Không lấy được quỹ đạo bão ${p.eventname}:`, err.message);
        storms.push(simplify(ev, null));
      }
    }
    return { storms, source: "GDACS", updatedAt: new Date().toISOString() };
  });
}

module.exports = { getStorms, vnLevel, vnCategory };
