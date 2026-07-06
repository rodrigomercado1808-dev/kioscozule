// Firebase Configuration - Kiosco App
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Configuración de Firebase (se inyectará vía script en index.html o env vars)
const firebaseConfig = {
    apiKey: window.FIREBASE_CONFIG?.apiKey || "",
    authDomain: window.FIREBASE_CONFIG?.authDomain || "",
    projectId: window.FIREBASE_CONFIG?.projectId || "",
    storageBucket: window.FIREBASE_CONFIG?.storageBucket || "",
    messagingSenderId: window.FIREBASE_CONFIG?.messagingSenderId || "",
    appId: window.FIREBASE_CONFIG?.appId || ""
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };