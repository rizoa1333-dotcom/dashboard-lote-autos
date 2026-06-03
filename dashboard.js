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

// --- NUEVA FUNCIÓN CRM: ACTUALIZAR ESTADO DEL PROSPECTO DESDE EL SELECTOR ---
window.cambiarEstadoProspecto = async (id, status) => {
    const { error } = await supabaseClient.from('leads').update({ status }).eq('id', id);
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

// --- LEER PROSPECTOS (TABLA LEADS) + INTEGRACIÓN DE DATOS FINANCIEROS EN VIVO ---
async function cargarCitas() {
    const { data: leads, error } = await supabaseClient.from('leads').select('*').order('created_at', { ascending: false });
    const cont = document.getElementById("contenedor-citas");

    if (error) {
        console.error("Error cargando prospectos:", error);
        if (cont) cont.innerHTML = `<p class="empty-state" style="color:var(--danger);">Error al conectar con la base de datos.</p>`;
        return;
    }

    if (!cont) return;

    cont.innerHTML = leads?.length > 0 ? leads.map(l => {
        const rawTel = l.phone_number || '';
        const cleanTel = rawTel.replace(/\D/g, '');
        const estado = l.status || 'nuevo';
        const esPerfilado = estado === 'perfilado';

        // Definición de colores para las etiquetas de estatus
        const badgeColor = esPerfilado 
            ? 'background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff;' 
            : 'background: #fef3c7; color: #92400e; border: 1px solid #fde68a;';

        const txtEnganche = l.enganche ? `$${Number(l.enganche).toLocaleString('es-MX')} MXN` : 'Sin rellenar formulario';
        const txtTrabajo = l.situacion_laboral || 'Pendiente';

        return `
            <div class="cita-block" style="display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border-color); padding: 16px; border-radius: 8px; background: #FFF; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="flex:1; width: 100%;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px; gap: 8px;">
                        <h4 style="margin: 0; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-w-[70%];" title="${l.nombre || 'Prospecto'}">
                            ${l.nombre || 'Prospecto de WhatsApp'}
                        </h4>
                        <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 9999px; ${badgeColor} white-space: nowrap;">
                            ${estado}
                        </span>
                    </div>
                    
                    <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px; font-weight: 500;">📱 Teléfono: ${l.phone_number}</p>
                    
                    <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; font-size: 11px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">🚙 Interés:</span><span style="font-weight: 700; color: var(--text-pure);">${l.auto_interes || 'No definido'}</span></div>
                        <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">💰 Enganche:</span><span style="font-weight: 700; color: ${l.enganche ? '#6b21a8' : 'inherit'};">${txtEnganche}</span></div>
                        <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">💼 Situación:</span><span style="font-weight: 600; color: var(--text-pure);">${txtTrabajo}</span></div>
                    </div>
                </div>

                <div class="crm-actions" style="margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; pt: 4px;">
                    ${cleanTel ? `<a href="https://wa.me/${cleanTel}" target="_blank" class="btn-whatsapp" style="font-size: 11px; padding: 6px 12px; text-decoration: none; text-align: center; flex: 1;">💬 WhatsApp</a>` : ''}
                    <select onchange="cambiarEstadoProspecto('${l.id}', this.value)" class="select-crm" style="font-size: 11px; padding: 5px; border-radius: 4px; border: 1px solid var(--border-color); background: #FFF; flex: 1; cursor: pointer;">
                        <option value="nuevo" ${estado === 'nuevo' ? 'selected' : ''}>Nuevo Lead</option>
                        <option value="perfilado" ${estado === 'perfilado' ? 'selected' : ''}>Perfilado</option>
                        <option value="en_negociacion" ${estado === 'en_negociacion' ? 'selected' : ''}>En Negociación</option>
                        <option value="vendido" ${estado === 'vendido' ? 'selected' : ''}>Vendido</option>
                    </select>
                </div>
            </div>
        `;
    }).join('') : `<p class="empty-state">No hay prospectos perfilados registrados.</p>`;
}

// --- ESCUCHA TIEMPO REAL DESDE SUPABASE ---
function escucharTiempoReal() {
    // Sincronización en vivo ante cualquier inserción, actualización o borrado en la tabla 'leads'
    supabaseClient.channel('leads-realtime-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, async (payload) => {
        // Disparar una notificación de escritorio nativa si entra un nuevo lead perfilado
        if (payload.eventType === 'INSERT' && Notification.permission === "granted") {
            new Notification("¡Nuevo Prospecto en el Ecosistema! 🏎️", { 
                body: `${payload.new.nombre || 'Cliente Nuevo'} interesado en un ${payload.new.auto_interes || 'Vehículo'}` 
            });
        }
        await cargarCitas();
    }).subscribe();
}