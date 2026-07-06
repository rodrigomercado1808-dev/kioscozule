import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
        if (!config[key] || config[key].includes("RENDER_")) {
            throw new Error(`Configuración de Firebase inválida: ${key} está vacío.`);
        }
    }
};

let app, db;
try {
    validateConfig(firebaseConfig);
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') console.warn("Persistencia: múltiples pestañas abiertas");
        else if (err.code == 'unimplemented') console.warn("Persistencia no soportada");
    });
} catch (error) {
    document.getElementById('firebase-error').classList.remove('hidden');
    document.getElementById('firebase-error').innerHTML = `<h3>Error de Configuración</h3><p>${error.message}</p>`;
    console.error(error);
}

export { db };