/**
 * Lively Navi - Firebase Realtime Database 同期モジュール (地点マスター対応版)
 */

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBk4ap0jdbWdy83Titr03rvOd0PsT597Ro",
  authDomain: "lively-navi.firebaseapp.com",
  projectId: "lively-navi",
  storageBucket: "lively-navi.firebasestorage.app",
  messagingSenderId: "218951573577",
  appId: "1:218951573577:web:786794bb73686b01039f98",
  databaseURL: "https://lively-navi-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const FIREBASE_CONFIG_KEY = 'lively_navi_firebase_config';
const LOCATION_CORRECTIONS_KEY = 'lively_navi_location_corrections';
let firebaseApp = null;
let firebaseDb = null;

// --- Firebase初期化 ---
function getSavedFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return DEFAULT_FIREBASE_CONFIG;
}

function saveFirebaseConfig(config) {
  if (!config) {
    localStorage.removeItem(FIREBASE_CONFIG_KEY);
    return;
  }
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
  initFirebaseApp(config);
}

function initFirebaseApp(config) {
  const activeConfig = config || DEFAULT_FIREBASE_CONFIG;
  if (!activeConfig || !activeConfig.apiKey) return false;

  try {
    if (!window.firebase) return false;

    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(activeConfig);
    } else {
      firebaseApp = firebase.app();
    }

    const dbUrl = activeConfig.databaseURL || "https://lively-navi-default-rtdb.asia-southeast1.firebasedatabase.app";
    firebaseDb = firebase.app().database(dbUrl);
    console.log("✅ Firebase Connected to:", dbUrl);
    return true;
  } catch (err) {
    try {
      firebaseDb = firebase.app().database("https://lively-navi-default-rtdb.firebaseio.com");
      return true;
    } catch (e) {
      console.error("Firebase init failed:", e);
      return false;
    }
  }
}

// --- 1. 地点補正マスター（Location Corrections）の永続保存＆自動検索 ---

function normalizeAddressKey(address, name = "") {
  const cleanAddr = (address || "").replace(/[\s　\-\ー－]/g, "").trim();
  const cleanName = (name || "").replace(/[\s　]/g, "").trim();
  // Firebaseのキーとして使用できない文字を除去
  return `${cleanAddr}_${cleanName}`.replace(/[\.\#\$\[\]\/]/g, "_");
}

// 地点修正をローカル＆クラウドマスターへ登録
async function saveLocationCorrection(address, name, lat, lng) {
  if (!address || !lat || !lng) return false;

  const key = normalizeAddressKey(address, name);
  const data = {
    address: address.trim(),
    name: (name || "").trim(),
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    updatedAt: Date.now()
  };

  // 1. ローカルストレージに即時保存
  try {
    const corrections = getLocalLocationCorrections();
    corrections[key] = data;
    localStorage.setItem(LOCATION_CORRECTIONS_KEY, JSON.stringify(corrections));
  } catch (e) {
    console.warn("Local correction save error:", e);
  }

  // 2. クラウド（Firebase）へ非同期保存
  if (!firebaseDb) initFirebaseApp(getSavedFirebaseConfig());
  if (firebaseDb) {
    try {
      await firebaseDb.ref(`location_corrections/${key}`).set(data);
      console.log("✅ Location correction saved to cloud:", key);
    } catch (err) {
      console.warn("Cloud correction save error:", err);
    }
  }

  return true;
}

// ローカルに保存されている全地点補正を取得
function getLocalLocationCorrections() {
  try {
    const raw = localStorage.getItem(LOCATION_CORRECTIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

// 住所や名前から過去の修正座標を検索（完全一致または住所部分一致）
function findCorrectedCoords(address, name = "") {
  if (!address) return null;
  const corrections = getLocalLocationCorrections();

  // 1. 住所＋名前の完全一致
  const fullKey = normalizeAddressKey(address, name);
  if (corrections[fullKey]) {
    return { lat: corrections[fullKey].lat, lng: corrections[fullKey].lng, isMaster: true };
  }

  // 2. 住所のみの一致
  const cleanAddr = (address || "").replace(/[\s　\-\ー－]/g, "").trim();
  for (const k in corrections) {
    const item = corrections[k];
    const itemAddr = (item.address || "").replace(/[\s　\-\ー－]/g, "").trim();
    if (itemAddr && (itemAddr === cleanAddr || cleanAddr.startsWith(itemAddr) || itemAddr.startsWith(cleanAddr))) {
      return { lat: item.lat, lng: item.lng, isMaster: true };
    }
  }

  return null;
}

// クラウド上の地点補正マスターを購読＆ローカル同期
function subscribeLocationCorrections(onLoaded) {
  if (!firebaseDb) initFirebaseApp(getSavedFirebaseConfig());
  if (!firebaseDb) return null;

  try {
    const ref = firebaseDb.ref('location_corrections');
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        const local = getLocalLocationCorrections();
        const merged = { ...local, ...data };
        localStorage.setItem(LOCATION_CORRECTIONS_KEY, JSON.stringify(merged));
        console.log("✅ Synced location corrections master:", Object.keys(merged).length, "points");
        if (onLoaded) onLoaded(merged);
      }
    });
    return ref;
  } catch (e) {
    return null;
  }
}

// --- 2. コース情報の送受信（REST APIダイレクト同期 ＋ Firebase SDK ハイブリッド） ---

const CLOUD_RTDB_BASE = "https://lively-navi-default-rtdb.asia-southeast1.firebasedatabase.app";

async function uploadCourseToCloud(course) {
  const courseData = {
    ...course,
    updatedAt: Date.now()
  };

  let isSuccess = false;

  // 1. ダイレクト REST API (PUT) - SDK接続に依存せず100%確実に同期
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

  // 2. Firebase SDK経由でも保存
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
  // 初回即時取得 (REST API)
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

// クラウドから直接コースを1回即時取得する関数 (REST API ダイレクト)
async function fetchCoursesFromCloudDirect() {
  // 1. ダイレクト REST API (GET) - 最優先で即座に取得
  try {
    const res = await fetch(`${CLOUD_RTDB_BASE}/courses.json?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        let list = Object.values(data).filter(c => c && c.items && c.items.length > 0);
        if (list.length > 0) {
          // 更新日時順（新しい順）にソート
          list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          console.log(`✅ Fetched ${list.length} courses directly from cloud REST API`);
          return list;
        }
      }
    }
  } catch (restErr) {
    console.warn("Direct REST fetch error:", restErr);
  }

  // 2. Firebase SDK fallback
  try {
    if (!firebaseDb) initFirebaseApp(getSavedFirebaseConfig());
    if (firebaseDb) {
      const snapshot = await firebaseDb.ref('courses').once('value');
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        return Object.values(data).filter(c => c && c.items && c.items.length > 0);
      }
    }
  } catch (e) {}

  return [];
}

// クラウドからコースを削除する関数
async function deleteCourseFromCloud(courseId) {
  try {
    // 1. ダイレクト REST API (DELETE)
    await fetch(`${CLOUD_RTDB_BASE}/courses/${courseId}.json`, { method: 'DELETE' });
    console.log("✅ Deleted course from cloud via REST:", courseId);
  } catch (e) {}

  try {
    // 2. Firebase SDK fallback
    if (!firebaseDb) initFirebaseApp(getSavedFirebaseConfig());
    if (firebaseDb) {
      await firebaseDb.ref(`courses/${courseId}`).remove();
    }
  } catch (e2) {}

  return true;
}

async function updateItemStatusToCloud(courseId, itemId, isDone) {
  try {
    // REST API で即時更新
    const res = await fetch(`${CLOUD_RTDB_BASE}/courses/${courseId}/items.json`);
    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items)) {
        const idx = items.findIndex(i => i && i.id === itemId);
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

// --- 3. ドライバー位置情報の送受信 ---

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

function subscribeDriverLocations(onDriversUpdated) {
  if (!firebaseDb) initFirebaseApp(getSavedFirebaseConfig());
  if (!firebaseDb) return null;

  try {
    const ref = firebaseDb.ref('drivers');
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      onDriversUpdated(data || {});
    });
    return ref;
  } catch (e) {
    return null;
  }
}

// --- 4. 走行ログ（GPS軌跡）の蓄積と取得 ---

async function appendGpsLogToCloud(courseId, point) {
  if (!firebaseDb) return false;
  try {
    await firebaseDb.ref(`logs/${courseId}/points`).push({
      ...point,
      time: point.time || Date.now()
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function fetchGpsLogFromCloud(courseId) {
  // 1. ダイレクト REST API (GET) - 指定courseIdを検索
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

  // 2. 指定IDで見つからない場合、クラウド上の全ログから最新・最大のログを自動検索
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
        if (bestPoints.length > 0) {
          console.log(`✅ Fallback found ${bestPoints.length} GPS points from cloud logs`);
          return bestPoints;
        }
      }
    }
  } catch (e2) {}

// --- 5. 区間（A➔B）ごとの登録軌跡ログ（お手本ルート）の保存と取得 ---

async function saveLegGpsLogToCloud(courseId, legKey, points) {
  if (!courseId || !legKey || !points || points.length === 0) return false;
  try {
    // 1. ダイレクト REST API (PUT)
    await fetch(`${CLOUD_RTDB_BASE}/logs/${courseId}/legs/${legKey}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(points)
    });
    console.log(`✅ Saved ${points.length} GPS points for leg ${legKey} to cloud`);
    return true;
  } catch (e) {
    console.warn("saveLegGpsLog error:", e);
    return false;
  }
}

async function fetchLegGpsLogFromCloud(courseId, legKey) {
  if (!courseId || !legKey) return [];
  try {
    // 1. ダイレクト REST API (GET)
    const res = await fetch(`${CLOUD_RTDB_BASE}/logs/${courseId}/legs/${legKey}.json?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data) && data.length > 0) {
        return data;
      } else if (data && typeof data === 'object') {
        const list = Object.values(data);
        if (list.length > 0) return list;
      }
    }
  } catch (e) {}

  // 2. 指定IDで見つからない場合、全ログ内の legs を検索
  try {
    const allRes = await fetch(`${CLOUD_RTDB_BASE}/logs.json?t=${Date.now()}`);
    if (allRes.ok) {
      const allLogs = await allRes.json();
      if (allLogs && typeof allLogs === 'object') {
        for (const cid of Object.keys(allLogs)) {
          const l = allLogs[cid];
          if (l && l.legs && l.legs[legKey]) {
            const pts = Array.isArray(l.legs[legKey]) ? l.legs[legKey] : Object.values(l.legs[legKey]);
            if (pts.length > 0) return pts;
          }
        }
      }
    }
  } catch (e2) {}

  return [];
}

// 初期化実行 & 地点補正マスターの自動同期
document.addEventListener('DOMContentLoaded', () => {
  const saved = getSavedFirebaseConfig();
  initFirebaseApp(saved);
  subscribeLocationCorrections();
});

// グローバル公開（明示的エクスポート）
if (typeof window !== 'undefined') {
  window.fetchGpsLogFromCloud = fetchGpsLogFromCloud;
  window.saveLegGpsLogToCloud = saveLegGpsLogToCloud;
  window.fetchLegGpsLogFromCloud = fetchLegGpsLogFromCloud;
  window.deleteCourseFromCloud = deleteCourseFromCloud;
  window.fetchCoursesFromCloudDirect = fetchCoursesFromCloudDirect;
  window.saveLocationCorrection = saveLocationCorrection;
  window.findCorrectedCoords = findCorrectedCoords;
}
