/**
 * LIVELY NAVI - Firebase リアルタイムクラウド同期モジュール (Security-Enhanced Edition)
 * 【セキュリティ強化仕様】
 * - 個人情報（氏名・住所）はクラウド上に保存せず、ローカル端末（手元）のみで保持。
 * - クラウド上の永続マスターは「顧客コード（主キー）」と「緯度・経度座標」「区間走行軌跡」のみを完全匿名化して保持。
 * - コース計画を削除しても顧客コード主キーのマスターは保持され、次回CSV取込時に自動的に手元で結合・復元。
 */

const FIREBASE_CONFIG_STORAGE_KEY = 'lively_navi_firebase_config';
const DEFAULT_FIREBASE_CONFIG = {
  databaseURL: "https://lively-navi-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lively-navi"
};

let firebaseApp = null;
let firebaseDb = null;

// Firebase 設定の保存と取得
function getSavedFirebaseConfig() {
  try {
    const saved = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return DEFAULT_FIREBASE_CONFIG;
}

function saveFirebaseConfig(config) {
  if (!config) {
    localStorage.removeItem(FIREBASE_CONFIG_STORAGE_KEY);
  } else {
    localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }
  initFirebaseApp(config);
}

// Firebase SDK 初期化
function initFirebaseApp(config = getSavedFirebaseConfig()) {
  if (!config || !config.databaseURL) {
    firebaseApp = null;
    firebaseDb = null;
    return false;
  }

  try {
    if (firebase.apps.length > 0) {
      firebaseApp = firebase.apps[0];
    } else {
      firebaseApp = firebase.initializeApp(config);
    }
    firebaseDb = firebase.database();
    return true;
  } catch (err) {
    console.warn("Firebase Init Warning:", err);
    return false;
  }
}

const CLOUD_RTDB_BASE = "https://lively-navi-default-rtdb.asia-southeast1.firebasedatabase.app";

// =========================================================================
// 1. 地点位置マスター（顧客コード主キー: 個人情報を持たず、コードと座標のみ保持）
// =========================================================================

const CUSTOMER_LOCATIONS_KEY = 'lively_navi_customer_locations';

// 顧客コードをキーとして地点位置（座標）を保存
async function saveCustomerLocation(code, lat, lng) {
  if (!code || !lat || !lng) return false;
  const key = String(code).trim();
  const data = {
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    updatedAt: Date.now()
  };

  // 1. ローカル保存
  try {
    const locs = getLocalCustomerLocations();
    locs[key] = data;
    localStorage.setItem(CUSTOMER_LOCATIONS_KEY, JSON.stringify(locs));
  } catch (e) {
    console.warn("Local customer location save error:", e);
  }

  // 2. クラウド（Firebase RTDB）へ保存 (REST API & SDK)
  try {
    await fetch(`${CLOUD_RTDB_BASE}/customer_locations/${encodeURIComponent(key)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    console.log("✅ Customer location master saved to cloud for code:", key);
  } catch (err) {
    console.warn("Cloud customer location save error:", err);
  }

  return true;
}

// ローカルに保存されている全顧客地点マスターを取得
function getLocalCustomerLocations() {
  try {
    const raw = localStorage.getItem(CUSTOMER_LOCATIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

// 顧客コードから過去の登録座標を検索
function findCustomerLocation(code) {
  if (!code) return null;
  const key = String(code).trim();
  const locs = getLocalCustomerLocations();
  if (locs[key]) {
    return { lat: locs[key].lat, lng: locs[key].lng, isMaster: true };
  }
  return null;
}

// 旧互換用 (住所・名前検索から顧客コード検索へ安全フォールバック)
function findCorrectedCoords(address, name = "", code = "") {
  if (code) {
    const found = findCustomerLocation(code);
    if (found) return found;
  }
  return null;
}

// クラウド上の地点マスター(/customer_locations)を購読＆ローカル同期
function subscribeCustomerLocations(onLoaded) {
  // 初回 REST 即時取得
  fetchCustomerLocationsDirect().then(locs => {
    if (locs) {
      const local = getLocalCustomerLocations();
      const merged = { ...local, ...locs };
      localStorage.setItem(CUSTOMER_LOCATIONS_KEY, JSON.stringify(merged));
      if (onLoaded) onLoaded(merged);
    }
  }).catch(() => {});

  if (!firebaseDb) initFirebaseApp(getSavedFirebaseConfig());
  if (!firebaseDb) return null;

  try {
    const ref = firebaseDb.ref('customer_locations');
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        const local = getLocalCustomerLocations();
        const merged = { ...local, ...data };
        localStorage.setItem(CUSTOMER_LOCATIONS_KEY, JSON.stringify(merged));
        console.log("✅ Synced customer locations master:", Object.keys(merged).length, "codes");
        if (onLoaded) onLoaded(merged);
      }
    });
    return ref;
  } catch (e) {
    return null;
  }
}

async function fetchCustomerLocationsDirect() {
  try {
    const res = await fetch(`${CLOUD_RTDB_BASE}/customer_locations.json?t=${Date.now()}`);
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
}

// =========================================================================
// 2. コース情報の送受信（PC ➔ スマホへのリアルタイム配信）
// =========================================================================

async function uploadCourseToCloud(course) {
  const courseData = {
    ...course,
    updatedAt: Date.now()
  };

  let isSuccess = false;

  try {
    const res = await fetch(`${CLOUD_RTDB_BASE}/courses/${course.id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(courseData)
    });
    if (res.ok) {
      console.log("✅ Course uploaded to cloud via Direct REST:", course.name);
      isSuccess = true;
    }
  } catch (restErr) {
    console.warn("Direct REST upload error:", restErr);
  }

  try {
    if (!firebaseDb) initFirebaseApp(getSavedFirebaseConfig());
    if (firebaseDb) {
      await firebaseDb.ref(`courses/${course.id}`).set(courseData);
      isSuccess = true;
    }
  } catch (err) {}

  return isSuccess;
}

function subscribeCoursesFromCloud(onCoursesUpdated) {
  fetchCoursesFromCloudDirect().then(courses => {
    if (courses && courses.length > 0) {
      onCoursesUpdated(courses);
    }
  }).catch(() => {});

  if (!firebaseDb) initFirebaseApp(getSavedFirebaseConfig());
  if (!firebaseDb) return null;

  try {
    const ref = firebaseDb.ref('courses');
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        const courseList = Object.values(data);
        if (courseList.length > 0) {
          onCoursesUpdated(courseList);
        }
      }
    }, (err) => console.warn("Subscribe courses warning:", err));
    return ref;
  } catch (e) {
    return null;
  }
}

async function fetchCoursesFromCloudDirect() {
  try {
    const res = await fetch(`${CLOUD_RTDB_BASE}/courses.json?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        return Object.values(data).filter(c => c && c.items && c.items.length > 0);
      }
    }
  } catch (restErr) {
    console.warn("Direct REST fetch error:", restErr);
  }
  return [];
}

async function deleteCourseFromCloud(courseId) {
  try {
    await fetch(`${CLOUD_RTDB_BASE}/courses/${courseId}.json`, { method: 'DELETE' });
    console.log("✅ Deleted course from cloud via REST:", courseId);
  } catch (e) {}

  try {
    if (!firebaseDb) initFirebaseApp(getSavedFirebaseConfig());
    if (firebaseDb) {
      await firebaseDb.ref(`courses/${courseId}`).remove();
    }
  } catch (e2) {}

  return true;
}

async function updateItemStatusToCloud(courseId, itemId, isDone) {
  try {
    const res = await fetch(`${CLOUD_RTDB_BASE}/courses/${courseId}/items.json`);
    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items)) {
        const idx = items.findIndex(i => i && String(i.id) === String(itemId));
        if (idx !== -1) {
          items[idx].isDone = isDone;
          items[idx].arrivedAt = isDone ? Date.now() : null;
          await fetch(`${CLOUD_RTDB_BASE}/courses/${courseId}/items.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
          });
          await fetch(`${CLOUD_RTDB_BASE}/courses/${courseId}/updatedAt.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Date.now())
          });
        }
      }
    }
    return true;
  } catch (err) {
    return false;
  }
}

// =========================================================================
// 3. ドライバー位置情報の送受信
// =========================================================================

async function updateDriverLocationToCloud(driverId, locationData) {
  if (!firebaseDb) return false;
  try {
    await firebaseDb.ref(`drivers/${driverId}`).set({
      ...locationData,
      updatedAt: Date.now()
    });
    return true;
  } catch (err) {
    return false;
  }
}

function subscribeDriverLocations(onLocationsUpdated) {
  if (!firebaseDb) initFirebaseApp(getSavedFirebaseConfig());
  if (!firebaseDb) return null;

  try {
    const ref = firebaseDb.ref('drivers');
    ref.on('value', (snapshot) => {
      const data = snapshot.val() || {};
      onLocationsUpdated(data);
    });
    return ref;
  } catch (err) {
    return null;
  }
}

// =========================================================================
// 4. GPS 走行ログの送受信 & 区間軌跡（顧客コードA ➔ 顧客コードB）マスター
// =========================================================================

async function appendGpsLogToCloud(courseId, point) {
  if (!courseId || !point) return false;
  try {
    await fetch(`${CLOUD_RTDB_BASE}/logs/${courseId}/points.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(point)
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function fetchGpsLogFromCloud(courseId) {
  try {
    const res = await fetch(`${CLOUD_RTDB_BASE}/logs/${courseId}/points.json?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        const points = Object.values(data);
        if (points.length > 0) return points;
      }
    }
  } catch (e) {}

  try {
    const allRes = await fetch(`${CLOUD_RTDB_BASE}/logs.json?t=${Date.now()}`);
    if (allRes.ok) {
      const allLogs = await allRes.json();
      if (allLogs && typeof allLogs === 'object') {
        let bestPoints = [];
        Object.keys(allLogs).forEach(k => {
          const l = allLogs[k];
          if (l && l.points) {
            const pts = Object.values(l.points);
            if (pts.length > bestPoints.length) {
              bestPoints = pts;
            }
          }
        });
        if (bestPoints.length > 0) return bestPoints;
      }
    }
  } catch (e2) {}

  return [];
}

// --- 顧客コードA ➔ 顧客コードB の区間軌跡マスター保存・取得 ---

async function saveLegTrackByCodes(fromCode, toCode, points) {
  if (!fromCode || !toCode || !points || points.length === 0) return false;
  const key = `${String(fromCode).trim()}_to_${String(toCode).trim()}`;
  try {
    await fetch(`${CLOUD_RTDB_BASE}/leg_tracks/${encodeURIComponent(key)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(points)
    });
    console.log(`✅ Saved ${points.length} GPS points for leg track [${key}]`);
    return true;
  } catch (e) {
    console.warn("saveLegTrackByCodes error:", e);
    return false;
  }
}

async function fetchLegTrackByCodes(fromCode, toCode, fromOrder = null, toOrder = null, courseId = null) {
  const candidateKeys = [];

  if (fromCode && toCode) {
    candidateKeys.push(`${String(fromCode).trim()}_to_${String(toCode).trim()}`);
  }
  if (fromOrder !== null && toOrder !== null) {
    candidateKeys.push(`leg_${fromOrder}_to_${toOrder}`);
    candidateKeys.push(`ORDER_${fromOrder}_to_ORDER_${toOrder}`);
    if (toCode) candidateKeys.push(`ORDER_${fromOrder}_to_${String(toCode).trim()}`);
  }
  if (toCode) {
    candidateKeys.push(`DEPOT_50_to_${String(toCode).trim()}`);
    candidateKeys.push(`DEPOT_10_to_${String(toCode).trim()}`);
    candidateKeys.push(`DEPOT_20_to_${String(toCode).trim()}`);
    candidateKeys.push(`DEPOT_30_to_${String(toCode).trim()}`);
  }

  // 1. /leg_tracks/{key}.json から候補キーを順次検索
  for (const key of candidateKeys) {
    try {
      const res = await fetch(`${CLOUD_RTDB_BASE}/leg_tracks/${encodeURIComponent(key)}.json?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data) && data.length > 0) return data;
        if (data && typeof data === 'object') {
          const pts = Object.values(data);
          if (pts.length > 0) return pts;
        }
      }
    } catch (e) {}
  }

  // 2. /logs/{courseId}/legs/{key}.json から候補キーを検索
  try {
    const allRes = await fetch(`${CLOUD_RTDB_BASE}/logs.json?t=${Date.now()}`);
    if (allRes.ok) {
      const allLogs = await allRes.json();
      if (allLogs && typeof allLogs === 'object') {
        for (const cid of Object.keys(allLogs)) {
          const l = allLogs[cid];
          if (l && l.legs) {
            for (const key of candidateKeys) {
              if (l.legs[key]) {
                const pts = Array.isArray(l.legs[key]) ? l.legs[key] : Object.values(l.legs[key]);
                if (pts.length > 0) return pts;
              }
            }
          }
        }
      }
    }
  } catch (e2) {}

  return [];
}

// 初期化実行 & 顧客地点マスターの自動同期
document.addEventListener('DOMContentLoaded', () => {
  const saved = getSavedFirebaseConfig();
  initFirebaseApp(saved);
  subscribeCustomerLocations();
});

// グローバル公開（明示的エクスポート）
if (typeof window !== 'undefined') {
  window.saveCustomerLocation = saveCustomerLocation;
  window.getLocalCustomerLocations = getLocalCustomerLocations;
  window.findCustomerLocation = findCustomerLocation;
  window.findCorrectedCoords = findCorrectedCoords;
  window.subscribeCustomerLocations = subscribeCustomerLocations;
  window.saveLegTrackByCodes = saveLegTrackByCodes;
  window.fetchLegTrackByCodes = fetchLegTrackByCodes;
  window.fetchGpsLogFromCloud = fetchGpsLogFromCloud;
  window.deleteCourseFromCloud = deleteCourseFromCloud;
  window.fetchCoursesFromCloudDirect = fetchCoursesFromCloudDirect;
  window.uploadCourseToCloud = uploadCourseToCloud;
  window.updateItemStatusToCloud = updateItemStatusToCloud;
  window.updateDriverLocationToCloud = updateDriverLocationToCloud;
  window.subscribeCoursesFromCloud = subscribeCoursesFromCloud;
  window.subscribeDriverLocations = subscribeDriverLocations;
  window.appendGpsLogToCloud = appendGpsLogToCloud;
}
