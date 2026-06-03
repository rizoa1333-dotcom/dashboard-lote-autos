const SUPABASE_URL = "https://deljncdcddfghfihuumd.supabase.co";
const SUPABASE_KEY = "sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener("DOMContentLoaded", async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = "/index.html";
        return;
    }
    document.getElementById('user-email').innerText = session.user.email;

    cargarInventario();
    cargarCitas();
    escucharTiempoReal();
    configurarMenuMovil();
});

// --- ENRUTADOR INTERNO SPA (TABS) ---
window.cambiarVista = (idVista, idTab) => {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active-view'));
    document.querySelectorAll('.btn-tab').forEach(t => t.classList.remove('active-tab'));
    
    document.getElementById(idVista).classList.add('active-view');
    document.getElementById(idTab).classList.add('active-tab');

    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 900) {
        sidebar.classList.remove('active');
        document.getElementById('mobile-menu-btn').textContent = '☰ Menú';
    }
};

// --- CONFIGURACIÓN TÁCTIL Y DESLIZAMIENTO (SWIPE) ---
function configurarMenuMovil() {
    const btnMenu = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');

    if (btnMenu) {
        btnMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
            btnMenu.textContent = sidebar.classList.contains('active') ? '✕ Cerrar' : '☰ Menú';
        });
    }

    let touchstartX = 0;
    let touchendX = 0;

    document.addEventListener('touchstart', e => {
        touchstartX = e.changedTouches[0].screenX;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        touchendX = e.changedTouches[0].screenX;
        // Swipe Derecha: Abrir desde el borde izquierdo
        if (touchendX > touchstartX + 65 && touchstartX < 50) {
            sidebar.classList.add('active');
            if (btnMenu) btnMenu.textContent = '✕ Cerrar';
        }
        // Swipe Izquierda: Ocultar panel
        if (touchendX < touchstartX - 65) {
            sidebar.classList.remove('active');
            if (btnMenu) btnMenu.textContent = '☰ Menú';
        }
    }, { passive: true });

    const btnAlertas = document.getElementById('btn-alertas');
    if (btnAlertas && Notification.permission === 'granted') btnAlertas.style.display = 'none';
    if (btnAlertas) {
        btnAlertas.addEventListener('click', async () => {
            const res = await Notification.requestPermission();
            if (res === 'granted') btnAlertas.style.display = 'none';
        });
    }
}

// --- LOGOUT ---
document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "/index.html";
});

// --- CRUD: INSERTAR VEHÍCULO ---
document.getElementById('form-nuevo-auto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const brand = document.getElementById('auto-marca').value.trim();
    const model = document.getElementById('auto-modelo').value.trim();
    const year = document.getElementById('auto-ano').value;
    const price = document.getElementById('auto-precio').value;
    const url = document.getElementById('auto-foto').value.trim();

    const { error } = await supabaseClient.from('cars').insert([{ brand, model, year, price, status: 'Disponible', image_url: url }]);

    if (!error) {
        document.getElementById('form-nuevo-auto').reset();
        document.getElementById('form-nuevo-auto').style.display = 'none';
        cargarInventario();
    }
});

// --- CRUD: ACTUALIZAR ESTADO A VENDIDO ---
window.marcarVendido = async (id) => {
    if (confirm("¿Confirmar venta de la unidad?")) {
        const { error } = await supabaseClient.from('cars').update({ status: 'Vendido' }).eq('id', id);
        if (!error) cargarInventario();
    }
};

// --- CRM: ACTUALIZAR SEGUIMIENTO DE CITAS ---
window.cambiarEstadoCita = async (id, estado_lead) => {
    const { error } = await supabaseClient.from('citas').update({ estado_lead }).eq('id', id);
    if (!error) cargarCitas();
};

// --- CRUD: LEER INVENTARIO + CÁLCULO DE KPIs ---
async function cargarInventario() {
    const { data: autos } = await supabaseClient.from('cars').select('*').order('status', { ascending: true });
    const cont = document.getElementById("contenedor-autos");
    document.getElementById("total-autos").innerText = autos ? autos.length : 0;

    let disponibles = 0, valorTotal = 0, vendidos = 0;

    cont.innerHTML = autos?.length > 0 ? autos.map(a => {
        if (a.status === 'Disponible') { disponibles++; valorTotal += Number(a.price || 0); }
        else if (a.status === 'Vendido') { vendidos++; }

        return `
            <div class="auto-block" style="${a.status === 'Vendido' ? 'opacity: 0.4;' : ''}">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center;">
                        <h4>${a.brand} ${a.model}</h4>
                        <span style="font-size:11px; margin-left:8px; background:var(--bg-main); padding:2px 6px; border-radius:4px; font-weight:600;">${a.year}</span>
                    </div>
                    <div class="auto-price">$${Number(a.price).toLocaleString('es-MX')} MXN</div>
                    ${a.image_url ? `<a href="${a.image_url}" target="_blank" style="display:inline-block; margin-top:4px; font-size:11px; color:var(--text-pure); text-decoration:underline;">Ver Fotos</a>` : ''}
                    <div style="margin-top:6px;"><span class="auto-status-badge">${a.status}</span></div>
                </div>
                ${a.status !== 'Vendido' ? `<button onclick="marcarVendido('${a.id}')" class="btn-primary" style="background:transparent; color:var(--text-pure); border:1px solid var(--border-color); padding:6px 12px; font-size:11px;">Vendido</button>` : ''}
            </div>
        `;
    }).join('') : `<p class="empty-state">No hay registros.</p>`;

    document.getElementById('kpi-disponibles').innerText = disponibles;
    document.getElementById('kpi-valor').innerText = `$${valorTotal.toLocaleString('es-MX')} MXN`;
    document.getElementById('kpi-vendidos').innerText = vendidos;
}

// --- LEER CITAS + BOTÓN DIRECTO DE WHATSAPP ---
async function cargarCitas() {
    const { data: citas } = await supabaseClient.from('citas').select('*').order('id', { ascending: false });
    const cont = document.getElementById("contenedor-citas");

    cont.innerHTML = citas?.length > 0 ? citas.map(c => {
        const rawTel = c.telefono_cliente || c.telefono || '';
        const cleanTel = rawTel.replace(/\D/g, '');
        const estado = c.estado_lead || 'Nuevo Lead';

        return `
            <div class="cita-block">
                <div style="flex:1;">
                    <h4>Vehículo: ${c.auto_interes}</h4>
                    <p>👤 Cliente: ${c.nombre_cliente}</p>
                    <span class="cita-tag">⏰ Agenda: ${c.fecha_hora_cita || 'En proceso por la IA'}</span>
                    <div class="crm-actions">
                        ${cleanTel ? `<a href="https://wa.me/${cleanTel}" target="_blank" class="btn-whatsapp">💬 WhatsApp</a>` : ''}
                        <select onchange="cambiarEstadoCita('${c.id}', this.value)" class="select-crm">
                            <option value="Nuevo Lead" ${estado === 'Nuevo Lead' ? 'selected' : ''}>Nuevo Lead</option>
                            <option value="Contactado" ${estado === 'Contactado' ? 'selected' : ''}>Contactado</option>
                            <option value="Prueba de Manejo" ${estado === 'Prueba de Manejo' ? 'selected' : ''}>Prueba de Manejo</option>
                            <option value="En Negociación" ${estado === 'En Negociación' ? 'selected' : ''}>En Negociación</option>
                            <option value="Vendido" ${estado === 'Vendido' ? 'selected' : ''}>Vendido</option>
                            <option value="Perdido" ${estado === 'Perdido' ? 'selected' : ''}>Perdido</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }).join('') : `<p class="empty-state">No hay prospectos registrados.</p>`;
}

function escucharTiempoReal() {
    supabaseClient.channel('dashboard-realtime').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'citas' }, async (p) => {
        if (Notification.permission === "granted") {
            new Notification("¡Cita Agendada por la IA! 🏎️", { body: `${p.new.nombre_cliente} - ${p.new.auto_interes}` });
        }
        await cargarCitas();
    }).subscribe();
}