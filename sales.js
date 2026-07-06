import { formatPrice, $ , showToast } from './utils.js';

export function generateSaleCode(){
    const d = new Date();
    const pad = (n, size=2)=> String(n).padStart(size,'0');
    const date = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const rand = Math.floor(Math.random()*900 + 100); // 3 digits
    return `V-${date}-${time}-${rand}`;
}

function parseFecha(fecha){
    if(!fecha) return null;
    if(typeof fecha.toDate === 'function') return fecha.toDate();
    return new Date(fecha);
}

export function renderCajaData(ventas){
    const now = new Date();
    let totalHoy=0, totalSemana=0, totalMes=0;
    const listEl = $('caja-list'); if(!listEl) return;
    const q = $('search-caja')?.value?.toLowerCase()?.trim();
    const from = $('filter-from')?.value ? new Date($('filter-from').value) : null;
    const to = $('filter-to')?.value ? new Date($('filter-to').value) : null;
    const sort = $('filter-sort')?.value || 'date_desc';
    const filtered = ventas.filter(v=>{
        if(!v) return false;
        if(from || to){
            const fecha = parseFecha(v.fecha) || new Date();
            if(from && fecha < from) return false;
            if(to){ const toDate = new Date(to); toDate.setHours(23,59,59,999); if(fecha > toDate) return false; }
        }
        if(!q) return true;
        if((v.saleCode||'').toLowerCase().includes(q)) return true;
        if(v.items && v.items.some(it=> (it.nombre||'').toLowerCase().includes(q) || (it.id||'').toLowerCase().includes(q))) return true;
        const sdate = parseFecha(v.fecha); if(sdate && sdate.toLocaleString().toLowerCase().includes(q)) return true;
        return false;
    });
    // compute totals while mapping
    const mapped = filtered.map(v=>{
        const date = parseFecha(v.fecha) || new Date();
        const total = v.total || (v.items? v.items.reduce((a,i)=>a + (i.precio||0)*(i.cantidad||1),0):0);
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        if(date >= startOfToday) totalHoy += total;
        if(date >= startOfWeek) totalSemana += total;
        if(date >= startOfMonth) totalMes += total;
        return { ...v, _dateObj: date, _total: total };
    });
    // sorting
    mapped.sort((a,b)=>{
        if(sort === 'date_desc') return b._dateObj - a._dateObj;
        if(sort === 'date_asc') return a._dateObj - b._dateObj;
        if(sort === 'total_desc') return b._total - a._total;
        if(sort === 'total_asc') return a._total - b._total;
        if(sort === 'code_asc') return (a.saleCode||'').localeCompare(b.saleCode||'');
        return b._dateObj - a._dateObj;
    });
    const itemsHtml = mapped.map(v=>renderSaleCard(v)).join('') || '<div class="empty-state">No hay ventas</div>';
    listEl.innerHTML = itemsHtml;
    // attach expand toggles
    listEl.querySelectorAll('.sale-toggle').forEach(btn => {
        btn.onclick = (ev)=>{
            const card = btn.closest('.sale-card'); if(!card) return;
            card.classList.toggle('expanded');
        };
    });
    $('fact-hoy').innerText = formatPrice(totalHoy);
    $('fact-semana').innerText = formatPrice(totalSemana);
    $('fact-mes').innerText = formatPrice(totalMes);
}

function renderSaleCard(v){
    const fechaStr = v._dateObj ? v._dateObj.toLocaleString() : '-';
    const itemsHtml = (v.items||[]).map(it=>`<div class="sale-item"><div class="si-left"><strong>${escapeHtml(it.nombre)}</strong><div class="code">${escapeHtml(it.id)}</div></div><div class="si-right">${it.cantidad} × ${formatPrice(it.precio)}</div></div>`).join('');
    return `
    <div class="sale-card card">
        <div class="sale-header">
            <div>
                <div class="sale-code">${escapeHtml(v.saleCode || v.id)}</div>
                <div class="sale-date">${escapeHtml(fechaStr)}</div>
            </div>
            <div class="sale-total">${formatPrice(v._total)}</div>
        </div>
        <div class="sale-body">
            ${itemsHtml}
        </div>
        <div class="sale-actions">
            <button class="btn-secondary sale-toggle">Detalles</button>
        </div>
    </div>`;
}

function escapeHtml(str){ return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
