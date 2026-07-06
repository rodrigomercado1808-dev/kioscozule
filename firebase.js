import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8JlyrUvdTZUhdeBuevdWvmtx9i0kQchE",
  authDomain: "kioscozule-71b39.firebaseapp.com",
  projectId: "kioscozule-71b39",
  storageBucket: "kioscozule-71b39.appspot.com",
  messagingSenderId: "150191540806",
  appId: "1:150191540806:web:f50951ecc401c1f78f1847"
};

// Validación simple
if (!firebaseConfig.projectId) {
    document.getElementById('firebase-error').classList.remove('hidden');
    document.getElementById('firebase-error').innerText = "Error: Falta projectId en Firebase Config";
    throw new Error("Firebase config inválida");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app); // SIN SEGUNDO PARAMETRO. Así no rompe

export { db };