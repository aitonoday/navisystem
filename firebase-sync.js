/**
 * Lively Navi - Firebase Realtime Database 同期モジュール
 */

// プロジェクト固有のデフォルトFirebase設定
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBk4ap0jdbWdy83Titr03rvOd0PsT597Ro",
  authDomain: "lively-navi.firebaseapp.com",
  projectId: "lively-navi",
  storageBucket: "lively-navi.firebasestorage.app",
  messagingSenderId: "218951573577",
  appId: "1:218951573577:web:786794bb73686b01039f98",
  databaseURL: "https://lively-navi-default-rtdb.firebaseio.com" // 米国/アジア自動フォールバック対応
};

const FIREBASE_CONFIG_KEY = 'lively_navi_firebase_config';
let firebaseApp = null;
let firebaseDb = null;

// Firebase設定の取得（保存済み or デフォルト）
function getSavedFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return DEFAULT_FIREBASE_CONFIG;
}

// Firebase設定の保存
function saveFirebaseConfig(config) {
  if (!config) {
    localStorage.removeItem(FIREBASE_CONFIG_KEY);
    return;
  }
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
  initFirebaseApp(config);
}

// Firebase SDK 初期化
function initFirebaseApp(config) {
  const activeConfig = config || DEFAULT_FIREBASE_CONFIG;
  if (!activeConfig || !activeConfig.apiKey) {
    console.log("Firebase config not provided. Running in Local Storage mode.");
    return false;
  }

  try {
    if (!window.firebase) {
      console.warn("Firebase SDK not loaded yet.");
      return false;
    }

    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(activeConfig);
    } else {
      firebaseApp = firebase.app();
    }

    // データベースインスタンスの接続
    if (activeConfig.databaseURL) {
      firebaseDb = firebase.database();
    } else {
      firebaseDb = firebase.app().database("https://lively-navi-default-rtdb.asia-southeast1.firebasedatabase.app");
    }

    console.log("✅ Firebase Realtime Database connected successfully to project:", activeConfig.projectId);
    return true;
  } catch (err) {
    console.warn("Firebase primary init warning, trying fallback DB URL:", err);
    try {
      firebaseDb = firebase.app().database("https://lively-navi-default-rtdb.asia-southeast1.firebasedatabase.app");
      return true;
    } catch (e) {
      console.error("Firebase fallback failed:", e);
      return false;
    }
  }
}

// --- 1. コース情報の送受信 ---

// PC管理画面からコースをクラウドに保存・配信
async function uploadCourseToCloud(course) {
  if (!firebaseDb) return false;
  try {
    await firebaseDb.ref(`courses/${course.id}`).set({
      ...course,
      updatedAt: Date.now()
    });
    console.log("Course uploaded to cloud:", course.name);
    return true;
  } catch (err) {
    console.error("Upload course error:", err);
    return false;
  }
}

// スマホ / PCでコース一覧をリアルタイム購読
function subscribeCoursesFromCloud(onCoursesUpdated) {
  if (!firebaseDb) return null;
  const ref = firebaseDb.ref('courses');
  ref.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const courseList = Object.values(data);
      onCoursesUpdated(courseList);
    } else {
      onCoursesUpdated([]);
    }
  }, (err) => console.warn("Subscribe courses warning:", err));
  return ref;
}

// 配達完了ステータスの更新
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

// スマホから現在地をクラウドへ送信
async function updateDriverLocationToCloud(driverId, locationData) {
  if (!firebaseDb) return false;
  try {
    await firebaseDb.ref(`drivers/${driverId}`).set({
      ...locationData,
      updatedAt: Date.now()
    });
    return true;
  } catch (err) {
    console.error("Update driver location error:", err);
    return false;
  }
}

// PC管理画面で全ドライバーの現在地をリアルタイム購読
function subscribeDriverLocations(onDriversUpdated) {
  if (!firebaseDb) return null;
  const ref = firebaseDb.ref('drivers');
  ref.on('value', (snapshot) => {
    const data = snapshot.val();
    onDriversUpdated(data || {});
  }, (err) => console.warn("Subscribe drivers warning:", err));
  return ref;
}

// --- 3. 走行ログ（GPS軌跡）の蓄積と取得 ---

// 走行ログポイントの追加
async function appendGpsLogToCloud(courseId, point) {
  if (!firebaseDb) return false;
  try {
    await firebaseDb.ref(`logs/${courseId}/points`).push({
      ...point,
      time: point.time || Date.now()
    });
    return true;
  } catch (err) {
    console.error("Append GPS log error:", err);
    return false;
  }
}

// PC管理画面で走行ログを取得
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
