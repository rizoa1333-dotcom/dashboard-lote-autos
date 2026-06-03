let supabaseClient = null;

// Inicializador del botón de conectar
document.getElementById("btn-conectar").addEventListener("click", () => {
    const url = document.getElementById("db-url").value.trim();
    const key = document.getElementById("db-key").value.trim();
    const statusBadge = document.getElementById("conn-status");

    if (!url || !key) {
        alert("Por favor introduce una URL y una Anon Key válidas.");
        return;
    }

    try {
        // Inicializar cliente dinámicamente
        supabaseClient = supabase.createClient(url, key);
        
        // Cambiar interfaz a conectado
        statusBadge.innerText = "Conectado en Vivo";
        statusBadge.className = "status-badge status-connected";
        
        // Cargar los datos y activar el Realtime
        conectarEcosistema();
    } catch (error) {
        console.error(error);
        statusBadge.innerText = "Error de Conexión";
        statusBadge.className = "status-badge status-disconnected";
    }
});

// Arrancar las consultas y suscripciones en tiempo real
async function conectarEcosistema() {
    if (!supabaseClient) return;

    // Carga inicial
    await Promise.all([
        cargarInventario(),
        cargarCitas()
    ]);

    // Suscribirse en tiempo real a tus dos tablas
    supabaseClient
        .channel('dashboard-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, async () => {
            console.log("⚡ Cambio en citas!");
            await cargarCitas();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cars' }, async () => {
            console.log("⚡ Cambio en inventario!");
            await cargarInventario();
        })
        .subscribe();
}

// Jalar los carros de la tabla 'cars'
async function cargarInventario() {
    const { data: autos, error } = await supabaseClient.from('cars').select('*');
    const contenedor = document.getElementById("contenedor-autos");
    
    if (error || !autos) {
        contenedor.innerHTML = `<p style="color:var(--danger); text-align:center;">Error al leer tabla 'cars'</p>`;
        return;
    }

    document.getElementById("total-autos").innerText = autos.length;

    if (autos.length === 0) {
        contenedor.innerHTML = `<p class="empty-state">No hay unidades registradas en 'cars'.</p>`;
        return;
    }

    contenedor.innerHTML = autos.map(auto => `
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
    `).join('');
}

// Jalar las citas de tu tabla original 'citas'
async function cargarCitas() {
    const { data: citas, error } = await supabaseClient.from('citas').select('*');
    const contenedor = document.getElementById("contenedor-citas");

    if (error || !citas) {
        contenedor.innerHTML = `<p style="color:var(--danger); text-align:center;">Error al leer tabla 'citas'</p>`;
        return;
    }

    if (citas.length === 0) {
        contenedor.innerHTML = `<p class="empty-state">No hay citas agendadas en la tabla.</p>`;
        return;
    }

    contenedor.innerHTML = citas.map(cita => `
        <div class="cita-block">
            <div class="cita-main">
                <h4>Prueba de Manejo: ${cita.auto_interes || 'Unidad'}</h4>
                <p>Cliente: ${cita.nombre_cliente || 'Anónimo'}</p>
                <span class="cita-tag">⏰ ${cita.fecha_hora_cita || 'Por confirmar'}</span>
            </div>
            <span class="cita-status-live">Confirmada</span>
        </div>
    `).join('');
}