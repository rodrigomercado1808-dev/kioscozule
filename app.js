import { db } from './firebase.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs, writeBatch, runTransaction, serverTimestamp, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL_PROD = "productos", COL_VENTAS = "ventas", COL_BACKUPS = "backups";
const STOCK_MINIMO = 5;
let products = [], cart = [], unsubscribeProducts, isScannerRunning = false;

// --- UTILS ---
const $ = id => document.getElementById(id);
const showToast = (msg, type='success') => {
    const t = document.createElement('div'); t.className = `toast ${type}`; t.innerText = msg;
    $('toast-container').appendChild(t); setTimeout(() => t.remove(), 4000);
};
const setLoading = (state) => $('loader').classList.toggle('hidden',!state);
const debounce = (fn, delay) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); }};
const formatPrice = n => `$${parseFloat(n).toFixed(2)}`;

// --- EVENTOS - LA SUBO ARRIBA PARA QUE EXISTA ANTES DE LLAMARLA ---
function setupEventListeners() {
    $('btn-ventas').onclick = () => switchSection('ventas');
    $('btn-inventario').onclick = () => switchSection('inventario');
    $('btn-backups').onclick = () => switchSection('backups');
    $('search-inventario').oninput = debounce(renderInventory, 300);
    $('search-venta').oninput = debounce(() => {
        const val = $('search-venta').value.toLowerCase();
        const product = products.find(p => p.codigo === val || p.nombre.toLowerCase().includes(val) || p.precio.toString().includes(val));
        if(product) { addToCart(product); $('search-venta').value = ''; }
    }, 500);
    $('btn-add-product').onclick = () => { $('modal-title').innerText = "Nuevo Producto"; $('modal-product').classList.remove('hidden'); };
    $('btn-cancel').onclick = closeModal; $('form-product').onsubmit = saveProduct;
    $('btn-clear-cart').onclick = () => { cart = []; renderCart(); };
    $('btn-checkout').onclick = checkout;
    $('btn-scan-venta').onclick = () => startScanner('venta');
    $('btn-scan-modal').onclick = () => startScanner('modal');
    $('btn-close-camera').onclick = stopScanner;
    $('btn-backup-manual').onclick = () => createBackup('manual');
    $('btn-restore').onclick = () => $('file-restore').click();
};

// --- INIT ---
function init() {
    setupEventListeners(); // Ahora si existe
    unsubscribeProducts = onSnapshot(collection(db, COL_PROD), snap => {
        products = snap.docs.map(d => ({ id: d.id,...d.data() }));
        renderInventory(); renderCart();
    }, err => showToast("Error cargando productos: " + err.message, 'error'));
    window.addEventListener('beforeunload', autoBackup);
}
init();

//... el resto del código queda igual...

// --- NAV ---
function switchSection(section) {
    ['ventas','inventario','backups'].forEach(s => {
        $(`btn-${s}`).classList.toggle('active', s === section);
        $(`section-${s}`).classList.toggle('hidden', s!== section);
    });
    if(section === 'backups') renderBackupHistory();
}

// --- CRUD CON VALIDACIONES ---
function validateProduct(data, id=null) {
    if(!data.nombre.trim()) throw new Error("El nombre no puede estar vacío");
    if(data.precio < 0) throw new Error("El precio no puede ser negativo");
    if(data.stock < 0) throw new Error("El stock no puede ser negativo");
    if(!data.codigo.trim()) throw new Error("El código no puede estar vacío");
    const dup = products.find(p => p.codigo === data.codigo && p.id!== id);
    if(dup) throw new Error("Ya existe un producto con ese código de barras");
}

async function saveProduct(e) { /*...igual... */ }
window.editProduct = function(id) { /*...igual... */ }
window.deleteProduct = async function(id) { /*...igual... */ }
function closeModal() { /*...igual... */ }

// --- RENDER INVENTARIO ---
function renderInventory() { /*...igual... */ }

// --- VENTAS ---
function addToCart(product) { /*...igual... */ }
window.updateCartQty = function(id, delta) { /*...igual... */ }
function renderCart() { /*...igual... */ }
async function checkout() { /*...igual con runTransaction... */ }

// --- ESCANER ---
function startScanner(target) { /*...igual... */ }
function stopScanner() { /*...igual... */ }

// --- BACKUPS ---
async function createBackup(type='manual') { /*...igual... */ }
async function renderBackupHistory() { /*...igual... */ }
window.downloadBackup = async function(id) { /*...igual... */ }
function autoBackup() { /*...igual... */ }