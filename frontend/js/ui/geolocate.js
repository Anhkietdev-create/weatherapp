// js/ui/geolocate.js
// Vị trí thực của người dùng (Geolocation API của trình duyệt):
//   - lấy vị trí 1 lần (ưu tiên GPS chính xác, lỗi/hết giờ thì dùng vị trí gần đúng)
//   - chấm xanh + vòng sai số trên bản đồ (giống Google Maps)
//   - chế độ "theo dõi": khi di chuyển xa hơn MOVE_KM thì báo để tải lại dự báo
// Lưu ý: trình duyệt chỉ cho định vị trên HTTPS hoặc http://localhost.

const MOVE_KM = 2;

let map = null;
let dot = null;
let ring = null;
let watchId = null;
let lastReported = null; // vị trí lần cuối đã tải dự báo

function distanceKm(a, b) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const toPos = (p) => ({
  lat: p.coords.latitude,
  lon: p.coords.longitude,
  accuracy: Math.round(p.coords.accuracy || 0),
  at: p.timestamp || Date.now(),
});

/** Thông báo lỗi dễ hiểu theo mã lỗi Geolocation */
export function geoErrorMessage(err) {
  if (!window.isSecureContext) {
    return "Trình duyệt chỉ cho phép định vị trên HTTPS hoặc http://localhost.";
  }
  if (err?.code === 1) {
    return "Bạn đã chặn quyền vị trí. Bấm biểu tượng ổ khoá cạnh thanh địa chỉ để cho phép lại.";
  }
  if (err?.code === 3) return "Hết thời gian chờ định vị. Hãy thử lại ở nơi thoáng hơn.";
  return "Không xác định được vị trí của bạn.";
}

export const geoSupported = () => "geolocation" in navigator;

/** "granted" | "prompt" | "denied" | "unknown" */
export async function permissionState() {
  if (!geoSupported() || !window.isSecureContext) return "denied";
  try {
    const p = await navigator.permissions.query({ name: "geolocation" });
    return p.state;
  } catch {
    return "unknown";
  }
}

/** Lấy vị trí: thử độ chính xác cao trước, hết giờ thì lùi về vị trí gần đúng (Wi-Fi/IP) */
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!geoSupported()) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(toPos(p)),
      (err) => {
        if (err.code === 1) return reject(err);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(toPos(p)),
          reject,
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60 * 1000 },
    );
  });
}

/** Vẽ / cập nhật chấm vị trí của người dùng */
export function showUserMarker(pos) {
  const ll = [pos.lat, pos.lon];
  if (!dot) {
    ring = L.circle(ll, {
      radius: pos.accuracy, pane: "overlayPane", interactive: false,
      color: "#4f8dff", weight: 1, opacity: 0.6, fillColor: "#4f8dff", fillOpacity: 0.12,
    }).addTo(map);
    dot = L.marker(ll, {
      icon: L.divIcon({ className: "me-anchor", html: '<div class="me-dot"><span></span></div>', iconSize: [0, 0] }),
      zIndexOffset: 12000,
      keyboard: false,
      title: "Vị trí của bạn",
    }).addTo(map);
  } else {
    dot.setLatLng(ll);
    ring.setLatLng(ll).setRadius(pos.accuracy);
  }
  // Vòng sai số quá lớn (định vị theo IP) thì chỉ hiện mờ
  ring.setStyle({ fillOpacity: pos.accuracy > 5000 ? 0.04 : 0.12 });
}

/** Ghi nhận vị trí vừa dùng để tải dự báo (mốc để tính "đã di chuyển") */
export function markReported(pos) {
  lastReported = pos;
}

export const isWatching = () => watchId != null;

/**
 * Theo dõi vị trí liên tục. Gọi onMove khi người dùng đi xa hơn MOVE_KM so với
 * lần tải dự báo gần nhất; chấm xanh luôn được cập nhật.
 */
export function startWatch(onMove, onError) {
  if (!geoSupported() || watchId != null) return;
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      const pos = toPos(p);
      showUserMarker(pos);
      if (lastReported && distanceKm(lastReported, pos) >= MOVE_KM) onMove(pos);
    },
    (err) => {
      if (err.code === 1) stopWatch();
      onError?.(err);
    },
    { enableHighAccuracy: true, maximumAge: 30 * 1000, timeout: 30000 },
  );
}

export function stopWatch() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

/** @param {L.Map} m */
export function initGeolocate(m) {
  map = m;
}
