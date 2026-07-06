import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, CACHE_SIZE_UNLIMITED, persistentLocalCache, persistentSingleTabManager } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8JlyrUvdTZUhdeBuevdWvmtx9i0kQchE",
  authDomain: "kioscozule-71b39.firebaseapp.com",
  projectId: "kioscozule-71b39",
  storageBucket: "kioscozule-71b39.appspot.com",
  messagingSenderId: "150191540806",
  appId: "1:150191540806:web:f50951ecc401c1f78f1847"
};

const validateConfig = (config) => {
    for (const key in config) {
        if (!config[key]) throw new Error(`Configuración de Firebase inválida: ${key} está vacío.`);
    }
};

let app, db;
try {
    validateConfig(firebaseConfig);
    app = initializeApp(firebaseConfig);
    db = getFirestore(app, {
        localCache: persistentLocalCache({
            cacheSizeBytes: CACHE_SIZE_UNLIMITED,
            tabManager: persistentSingleTabManager()
        })
    });
} catch (error) {
    const errorDiv = document.getElementById('firebase-error');
    if(errorDiv) {
        errorDiv.classList.remove('hidden');
        errorDiv.innerHTML = `<h3>Error de Configuración</h3><p>${error.message}</p>`;
    }
    console.error(error);
}

export { db };