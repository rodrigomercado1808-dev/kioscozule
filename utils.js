// Utilities module: DOM helpers, toasts, debounce and common formatters
export const $ = id => document.getElementById(id);

export const showToast = (msg, type='success') => {
    const container = $('toast-container');
    if(!container) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerText = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 4000);
};

export const setLoading = (state) => { const l = $('loader'); if(l) l.classList.toggle('hidden',!state); };

export const debounce = (fn, delay) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); }; };

export const formatPrice = n => `$${parseFloat(n || 0).toFixed(2)}`;
