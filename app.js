let supabaseClient = null;

// --- LÓGICA DEL MENÚ RETRÁCTIL (DRAWER) ---
const btnMenu = document.getElementById('mobile-menu-btn');
const sidebar = document.getElementById('sidebar');

if (btnMenu) {
    btnMenu.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        btnMenu.textContent = sidebar.classList.contains('active') ? '✕ Cerrar' : '☰ Opciones';
    });
}

// --- CONEXIÓN SUPABASE ---
document.getElementById("btn-conectar").addEventListener("click", () => {
    const url = document.getElementById("db-url").value.trim();
    const key = document.getElementById("db-key").value.trim();
    const statusBadge = document.getElementById("conn-status");

    if (!url || !key) {
        alert("Por favor introduce una URL y una Anon Key válidas.");
        return;
    }

    try {
        supabaseClient = supabase.createClient(url, key);
        statusBadge.innerText = "Conectado en Vivo";
        statusBadge.className = "status-badge status-connected";
        conectarEcosistema();
    } catch (error) {
        console.error(error);
        statusBadge.innerText = "Error de Conexión";
        statusBadge.className = "status-badge status-disconnected";
    }
});

// --- LÓGICA DE TIEMPO REAL Y NOTIFICACIONES ---
async function conectarEcosistema() {
    if (!supabaseClient) return;

    // Pedir permiso para notificaciones una sola vez
    if (Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    await Promise.all([cargarInventario(), cargarCitas()]);

    supabaseClient
        .channel('dashboard-realtime')
        // Alerta solo cuando entra una cita NUEVA (INSERT)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'citas' }, async (payload) => {
            console.log("⚡ Nueva cita detectada!");
            if (Notification.permission === "granted") {
                new Notification("¡Nueva Cita Agendada! 🏎️", {
                    body: `${payload.new.nombre_cliente} quiere ver el ${payload.new.auto_interes}`,
                    icon: 'https://cdn-icons-png.flaticon.com/512/3062/3062634.png'
                });
            }
            await cargarCitas();
        })
        // Actualización general para cambios
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cars' }, async () => {
            await cargarInventario();
        })
        .subscribe();
}

// --- CARGA DE DATOS ---
async function cargarInventario() {
    const { data: autos, error } = await supabaseClient.from('cars').select('*');
    const contenedor = document.getElementById("contenedor-autos");
    if (error || !autos) return;

    document.getElementById("total-autos").innerText = autos.length;
    contenedor.innerHTML = autos.length > 0 ? autos.map(auto => `
        <div class="auto-block">
            <div>
                <div style="display:flex; align-items:center;">
                    <h4>${auto.brand || ''} ${auto.model || 'Sin Modelo'}</h4>
                    <span>${auto.year || 'N/A'}</span>
                </div>
                <div class="auto-price">$${auto.price ? Number(auto.price).toLocaleString('es-MX') : '0'} MXN</div>
            </div>
            <span class="auto-status-badge">${auto.status || 'Disponible'}</span>
        </div>
    `).join('') : `<p class="empty-state">No hay unidades registradas.</p>`;
}

async function cargarCitas() {
    const { data: citas, error } = await supabaseClient.from('citas').select('*');
    const contenedor = document.getElementById("contenedor-citas");
    if (error || !citas) return;

    contenedor.innerHTML = citas.length > 0 ? citas.map(cita => `
        <div class="cita-block">
            <div class="cita-main">
                <h4>Prueba de Manejo: ${cita.auto_interes || 'Unidad'}</h4>
                <p>Cliente: ${cita.nombre_cliente || 'Anónimo'}</p>
                <span class="cita-tag">⏰ ${cita.fecha_hora_cita || 'Por confirmar'}</span>
            </div>
            <span class="cita-status-live">Confirmada</span>
        </div>
    `).join('') : `<p class="empty-state">No hay citas agendadas.</p>`;
}