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
    $('btn-scan-venta').onclick = () => startScanner('venta');
    $('btn-scan-modal').onclick = () => startScanner('modal');
    $('btn-close-camera').onclick = stopScanner;
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
        if(target === 'modal') {
            // fill code but require user to press guardar
            $('prod-code').value = code;
        } else {
            const product = products.find(p => p.codigo === code);
            // Show scan confirmation modal to avoid automatic actions
            const scanModal = $('modal-scan-confirm');
            const body = $('scan-modal-body');
            const addBtn = $('scan-modal-add');
            const createBtn = $('scan-modal-create');
            const cancelBtn = $('scan-modal-cancel');
            if(product) {
                body.innerHTML = `<p><strong>${product.nombre}</strong><br>Código: ${product.codigo}<br>Precio: ${formatPrice(product.precio)}<br>Stock: ${product.stock}</p>`;
                createBtn.classList.add('hidden');
                addBtn.onclick = ()=>{ if(confirm(`Confirmar agregar ${product.nombre}?`)) addToCart(product); scanModal.classList.add('hidden'); };
            } else {
                body.innerHTML = `<p>No existe producto con código <strong>${code}</strong>.</p><p>¿Deseas crear uno manualmente?</p>`;
                createBtn.classList.remove('hidden');
                addBtn.onclick = ()=>{ showToast('No hay producto para agregar', 'error'); };
                createBtn.onclick = ()=>{ scanModal.classList.add('hidden'); switchSection('inventario'); $('btn-add-product').click(); $('prod-code').value = code; };
            }
            cancelBtn.onclick = ()=> scanModal.classList.add('hidden');
            scanModal.classList.remove('hidden');
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