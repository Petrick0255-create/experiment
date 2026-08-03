// 메인 포털은 Firebase 없이 동작합니다.
// 다른 프로그램에서 Firebase를 사용할 경우 기존 설정을 이 파일에 유지할 수 있습니다.

let db = null;
let firebaseReady = false;

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

if (hasFirebaseConfig) {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
  const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  firebaseReady = true;
}

export { db, firebaseReady };
