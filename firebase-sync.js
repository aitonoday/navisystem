/**
 * Lively Navi - Firebase Realtime Database 同期モジュール (高堅牢版)
 */

// プロジェクト設定 (シンガポール & 米国両対応)
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBk4ap0jdbWdy83Titr03rvOd0PsT597Ro",
  authDomain: "lively-navi.firebaseapp.com",
  projectId: "lively-navi",
  storageBucket: "lively-navi.firebasestorage.app",
  messagingSenderId: "218951573577",
  appId: "1:218951573577:web:786794bb73686b01039f98",
  databaseURL: "https://lively-navi-default-rtdb.asia-southeast1.firebasedatabase.app" // アジア（シンガポール）標準
};

const FIREBASE_CONFIG_KEY = 'lively_navi_firebase_config';
let firebaseApp = null;
let firebaseDb = null;

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
  if (!activeConfig || !activeConfig.apiKey) {
    return false;
  }

  try {
    if (!window.firebase) {
      console.warn("Firebase SDK not loaded.");
      return false;
    }

    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(activeConfig);
    } else {
      firebaseApp = firebase.app();
    }

    // シンガポール / 米国 URL を自動解決
    const dbUrl = activeConfig.databaseURL || "https://lively-navi-default-rtdb.asia-southeast1.firebasedatabase.app";
    firebaseDb = firebase.app().database(dbUrl);
    console.log("✅ Firebase Connected to:", dbUrl);
    return true;
  } catch (err) {
    console.warn("Primary DB connection failed, trying fallback US DB URL:", err);
    try {
      firebaseDb = firebase.app().database("https://lively-navi-default-rtdb.firebaseio.com");
      return true;
    } catch (e) {
      console.error("Firebase connection totally failed:", e);
      return false;
    }
  }
}

// --- 1. コース情報の送受信 ---

async function uploadCourseToCloud(course) {
  if (!firebaseDb) initFirebaseApp(getSavedFirebaseConfig());
  if (!firebaseDb) return false;

  try {
    await firebaseDb.ref(`courses/${course.id}`).set({
      ...course,
      updatedAt: Date.now()
    });
    console.log("✅ Course successfully uploaded to cloud:", course.name);
    return true;
  } catch (err) {
    console.error("❌ Upload course error:", err);
    // フォールバックDBでも再試行
    try {
      const fallbackDb = firebase.app().database("https://lively-navi-default-rtdb.firebaseio.com");
      await fallbackDb.ref(`courses/${course.id}`).set({
        ...course,
        updatedAt: Date.now()
      });
      firebaseDb = fallbackDb;
      console.log("✅ Course uploaded to fallback DB:", course.name);
      return true;
    } catch (e2) {
      console.error("❌ Fallback upload failed:", e2);
      return false;
    }
  }
}

function subscribeCoursesFromCloud(onCoursesUpdated) {
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
    console.warn("subscribeCoursesFromCloud err:", e);
    return null;
  }
}

async function updateItemStatusToCloud(courseId, itemId, isDone) {
  if (!firebaseDb) return false;
  try {
    const courseRef = firebaseDb.ref(`courses/${courseId}`);
    const snapshot = await courseRef.once('value');
    const course = snapshot.val();
    if (course && course.items) {
      const idx = course.items.findIndex(i => i.id === itemId);
      if (idx !== -1) {
        course.items[idx].isDone = isDone;
        course.items[idx].arrivedAt = isDone ? Date.now() : null;
        course.updatedAt = Date.now();
        await courseRef.set(course);
      }
    }
    return true;
  } catch (err) {
    console.error("Update item status error:", err);
    return false;
  }
}

// --- 2. ドライバー位置情報の送受信 ---

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
    }, (err) => console.warn("Subscribe drivers warning:", err));
    return ref;
  } catch (e) {
    return null;
  }
}

// --- 3. 走行ログ（GPS軌跡）の蓄積と取得 ---

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
  if (!firebaseDb) return [];
  try {
    const snapshot = await firebaseDb.ref(`logs/${courseId}/points`).once('value');
    const data = snapshot.val();
    if (data) {
      return Object.values(data);
    }
    return [];
  } catch (err) {
    console.error("Fetch GPS log error:", err);
    return [];
  }
}

// 初期化実行
document.addEventListener('DOMContentLoaded', () => {
  const saved = getSavedFirebaseConfig();
  initFirebaseApp(saved);
});
