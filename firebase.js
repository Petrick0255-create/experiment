// Firebase 콘솔에서 발급받은 설정값으로 아래 내용을 교체하세요.
// 설정 전에도 홈페이지의 화면과 바로가기는 정상 작동합니다.

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
  const { initializeApp } = await import(
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"
  );
  const { getFirestore } = await import(
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"
  );

  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  firebaseReady = true;
}

export { db, firebaseReady };
