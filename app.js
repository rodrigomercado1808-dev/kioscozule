import { db } from './firebase.js';
import { 
    collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, increment, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- ESTADO DE LA APP ---
let products = [];
let cart = [];
let currentSection = 'ventas';
const STOCK_MINIMO = 5;

// --- ELEMENTOS DOM ---
const elements = {
    btnVentas: document.getElementById('btn-ventas'),
    btnInventario: document.getElementById('btn-inventario'),
    sectionVentas: document.getElementById('section-ventas'),
    sectionInventario: document.getElementById('section-inventario'),
    searchVenta: document.getElementById('search-venta'),
    searchInventario: document.getElementById('search-inventario'),
    inventoryList: document.getElementById('inventory-list'),
    cartItems: document.getElementById('cart-items'),
    cartTotal: document.getElementById('cart-total'),
    btnCheckout: document.getElementById('btn-checkout'),
    btnClearCart: document.getElementById('btn-clear-cart'),
    btnScanVenta: document.getElementById('btn-scan-venta'),
    btnAddProduct: document.getElementById('btn-add-product'),
    modalProduct: document.getElementById('modal-product'),
    formProduct: document.getElementById('form-product'),
    btnCancel: document.getElementById('btn-cancel'),
    cameraOverlay: document.getElementById('camera-overlay'),
    btnCloseCamera: document.getElementById('btn-close-camera'),
    btnScanModal: document.getElementById('btn-scan-modal')
};

// --- INICIALIZACIÓN ---
const init = () => {
    onSnapshot(collection(db, "productos"), (snapshot) => {
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventory();
    });
    setupEventListeners();
};

// --- NAVEGACIÓN ---
const switchSection = (section) => {
    currentSection = section;
    elements.btnVentas.classList.toggle('active', section === 'ventas');
    elements.btnInventario.classList.toggle('active', section === 'inventario');
    elements.sectionVentas.classList.toggle('hidden', section !== 'ventas');
    elements.sectionInventario.classList.toggle('hidden', section !== 'inventario');
};

// --- LÓGICA DE INVENTARIO (CRUD) ---
const renderInventory = () => {
    const filter = elements.searchInventario.value.toLowerCase();
    const filtered = products.filter(p => 
        p.nombre.toLowerCase().includes(filter) || 
        p.codigo.includes(filter) || 
        p.precio.toString().includes(filter)
    );

    elements.inventoryList.innerHTML = filtered.map(p => `
        <div class="prod-card ${p.stock <= STOCK_MINIMO ? 'low-stock' : ''}">
            <h3>${p.nombre}</h3>
            <p class="code">${p.codigo}</p>
            <p class="price">$${parseFloat(p.precio).toFixed(2)}</p>
            <p class="stock ${p.stock <= STOCK_MINIMO ? 'alert' : ''}">
                Stock: ${p.stock} ${p.stock <= STOCK_MINIMO ? '(Bajo)' : ''}
            </p>
            <div class="prod-actions">
                <button class="btn-icon" onclick="window.editProduct('${p.id}')">
                    <i data-lucide="edit-2"></i>
                </button>
                <button class="btn-icon" onclick="window.deleteProduct('${p.id}')">
                    <i data-lucide="trash-2" style="color: var(--danger)"></i>
                </button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
};

const saveProduct = async (e) => {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;
    const data = {
        codigo: document.getElementById('prod-code').value,
        nombre: document.getElementById('prod-name').value,
        precio: parseFloat(document.getElementById('prod-price').value),
        stock: parseInt(document.getElementById('prod-stock').value)
    };

    try {
        if (id) {
            await updateDoc(doc(db, "productos", id), data);
        } else {
            await addDoc(collection(db, "productos"), data);
        }
        closeModal();
    } catch (err) {
        alert("Error al guardar: " + err.message);
    }
};

window.editProduct = (id) => {
    const p = products.find(prod => prod.id === id);
    if (!p) return;
    document.getElementById('modal-title').innerText = "Editar Producto";
    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-code').value = p.codigo;
    document.getElementById('prod-name').value = p.nombre;
    document.getElementById('prod-price').value = p.precio;
    document.getElementById('prod-stock').value = p.stock;
    elements.modalProduct.classList.remove('hidden');
};

window.deleteProduct = async (id) => {
    if (confirm("¿Eliminar este producto?")) {
        await deleteDoc(doc(db, "productos", id));
    }
};

const closeModal = () => {
    elements.modalProduct.classList.add('hidden');
    elements.formProduct.reset();
    document.getElementById('prod-id').value = "";
};

// --- LÓGICA DE VENTAS ---
const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
        if (existing.cantidad < product.stock) {
            existing.cantidad++;
        } else {
            alert("No hay más stock disponible");
        }
    } else {
        if (product.stock > 0) {
            cart.push({ ...product, cantidad: 1 });
        } else {
            alert("Producto sin stock");
        }
    }
    renderCart();
};

window.updateCartQty = (id, delta) => {
    const item = cart.find(i => i.id === id);
    const prod = products.find(p => p.id === id);
    if (!item || !prod) return;

    if (delta > 0 && item.cantidad >= prod.stock) {
        alert("Stock máximo alcanzado");
        return;
    }

    item.cantidad += delta;
    if (item.cantidad <= 0) {
        cart = cart.filter(i => i.id !== id);
    }
    renderCart();
};

const renderCart = () => {
    if (cart.length === 0) {
        elements.cartItems.innerHTML = '<div class="empty-state">Carrito vacío</div>';
        elements.cartTotal.innerText = '$0.00';
        elements.btnCheckout.disabled = true;
        return;
    }

    let total = 0;
    elements.cartItems.innerHTML = cart.map(item => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h4>${item.nombre}</h4>
                    <p>$${item.precio.toFixed(2)} x ${item.cantidad}</p>
                </div>
                <div class="cart-item-actions">
                    <button class="qty-btn" onclick="window.updateCartQty('${item.id}', -1)">-</button>
                    <span>${item.cantidad}</span>
                    <button class="qty-btn" onclick="window.updateCartQty('${item.id}', 1)">+</button>
                    <span style="font-weight:700; min-width:60px; text-align:right">$${subtotal.toFixed(2)}</span>
                </div>
            </div>
        `;
    }).join('');

    elements.cartTotal.innerText = `$${total.toFixed(2)}`;
    elements.btnCheckout.disabled = false;
};

const checkout = async () => {
    if (!confirm("¿Confirmar venta?")) return;
    elements.btnCheckout.disabled = true;
    elements.btnCheckout.innerText = "Procesando...";

    try {
        const venta = {
            items: cart,
            total: cart.reduce((acc, item) => acc + (item.precio * item.cantidad), 0),
            fecha: serverTimestamp()
        };
        await addDoc(collection(db, "ventas"), venta);

        for (const item of cart) {
            const prodRef = doc(db, "productos", item.id);
            await updateDoc(prodRef, { stock: increment(-item.cantidad) });
        }

        alert("Venta realizada con éxito");
        cart = [];
        renderCart();
    } catch (err) {
        alert("Error en la venta: " + err.message);
    } finally {
        elements.btnCheckout.disabled = false;
        elements.btnCheckout.innerText = "Confirmar Venta";
    }
};

// --- ESCÁNER ---
let scanTarget = 'venta';
const startScanner = (target) => {
    scanTarget = target;
    elements.cameraOverlay.classList.remove('hidden');
    Quagga.init({
        inputStream: { name: "Live", type: "LiveStream", target: document.querySelector('#interactive'), constraints: { facingMode: "environment" } },
        decoder: { readers: ["ean_reader", "code_128_reader", "upc_reader"] }
    }, (err) => {
        if (err) return;
        Quagga.start();
    });
};

Quagga.onDetected((data) => {
    const code = data.codeResult.code;
    Quagga.stop();
    elements.cameraOverlay.classList.add('hidden');
    if (scanTarget === 'modal') {
        document.getElementById('prod-code').value = code;
    } else {
        const product = products.find(p => p.codigo === code);
        if (product) addToCart(product);
        else if (confirm("No existe. ¿Crear?")) {
            switchSection('inventario');
            elements.btnAddProduct.click();
            document.getElementById('prod-code').value = code;
        }
    }
});

// --- EVENTOS ---
const setupEventListeners = () => {
    elements.btnVentas.onclick = () => switchSection('ventas');
    elements.btnInventario.onclick = () => switchSection('inventario');
    elements.searchInventario.oninput = renderInventory;
    elements.searchVenta.oninput = () => {
        const code = elements.searchVenta.value;
        const product = products.find(p => p.codigo === code);
        if (product) {
            addToCart(product);
            elements.searchVenta.value = '';
        }
    };
    elements.btnAddProduct.onclick = () => {
        document.getElementById('modal-title').innerText = "Nuevo Producto";
        elements.modalProduct.classList.remove('hidden');
    };
    elements.btnCancel.onclick = closeModal;
    elements.formProduct.onsubmit = saveProduct;
    elements.btnClearCart.onclick = () => { cart = []; renderCart(); };
    elements.btnCheckout.onclick = checkout;
    elements.btnScanVenta.onclick = () => startScanner('venta');
    elements.btnScanModal.onclick = () => startScanner('modal');
    elements.btnCloseCamera.onclick = () => { Quagga.stop(); elements.cameraOverlay.classList.add('hidden'); };
};

init();