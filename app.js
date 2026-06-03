let supabaseClient = null;

// --- 1. INICIALIZACIÓN AUTOMÁTICA ---
document.addEventListener("DOMContentLoaded", () => {
    // Configurar menú retráctil
    const btnMenu = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');

    if (btnMenu && sidebar) {
        btnMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
            btnMenu.textContent = sidebar.classList.contains('active') ? '✕ Cerrar' : '☰ Opciones';
        });
    }

    // Auto-conectar sin intervención del usuario
    const url = document.getElementById("db-url").value;
    const key = document.getElementById("db-key").value;
    
    if (url && key) {
        iniciarConexion(url, key);
    }
});

// --- 2. LÓGICA DE CONEXIÓN ---
document.getElementById("btn-conectar").addEventListener("click", () => {
    const url = document.getElementById("db-url").value.trim();
    const key = document.getElementById("db-key").value.trim();
    iniciarConexion(url, key);
});

function iniciarConexion(url, key) {
    const statusBadge = document.getElementById("conn-status");
    try {
        supabaseClient = supabase.createClient(url, key);
        statusBadge.innerText = "Conectado en Vivo";
        statusBadge.className = "status-badge status-connected";
        conectarEcosistema();
    } catch (error) {
        console.error("Error:", error);
    }
}

// --- 3. ECOSISTEMA Y TIEMPO REAL ---
async function conectarEcosistema() {
    if (!supabaseClient) return;

    if (Notification.permission !== "denied") Notification.requestPermission();
    
    await Promise.all([cargarInventario(), cargarCitas()]);

    supabaseClient
        .channel('dashboard-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'citas' }, async (p) => {
            if (Notification.permission === "granted") {
                new Notification("¡Nueva Cita! 🏎️", { body: `${p.new.nombre_cliente} quiere ver el ${p.new.auto_interes}` });
            }
            await cargarCitas();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cars' }, async () => {
            await cargarInventario();
        })
        .subscribe();
}

// --- 4. RENDERIZADO DE DATOS ---
async function cargarInventario() {
    const { data: autos } = await supabaseClient.from('cars').select('*');
    const cont = document.getElementById("contenedor-autos");
    document.getElementById("total-autos").innerText = autos ? autos.length : 0;
    
    cont.innerHTML = autos?.length > 0 ? autos.map(a => `
        <div class="auto-block">
            <div>
                <h4>${a.brand || ''} ${a.model || 'Sin Modelo'}</h4>
                <div class="auto-price">$${Number(a.price || 0).toLocaleString('es-MX')} MXN</div>
            </div>
            <span class="auto-status-badge">${a.status || 'Disponible'}</span>
        </div>
    `).join('') : `<p class="empty-state">No hay unidades.</p>`;
}

async function cargarCitas() {
    const { data: citas } = await supabaseClient.from('citas').select('*');
    const cont = document.getElementById("contenedor-citas");
    
    cont.innerHTML = citas?.length > 0 ? citas.map(c => `
        <div class="cita-block">
            <div class="cita-main">
                <h4>Prueba de Manejo: ${c.auto_interes}</h4>
                <p>Cliente: ${c.nombre_cliente}</p>
                <span class="cita-tag">⏰ ${c.fecha_hora_cita || 'N/A'}</span>
            </div>
            <span class="cita-status-live">Confirmada</span>
        </div>
    `).join('') : `<p class="empty-state">No hay citas agendadas.</p>`;
}