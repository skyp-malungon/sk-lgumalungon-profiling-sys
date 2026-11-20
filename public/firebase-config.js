// ===============================================================
// SK YOUTH MANAGEMENT SYSTEM - FIREBASE CONFIGURATION
// Project: sk-lgumalungon-profiling-sys (Sarangani Province)
// ===============================================================

const firebaseConfig = {
  projectId: "sk-lgumalungon-profiling-sys",
  appId: "1:262529852920:web:28ebcdfbe1ed28397ea20d",
  storageBucket: "sk-lgumalungon-profiling-sys.firebasestorage.app",
  apiKey: "AIzaSyB06Zgcz1RtiU_VxozJ0XTAxMxVdI7XxH4",
  authDomain: "sk-lgumalungon-profiling-sys.firebaseapp.com",
  messagingSenderId: "262529852920"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

// Enable offline cache (IndexedDB) for instant loads and field-work
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('[Firebase] Multiple tabs open; offline persistence enabled in primary tab only.');
  } else if (err.code === 'unimplemented') {
    console.warn('[Firebase] Browser does not support offline persistence.');
  }
});

console.log('[Firebase] Cloud Firestore & Auth initialized successfully.');
