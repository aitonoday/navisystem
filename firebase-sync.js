/**
 * Lively Navi - Firebase Realtime Database 同期モジュール
 */

const FIREBASE_CONFIG_KEY = 'lively_navi_firebase_config';
let firebaseApp = null;
let firebaseDb = null;

// Firebase設定の取得
function getSavedFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
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
  if (!config || !config.apiKey || !config.databaseURL) {
    console.log("Firebase config not provided. Running in Local Storage mode.");
    return false;
  }

  try {
    if (!window.firebase) {
      console.warn("Firebase SDK not loaded yet.");
      return false;
    }
    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(config);
    } else {
      firebaseApp = firebase.app();
    }
    firebaseDb = firebase.database();
    console.log("✅ Firebase Realtime Database connected successfully:", config.projectId);
    return true;
  } catch (err) {
    console.error("Firebase init error:", err);
    return false;
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
  });
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
  });
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
  if (saved) {
    initFirebaseApp(saved);
  }
});
