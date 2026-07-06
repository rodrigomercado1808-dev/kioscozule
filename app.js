import { db } from './firebase.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs, runTransaction, serverTimestamp, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { $, debounce, formatPrice, showToast, setLoading } from './utils.js';
import { renderCajaData, generateSaleCode } from './sales.js';
import Scanner from './scanner.js';

const COL_PROD = "productos", COL_VENTAS = "ventas", COL_BACKUPS = "backups";
const STOCK_MINIMO = 5;
let products = [], cart = [], unsubscribeProducts, isScannerRunning = false;
let unsubscribeVentas = null;
let lastVentasCache = [];
let dayStarted = false;
let currentDayKey = null;

// --- EVENTOS ---
function setupEventListeners() {
    $('btn-ventas').onclick = () => switchSection('ventas');
    $('btn-inventario').onclick = () => switchSection('inventario');
    $('btn-caja').onclick = () => switchSection('caja');
    $('btn-backups').onclick = () => switchSection('backups');
    $('search-inventario').oninput = debounce(renderInventory, 300);
    // Enhanced search with suggestions and human confirmation
    const searchVenta = $('search-venta');
    const searchResults = $('search-results');
    searchVenta.oninput = debounce(() => {
        const val = searchVenta.value.toLowerCase().trim();
        if(!val) { searchResults.classList.add('hidden'); return; }
        // fuzzy-ish matching: startsWith for code, includes for name
        const matches = products.filter(p => p.codigo.toLowerCase().startsWith(val) || p.nombre.toLowerCase().includes(val) || p.precio.toString().includes(val));
        if(matches.length === 0) { searchResults.innerHTML = `<div class="item">No se encontraron coincidencias</div>`; searchResults.classList.remove('hidden'); return; }
        searchResults.innerHTML = matches.slice(0,10).map(p=>`<div class="item" data-id="${p.id}"><strong>${p.nombre}</strong> <span class="code">${p.codigo}</span> <span style="float:right">${formatPrice(p.precio)}</span></div>`).join('');
        lucide.createIcons && lucide.createIcons();
        searchResults.classList.remove('hidden');
    }, 250);
    // click handler for suggestion items
    searchResults.addEventListener('click', (ev) => {
        const el = ev.target.closest('.item'); if(!el) return;
        const id = el.dataset.id; const product = products.find(p=>p.id===id);
        if(!product) return showToast('Producto no encontrado','error');
        // require user confirmation before adding
        if(confirm(`Agregar ${product.nombre} al carrito? (Stock: ${product.stock})`)) addToCart(product);
        searchVenta.value = ''; searchResults.classList.add('hidden');
    });
    // hide suggestions on outside click
    document.addEventListener('click', e=>{ if(!e.target.closest('.search-box')) searchResults.classList.add('hidden'); });
    $('btn-add-product').onclick = () => { $('modal-title').innerText = "Nuevo Producto"; $('modal-product').classList.remove('hidden'); };
    $('btn-cancel').onclick = closeModal;
    $('form-product').onsubmit = saveProduct;
    $('btn-clear-cart').onclick = () => { cart = []; renderCart(); };
    $('btn-checkout').onclick = checkout;
    $('btn-scan-venta').onclick = () => {
        $('camera-overlay').classList.remove('hidden');
        Scanner.setDetectedCallback(({code,type})=> onScannerDetected(code, type, 'venta'));
        Scanner.start({ target: document.getElementById('interactive'), continuous: false, sound: true, vibrate: true });
    };
    $('btn-scan-modal').onclick = () => {
        $('camera-overlay').classList.remove('hidden');
        Scanner.setDetectedCallback(({code,type})=> onScannerDetected(code, type, 'modal'));
        Scanner.start({ target: document.getElementById('interactive'), continuous: false, sound: true, vibrate: true });
    };
    $('btn-close-camera').onclick = () => { Scanner.stop(); $('camera-overlay').classList.add('hidden'); };
    // hamburger menu toggle for mobile
    const btnMenu = $('btn-menu'); const mainNav = $('main-nav');
    if(btnMenu && mainNav){
        btnMenu.onclick = (e)=>{ e.stopPropagation(); const open = mainNav.classList.toggle('open'); btnMenu.setAttribute('aria-expanded', open); };
        // close menu when clicking a nav button
        mainNav.addEventListener('click', (ev)=>{ const b = ev.target.closest('.nav-btn'); if(b) { mainNav.classList.remove('open'); btnMenu.setAttribute('aria-expanded', false); } });
        // close when clicking outside
        document.addEventListener('click', (ev)=>{ if(!ev.target.closest('.header-flex') && mainNav.classList.contains('open')){ mainNav.classList.remove('open'); btnMenu.setAttribute('aria-expanded', false); } });
    }
    // Quick manual add (ventas)
    const btnManual = $('btn-manual-add'); if(btnManual) btnManual.onclick = openQuickAddModal;
    const quickCancel = $('quick-cancel'); if(quickCancel) quickCancel.onclick = closeQuickAddModal;
    const quickSearch = $('quick-search'); if(quickSearch) quickSearch.oninput = debounce(()=> renderQuickList(quickSearch.value.trim().toLowerCase()), 200);
    const quickList = $('quick-product-list'); if(quickList) quickList.addEventListener('click', (ev)=>{
        const btn = ev.target.closest('[data-action]'); if(!btn) return; const id = btn.getAttribute('data-id') || btn.dataset.id;
        const action = btn.getAttribute('data-action'); if(!id) return;
        const product = products.find(p=>p.id===id); if(!product) return showToast('Producto no encontrado','error');
        if(action === 'add'){
            const itemEl = btn.closest('.quick-item');
            if(!itemEl) return;
            // if qty box already exists, do nothing
            if(itemEl.querySelector('.qty-box')) return;
            const qtyBox = document.createElement('div'); qtyBox.className = 'qty-box';
            qtyBox.innerHTML = `
                <input type="number" class="qty-input" min="1" max="${product.stock}" value="1" style="width:80px;margin-right:8px;padding:6px;border-radius:6px;border:1px solid var(--border)">
                <button class="btn-primary qty-confirm">Agregar</button>
                <button class="btn-secondary qty-cancel">Cancelar</button>
            `;
            itemEl.querySelector('.actions').appendChild(qtyBox);
            const confirmBtn = qtyBox.querySelector('.qty-confirm');
            const cancelBtn = qtyBox.querySelector('.qty-cancel');
            const input = qtyBox.querySelector('.qty-input');
            confirmBtn.onclick = ()=>{
                const qty = parseInt(input.value);
                if(isNaN(qty) || qty <= 0) return showToast('Cantidad inválida','error');
                if(qty > product.stock) return showToast(`Stock insuficiente. Disponible: ${product.stock}`,'error');
                addToCartWithQty(product, qty);
                qtyBox.remove();
            };
            cancelBtn.onclick = ()=> qtyBox.remove();
        }
    });
    $('btn-backup-manual').onclick = () => createBackup('manual');
    $('btn-restore').onclick = () => $('file-restore').click();
    $('file-restore').onchange = handleRestore;
    const btnStartDay = $('btn-start-day'); if(btnStartDay) btnStartDay.onclick = () => startDay();
    const btnRefreshCaja = $('btn-refresh-caja'); if(btnRefreshCaja) btnRefreshCaja.onclick = ()=> renderCaja();
    const btnSaveDay = $('btn-save-day'); if(btnSaveDay) btnSaveDay.onclick = () => saveDayBackup();
    const btnEndDay = $('btn-end-day'); if(btnEndDay) btnEndDay.onclick = () => finalizeDay();
    const selBackups = $('select-backups'); if(selBackups) selBackups.onchange = ()=> {/* selection changed */};
    const btnLoadBackup = $('btn-load-backup'); if(btnLoadBackup) btnLoadBackup.onclick = () => viewSelectedBackup();
    const btnDownloadBackup = $('btn-download-backup'); if(btnDownloadBackup) btnDownloadBackup.onclick = () => downloadDisplayedBackup();
    const btnHideBackupConsole = $('btn-hide-backup-console'); if(btnHideBackupConsole) btnHideBackupConsole.onclick = () => { $('backup-console').classList.add('hidden'); $('backup-content').innerText = ''; };
    // caja filters: re-render when filters change
    const searchCaja = $('search-caja'); if(searchCaja) searchCaja.oninput = debounce(()=> renderCajaData(lastVentasCache), 300);
    ['filter-today','filter-week','filter-month','filter-from','filter-to','filter-sort'].forEach(id=>{
        const el = $(id); if(!el) return; el.onchange = ()=> renderCajaData(lastVentasCache);
    });
};

// --- INIT ---
function init() {
    setupEventListeners();
    loadDayState();
    // populate backups selector
    loadBackupsSelect().catch(()=>{});
    unsubscribeProducts = onSnapshot(collection(db, COL_PROD), snap => {
        products = snap.docs.map(d => ({ id: d.id,...d.data() }));
        renderInventory(); renderCart();
    }, err => { console.error(err); showToast("Error cargando productos: " + err.message, 'error'); });
    window.addEventListener('beforeunload', autoBackup);
}
init();

// --- PWA: service worker registration and install prompt ---
if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').then(reg => console.log('SW registered', reg)).catch(err => console.warn('SW failed', err));
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault(); deferredInstallPrompt = e; const btn = $('btn-install'); if(btn){ btn.classList.remove('hidden'); btn.onclick = async ()=>{
        btn.disabled = true; deferredInstallPrompt.prompt(); const choice = await deferredInstallPrompt.userChoice; if(choice.outcome === 'accepted') showToast('Instalación aceptada'); else showToast('Instalación cancelada','warning'); deferredInstallPrompt = null; btn.classList.add('hidden'); btn.disabled = false;
    }}
});

window.addEventListener('appinstalled', ()=>{ showToast('Kiosco Zule instalado'); const btn = $('btn-install'); if(btn) btn.classList.add('hidden'); });

// --- NAV ---
function switchSection(section) {
    ['ventas','inventario','caja','backups'].forEach(s => {
        $(`btn-${s}`).classList.toggle('active', s === section);
        $(`section-${s}`).classList.toggle('hidden', s!== section);
    });
    if(section === 'backups') renderBackupHistory();
    if(section === 'caja') renderCaja();
}

function getTodayKey(){
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

function saveDayState(){ if(currentDayKey) localStorage.setItem('currentDayKey', currentDayKey); }
function clearDayState(){ currentDayKey = null; dayStarted = false; localStorage.removeItem('currentDayKey'); updateDayButtons(); }
function loadDayState(){ currentDayKey = localStorage.getItem('currentDayKey'); dayStarted = Boolean(currentDayKey); updateDayButtons(); }

function updateDayButtons(){
    const btnStart = $('btn-start-day');
    const btnEnd = $('btn-end-day');
    if(btnStart){
        btnStart.innerHTML = dayStarted ? '<i data-lucide="refresh-ccw"></i> Día iniciado' : '<i data-lucide="play-circle"></i> Iniciar día';
        btnStart.classList.toggle('btn-success', !dayStarted);
        btnStart.classList.toggle('btn-secondary', dayStarted);
    }
    if(btnEnd) btnEnd.disabled = !dayStarted;
    lucide.createIcons && lucide.createIcons();
}

async function startDay(){
    if(dayStarted){ showToast('Ya hay un día iniciado', 'warning'); return; }
    currentDayKey = getTodayKey();
    dayStarted = true;
    saveDayState();
    cart = [];
    renderCart();
    resetDaySession();
    showToast(`Día iniciado: ${currentDayKey}`, 'success');
    await addDoc(collection(db, COL_BACKUPS), { dayKey: currentDayKey, tipo: 'day_start', createdAt: new Date().toISOString(), version: '1.0.0' });
    updateDayButtons();
}

async function finalizeDay(){
    if(!dayStarted){ showToast('Debes iniciar el día antes de finalizarlo', 'error'); return; }
    if(!confirm('¿Finalizar el día actual? Esto creará el backup y limpiará la sesión.')) return;
    const endedDayKey = currentDayKey;
    await saveDayBackup('final');
    clearDayState();
    resetDaySession();
    showToast(`Día finalizado: ${endedDayKey}`, 'success');
}

function resetDaySession(){
    cart = [];
    renderCart();
    ['search-venta','search-caja','filter-from','filter-to','select-backups'].forEach(id=>{
        const el = $(id); if(!el) return;
        if(el.tagName === 'INPUT' || el.tagName === 'SELECT') el.value = '';
    });
    const backupContent = $('backup-content'); if(backupContent) backupContent.innerText = '';
    const backupConsole = $('backup-console'); if(backupConsole) backupConsole.classList.add('hidden');
    renderCaja();
    renderInventory();
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
        p.codigo.toLowerCase().includes(filter) ||
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
    // Prevent duplicate items added by scans: user must confirm
    const existing = cart.find(item => item.id === product.id);
    if(existing) {
        if(existing.cantidad >= product.stock) return showToast("Stock máximo alcanzado", 'error');
        existing.cantidad++;
    } else cart.push({...product, cantidad: 1 });
    renderCart();
}

function addToCartWithQty(product, qty){
    if(product.stock <= 0) return showToast('Sin stock','error');
    const existing = cart.find(i=>i.id===product.id);
    const totalRequested = (existing? existing.cantidad : 0) + qty;
    if(totalRequested > product.stock) return showToast(`Stock insuficiente. Disponible: ${product.stock}`,'error');
    if(existing) existing.cantidad = totalRequested;
    else cart.push({...product, cantidad: qty});
    renderCart(); showToast(`${product.nombre} agregado (x${qty})`);
}

function openQuickAddModal(){ renderQuickList(''); $('modal-quick-add').classList.remove('hidden'); const q = $('quick-search'); q && q.focus(); }
function closeQuickAddModal(){ $('modal-quick-add').classList.add('hidden'); const q = $('quick-search'); if(q) { q.value = ''; } const list = $('quick-product-list'); if(list) list.innerHTML = ''; }

function renderQuickList(filter=''){
    const f = (filter||'').toLowerCase();
    const filtered = products.filter(p => p.nombre.toLowerCase().includes(f) || p.codigo.toLowerCase().includes(f));
    const container = $('quick-product-list');
    if(!container) return;
    container.innerHTML = filtered.map(p=>`<div class="quick-item"><div class="meta"><strong>${p.nombre}</strong><span class="code">${p.codigo}</span><div style="color:var(--text-light)">${formatPrice(p.precio)} · Stock: ${p.stock}</div></div><div class="actions"><button class="btn-primary" data-action="add" data-id="${p.id}">Agregar</button></div></div>`).join('') || '<div class="empty-state">No hay productos</div>';
    lucide.createIcons && lucide.createIcons();
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
            const saleCode = generateSaleCode();
            transaction.set(ventaRef, { saleCode, items: cart.map(i=>({id:i.id,nombre:i.nombre,precio:i.precio,cantidad:i.cantidad})), total: cart.reduce((a,i)=>a+i.precio*i.cantidad,0), fecha: serverTimestamp() });
        });
        showToast("Venta realizada con éxito"); cart = [];
    } catch(err) { showToast("Error en venta: " + err.message, 'error'); }
    finally { $('btn-checkout').disabled = false; setLoading(false); }
}

// --- ESCANER ---

function onScannerDetected(code, type, target){
    try{
        Scanner.stop();
        $('camera-overlay').classList.add('hidden');
        if(target === 'modal') { $('prod-code').value = code; return; }
        const product = products.find(p => p.codigo === code);
        const scanModal = $('modal-scan-confirm');
        const body = $('scan-modal-body');
        const addBtn = $('scan-modal-add');
        const createBtn = $('scan-modal-create');
        const cancelBtn = $('scan-modal-cancel');
        if(product){
            body.innerHTML = `<p><strong>${product.nombre}</strong><br>Tipo: ${type}<br>Código: ${product.codigo}<br>Precio: ${formatPrice(product.precio)}<br>Stock: ${product.stock}</p>`;
            createBtn.classList.add('hidden');
            addBtn.onclick = ()=>{ if(confirm(`Agregar ${product.nombre} al carrito? (stock: ${product.stock})`)) addToCart(product); scanModal.classList.add('hidden'); };
        } else {
            body.innerHTML = `<p>No existe producto con código <strong>${code}</strong> (tipo: ${type}).</p><p>¿Crear producto manualmente?</p>`;
            createBtn.classList.remove('hidden');
            addBtn.onclick = ()=>{ showToast('No hay producto para agregar', 'error'); };
            createBtn.onclick = ()=>{ scanModal.classList.add('hidden'); switchSection('inventario'); $('btn-add-product').click(); $('prod-code').value = code; };
        }
        cancelBtn.onclick = ()=> scanModal.classList.add('hidden');
        scanModal.classList.remove('hidden');
    }catch(err){ console.error(err); }
}

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
        await loadBackupsSelect();
    } catch(err) { showToast("Error backup: " + err.message, 'error'); }
    finally { setLoading(false); }
}

// Guarda solo la información del día actual (ventas del día + snapshot productos)
async function saveDayBackup(type='day'){
    if(type === 'day' && !dayStarted) {
        showToast('Inicia el día antes de guardar la información', 'error');
        return false;
    }
    setLoading(true);
    try{
        const [prodSnap, ventasSnap] = await Promise.all([getDocs(collection(db, COL_PROD)), getDocs(collection(db, COL_VENTAS))]);
        const today = new Date();
        const yyyy = today.getFullYear(); const mm = String(today.getMonth()+1).padStart(2,'0'); const dd = String(today.getDate()).padStart(2,'0');
        const dayKey = `${yyyy}-${mm}-${dd}`;
        const ventasAll = ventasSnap.docs.map(d=>({id:d.id,...d.data()}));
        const ventasDia = ventasAll.filter(v=>{
            const date = v.fecha && v.fecha.toDate ? v.fecha.toDate() : new Date(v.fecha);
            const y = date.getFullYear(); const m = String(date.getMonth()+1).padStart(2,'0'); const d = String(date.getDate()).padStart(2,'0');
            return `${y}-${m}-${d}` === dayKey;
        });
        const backup = {
            fechaDia: dayKey,
            createdAt: new Date().toISOString(),
            ventasDia,
            productosSnapshot: prodSnap.docs.map(d=>({id:d.id,...d.data()})),
            tipo: type,
            finalizado: type === 'final',
            version: '1.0.0'
        };
        await addDoc(collection(db, COL_BACKUPS), backup);
        const blob = new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'});
        const filename = type === 'final' ? `backup-final-${dayKey}.json` : `backup-day-${dayKey}.json`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
        showToast(type === 'final' ? 'Día finalizado y backup descargado' : 'Backup del día creado y descargado');
        await loadBackupsSelect();
        return true;
    }catch(err){ showToast('Error backup día: ' + err.message, 'error'); return false; }
    finally{ setLoading(false); }
}

async function loadBackupsSelect(){
    try{
        const snap = await getDocs(collection(db, COL_BACKUPS));
        const backups = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
            const da = new Date(b.fecha || b.createdAt || b.createdAt || b.fechaDia || 0);
            const dbt = new Date(a.fecha || a.createdAt || a.createdAt || a.fechaDia || 0);
            return da - dbt;
        });
        const sel = $('select-backups'); if(!sel) return;
        sel.innerHTML = '<option value="">-- seleccionar backup --</option>' + backups.map(b=>{
            const label = b.fecha ? new Date(b.fecha).toLocaleString() : (b.fechaDia? `${b.fechaDia} (día)` : (b.createdAt? new Date(b.createdAt).toLocaleString() : b.id));
            return `<option value="${b.id}">${label}</option>`;
        }).join('');
    }catch(err){ console.warn('No se pudieron cargar backups', err); }
}

async function viewSelectedBackup(){
    const sel = $('select-backups'); if(!sel) return showToast('Seleccione un backup', 'error');
    const id = sel.value; if(!id) return showToast('Seleccione un backup', 'error');
    try{
        const snap = await getDocs(collection(db, COL_BACKUPS));
        const docFound = snap.docs.find(d=>d.id===id);
        if(!docFound) return showToast('Backup no encontrado', 'error');
        const data = docFound.data();
        $('backup-content').innerText = JSON.stringify(data, null, 2);
        $('backup-console').classList.remove('hidden');
    }catch(err){ showToast('Error cargando backup: '+err.message, 'error'); }
}

function downloadDisplayedBackup(){
    const sel = $('select-backups'); const id = sel && sel.value;
    if(id){ window.downloadBackup(id); return; }
    const pre = $('backup-content'); if(!pre || !pre.innerText) return showToast('No hay backup cargado', 'error');
    const blob = new Blob([pre.innerText], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup-selected.json`; a.click();
}

async function renderBackupHistory() {
    const snap = await getDocs(collection(db, COL_BACKUPS));
    const backups = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=> new Date(b.fecha || b.createdAt || b.fechaDia || 0)-new Date(a.fecha || a.createdAt || a.fechaDia || 0));
    $('backup-history').innerHTML = backups.map(b=>`
        <div class="backup-item card">
            <div><strong>${b.fecha? new Date(b.fecha).toLocaleString() : (b.fechaDia? b.fechaDia : (b.createdAt? new Date(b.createdAt).toLocaleString() : b.id))}</strong> - ${b.tipo}</div>
            <div>Productos: ${b.productos?.length || b.productosSnapshot?.length || 0} | Ventas: ${b.ventas?.length || b.ventasDia?.length || 0}</div>
            <button onclick='window.downloadBackup("${b.id}")'>Descargar</button>
        </div>`).join('') || '<div class="empty-state">No hay backups</div>';
    await loadBackupsSelect();
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
            if(!confirm(`¿Restaurar ${backup.productos.length || backup.productosSnapshot?.length || 0} productos y ${backup.ventas.length || backup.ventasDia?.length || 0} ventas? Esto sobreescribirá datos.`)) return;
            setLoading(true);
            showToast("Restauración manual desde JSON. Implementar con batch si querés.", 'error');
        } catch(err) { showToast("Archivo inválido", 'error'); }
        finally { setLoading(false); }
    };
    reader.readAsText(file);
}

// --- CAJA / VENTAS LISTADO Y RESUMEN ---
function formatDateTime(d){ if(!d) return '-'; try{ return d.toLocaleString(); }catch(e){ return new Date(d).toLocaleString(); } }

async function renderCaja(){
    setLoading(true);
    try{
        // use onSnapshot for live updates
        if(unsubscribeVentas) unsubscribeVentas();
        unsubscribeVentas = onSnapshot(collection(db, COL_VENTAS), snap => {
            const ventas = snap.docs.map(d=>({ id: d.id, ...d.data()})).sort((a,b)=>{ const da = a.fecha && a.fecha.toDate ? a.fecha.toDate() : new Date(a.fecha); const dbt = b.fecha && b.fecha.toDate ? b.fecha.toDate() : new Date(b.fecha); return dbt - da; });
            lastVentasCache = ventas;
            renderCajaData(ventas);
        }, err => { showToast('Error cargando ventas: '+err.message,'error'); });
    }catch(err){ showToast('Error: '+err.message,'error'); }
    finally{ setLoading(false); }
}

// renderCajaData is implemented in sales.js and imported at top of this file