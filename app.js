import { db } from './firebase.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs, runTransaction, serverTimestamp, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL_PROD = "productos", COL_VENTAS = "ventas", COL_BACKUPS = "backups";
const STOCK_MINIMO = 5;
let products = [], cart = [], unsubscribeProducts, isScannerRunning = false;

// --- UTILS ---
const $ = id => document.getElementById(id);
const showToast = (msg, type='success') => {
    const container = $('toast-container');
    if(!container) return;
    const t = document.createElement('div'); t.className = `toast ${type}`; t.innerText = msg;
    container.appendChild(t); setTimeout(() => t.remove(), 4000);
};
const setLoading = (state) => { const l = $('loader'); if(l) l.classList.toggle('hidden',!state); };
const debounce = (fn, delay) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); }};
const formatPrice = n => `$${parseFloat(n || 0).toFixed(2)}`;

// --- EVENTOS ---
function setupEventListeners() {
    $('btn-ventas').onclick = () => switchSection('ventas');
    $('btn-inventario').onclick = () => switchSection('inventario');
    $('btn-backups').onclick = () => switchSection('backups');
    $('search-inventario').oninput = debounce(renderInventory, 300);
    $('search-venta').oninput = debounce(() => {
        const val = $('search-venta').value.toLowerCase().trim();
        if(!val) return;
        const product = products.find(p => p.codigo === val || p.nombre.toLowerCase().includes(val) || p.precio.toString().includes(val));
        if(product) { addToCart(product); $('search-venta').value = ''; }
    }, 500);
    $('btn-add-product').onclick = () => { $('modal-title').innerText = "Nuevo Producto"; $('modal-product').classList.remove('hidden'); };
    $('btn-cancel').onclick = closeModal;
    $('form-product').onsubmit = saveProduct;
    $('btn-clear-cart').onclick = () => { cart = []; renderCart(); };
    $('btn-checkout').onclick = checkout;
    $('btn-scan-venta').onclick = () => startScanner('venta');
    $('btn-scan-modal').onclick = () => startScanner('modal');
    $('btn-close-camera').onclick = stopScanner;
    $('btn-backup-manual').onclick = () => createBackup('manual');
    $('btn-restore').onclick = () => $('file-restore').click();
    $('file-restore').onchange = handleRestore;
};

// --- INIT ---
function init() {
    setupEventListeners();
    unsubscribeProducts = onSnapshot(collection(db, COL_PROD), snap => {
        products = snap.docs.map(d => ({ id: d.id,...d.data() }));
        renderInventory(); renderCart();
    }, err => { console.error(err); showToast("Error cargando productos: " + err.message, 'error'); });
    window.addEventListener('beforeunload', autoBackup);
}
init();

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
    if(!data.nombre ||!data.nombre.trim()) throw new Error("El nombre no puede estar vacío");
    if(isNaN(data.precio) || data.precio < 0) throw new Error("El precio no puede ser negativo");
    if(isNaN(data.stock) || data.stock < 0) throw new Error("El stock no puede ser negativo");
    if(!data.codigo ||!data.codigo.trim()) throw new Error("El código no puede estar vacío");
    const dup = products.find(p => p.codigo === data.codigo && p.id!== id);
    if(dup) throw new Error("Ya existe un producto con ese código de barras");
}

async function saveProduct(e) {
    e.preventDefault(); setLoading(true);
    const id = $('prod-id').value;
    const data = {
        codigo: $('prod-code').value.trim(),
        nombre: $('prod-name').value.trim(),
        precio: parseFloat($('prod-price').value),
        stock: parseInt($('prod-stock').value),
        updatedAt: serverTimestamp()
    };
    try {
        validateProduct(data, id);
        if(id) await updateDoc(doc(db, COL_PROD, id), data);
        else await addDoc(collection(db, COL_PROD), {...data, createdAt: serverTimestamp()});
        showToast(id? "Producto actualizado" : "Producto creado");
        closeModal();
    } catch(err) { showToast(err.message, 'error'); }
    finally { setLoading(false); }
}

window.editProduct = function(id) {
    const p = products.find(prod => prod.id === id); if(!p) return;
    $('modal-title').innerText = "Editar Producto";
    $('prod-id').value = p.id; $('prod-code').value = p.codigo; $('prod-name').value = p.nombre;
    $('prod-price').value = p.precio; $('prod-stock').value = p.stock;
    $('modal-product').classList.remove('hidden');
};

window.deleteProduct = async function(id) {
    if(!confirm("¿Eliminar este producto?")) return;
    setLoading(true);
    try { await deleteDoc(doc(db, COL_PROD, id)); showToast("Producto eliminado"); }
    catch(err) { showToast("Error: " + err.message, 'error'); }
    finally { setLoading(false); }
};

function closeModal() {
    $('modal-product').classList.add('hidden');
    $('form-product').reset();
    $('prod-id').value = "";
}

// --- RENDER INVENTARIO ---
function renderInventory() {
    const filter = $('search-inventario').value.toLowerCase();
    const filtered = products.filter(p =>
        p.nombre.toLowerCase().includes(filter) ||
        p.codigo.includes(filter) ||
        p.precio.toString().includes(filter)
    );
    $('inventory-list').innerHTML = filtered.map(p => `
        <div class="prod-card ${p.stock <= STOCK_MINIMO? 'low-stock' : ''}">
            <h3>${p.nombre}</h3><p class="code">${p.codigo}</p>
            <p class="price">${formatPrice(p.precio)}</p>
            <p class="stock ${p.stock <= STOCK_MINIMO? 'alert' : ''}">Stock: ${p.stock} ${p.stock <= STOCK_MINIMO? '(Bajo)' : ''}</p>
            <div class="prod-actions">
                <button class="btn-icon" onclick="window.editProduct('${p.id}')"><i data-lucide="edit-2"></i></button>
                <button class="btn-icon" onclick="window.deleteProduct('${p.id}')"><i data-lucide="trash-2" style="color: var(--danger)"></i></button>
            </div>
        </div>`).join('') || '<div class="empty-state">No hay productos</div>';
    lucide.createIcons();
}

// --- VENTAS ---
function addToCart(product) {
    if(product.stock <= 0) return showToast("Sin stock", 'error');
    const existing = cart.find(item => item.id === product.id);
    if(existing) {
        if(existing.cantidad >= product.stock) return showToast("Stock máximo alcanzado", 'error');
        existing.cantidad++;
    } else cart.push({...product, cantidad: 1 });
    renderCart();
}

window.updateCartQty = function(id, delta) {
    const item = cart.find(i => i.id === id); const prod = products.find(p => p.id === id);
    if(!item ||!prod) return;
    if(delta > 0 && item.cantidad >= prod.stock) return showToast("Stock máximo alcanzado", 'error');
    item.cantidad += delta;
    if(item.cantidad <= 0) cart = cart.filter(i => i.id!== id);
    renderCart();
};

function renderCart() {
    if(cart.length === 0) {
        $('cart-items').innerHTML = '<div class="empty-state">Carrito vacío</div>';
        $('cart-total').innerText = '$0.00'; $('btn-checkout').disabled = true; return;
    }
    let total = 0;
    $('cart-items').innerHTML = cart.map(item => {
        const subtotal = item.precio * item.cantidad; total += subtotal;
        return `<div class="cart-item"><div class="cart-item-info"><h4>${item.nombre}</h4><p>${formatPrice(item.precio)} x ${item.cantidad}</p></div>
        <div class="cart-item-actions">
            <button class="qty-btn" onclick="window.updateCartQty('${item.id}', -1)">-</button><span>${item.cantidad}</span>
            <button class="qty-btn" onclick="window.updateCartQty('${item.id}', 1)">+</button>
            <span style="font-weight:700; min-width:70px; text-align:right">${formatPrice(subtotal)}</span>
        </div></div>`;
    }).join('');
    $('cart-total').innerText = formatPrice(total); $('btn-checkout').disabled = false;
}

async function checkout() {
    if(cart.length === 0) return;
    $('btn-checkout').disabled = true; setLoading(true);
    try {
        await runTransaction(db, async (transaction) => {
            for(const item of cart){
                const prodRef = doc(db, COL_PROD, item.id);
                const prodSnap = await transaction.get(prodRef);
                if(!prodSnap.exists()) throw new Error(`Producto ${item.nombre} no encontrado`);
                const newStock = prodSnap.data().stock - item.cantidad;
                if(newStock < 0) throw new Error(`Stock insuficiente para ${item.nombre}`);
                transaction.update(prodRef, { stock: newStock });
            }
            const ventaRef = doc(collection(db, COL_VENTAS));
            transaction.set(ventaRef, { items: cart.map(i=>({id:i.id,nombre:i.nombre,precio:i.precio,cantidad:i.cantidad})), total: cart.reduce((a,i)=>a+i.precio*i.cantidad,0), fecha: serverTimestamp() });
        });
        showToast("Venta realizada con éxito"); cart = [];
    } catch(err) { showToast("Error en venta: " + err.message, 'error'); }
    finally { $('btn-checkout').disabled = false; setLoading(false); }
}

// --- ESCANER ---
function startScanner(target) {
    if(isScannerRunning) return;
    isScannerRunning = true; $('camera-overlay').classList.remove('hidden');
    Quagga.init({
        inputStream: { name: "Live", type: "LiveStream", target: $('#interactive'), constraints: { facingMode: "environment", width: 640 } },
        decoder: { readers: ["ean_reader", "ean_8_reader", "code_128_reader", "upc_reader", "upc_e_reader"] },
        locate: true
    }, err => { if(err) { showToast(err.message, 'error'); stopScanner(); } else Quagga.start(); });

    Quagga.onDetected(onDetected);
    function onDetected(data){
        if(!isScannerRunning) return;
        const code = data.codeResult.code;
        if(navigator.vibrate) navigator.vibrate(200);
        stopScanner();
        if(target === 'modal') $('prod-code').value = code;
        else {
            const product = products.find(p => p.codigo === code);
            if(product) addToCart(product);
            else if(confirm("No existe. ¿Crear producto?")) { switchSection('inventario'); $('btn-add-product').click(); $('prod-code').value = code; }
        }
    }
}
function stopScanner() { if(isScannerRunning){ Quagga.stop(); Quagga.offDetected(); isScannerRunning = false; } $('camera-overlay').classList.add('hidden'); }

// --- BACKUPS ---
async function createBackup(type='manual') {
    setLoading(true);
    try {
        const [prodSnap, ventasSnap] = await Promise.all([getDocs(collection(db, COL_PROD)), getDocs(collection(db, COL_VENTAS))]);
        const backup = {
            productos: prodSnap.docs.map(d=>({id:d.id,...d.data()})),
            ventas: ventasSnap.docs.map(d=>({id:d.id,...d.data()})),
            fecha: new Date().toISOString(),
            tipo: type,
            version: "1.0.0"
        };
        await addDoc(collection(db, COL_BACKUPS), backup);
        const blob = new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup-${Date.now()}.json`; a.click();
        showToast("Backup creado y descargado");
    } catch(err) { showToast("Error backup: " + err.message, 'error'); }
    finally { setLoading(false); }
}

async function renderBackupHistory() {
    const snap = await getDocs(collection(db, COL_BACKUPS));
    const backups = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=> new Date(b.fecha)-new Date(a.fecha));
    $('backup-history').innerHTML = backups.map(b=>`
        <div class="backup-item card">
            <div><strong>${new Date(b.fecha).toLocaleString()}</strong> - ${b.tipo}</div>
            <div>Productos: ${b.productos?.length || 0} | Ventas: ${b.ventas?.length || 0}</div>
            <button onclick='window.downloadBackup("${b.id}")'>Descargar</button>
        </div>`).join('') || '<div class="empty-state">No hay backups</div>';
}

window.downloadBackup = async function(id) {
    const snap = await getDocs(query(collection(db, COL_BACKUPS)));
    const docFound = snap.docs.find(d=>d.id===id);
    if(!docFound) return showToast("Backup no encontrado", 'error');
    const data = docFound.data();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup-${id}.json`; a.click();
};

function autoBackup() { if(products.length > 0) createBackup('auto'); }

async function handleRestore(e) {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const backup = JSON.parse(event.target.result);
            if(!confirm(`¿Restaurar ${backup.productos.length} productos y ${backup.ventas.length} ventas? Esto sobreescribirá datos.`)) return;
            setLoading(true);
            showToast("Restauración manual desde JSON. Implementar con batch si querés.", 'error');
        } catch(err) { showToast("Archivo inválido", 'error'); }
        finally { setLoading(false); }
    };
    reader.readAsText(file);
}