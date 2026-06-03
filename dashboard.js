// --- CREDENCIALES DE SUPABASE ---
const SUPABASE_URL = "https://deljncdcddfghfihuumd.supabase.co";
const SUPABASE_KEY = "sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener("DOMContentLoaded", async () => {
    // 1. PROTEGER LA RUTA (Verificar sesión)
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
        window.location.href = "/index.html";
        return;
    }

    document.getElementById('user-email').innerText = session.user.email;

    // 2. INICIAR CARGA DE DATOS Y TIEMPO REAL
    cargarInventario();
    cargarCitas();
    escucharTiempoReal();

    // 3. MENÚ MÓVIL
    const btnMenu = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    if (btnMenu && sidebar) {
        btnMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
            btnMenu.textContent = sidebar.classList.contains('active') ? '✕ Cerrar' : '☰ Opciones';
        });
    }

    // 4. ACTIVAR NOTIFICACIONES MANUALMENTE (Evita bloqueo en móviles)
    const btnAlertas = document.getElementById('btn-alertas');
    if (btnAlertas) {
        // Ocultar botón si ya dio permiso
        if (Notification.permission === 'granted') {
            btnAlertas.style.display = 'none';
        }

        btnAlertas.addEventListener('click', async () => {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                alert("¡Alertas activadas! El sistema te avisará cuando llegue un lead.");
                new Notification("Proyecto360", { 
                    body: "Notificaciones push listas.",
                    icon: "https://cdn-icons-png.flaticon.com/512/3062/3062634.png"
                });
                btnAlertas.style.display = 'none';
            } else {
                alert("Permiso denegado. Debes activarlo en la configuración de tu navegador.");
            }
        });
    }
});

// --- CERRAR SESIÓN ---
document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "/index.html";
});

// --- GUARDAR NUEVO AUTO (CREATE) ---
document.getElementById('form-nuevo-auto').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const marca = document.getElementById('auto-marca').value.trim();
    const modelo = document.getElementById('auto-modelo').value.trim();
    const ano = document.getElementById('auto-ano').value;
    const precio = document.getElementById('auto-precio').value;
    const foto = document.getElementById('auto-foto').value.trim(); 

    // Insertamos la nueva unidad mapeando el campo foto hacia la columna image_url
    const { error } = await supabaseClient.from('cars').insert([
        { brand: marca, model: modelo, year: ano, price: precio, status: 'Disponible', image_url: foto }
    ]);

    if (!error) {
        alert("¡Vehículo agregado con éxito!");
        document.getElementById('form-nuevo-auto').reset();
        document.getElementById('form-nuevo-auto').style.display = 'none';
        cargarInventario();
    } else {
        alert("Error al guardar el vehículo.");
        console.error(error);
    }
});

// --- MARCAR AUTO COMO VENDIDO (UPDATE) ---
window.marcarVendido = async (idAuto) => {
    const confirmar = confirm("¿Marcar unidad como VENDIDA? Ya no aparecerá a nuevos clientes.");
    if (confirmar) {
        const { error } = await supabaseClient.from('cars').update({ status: 'Vendido' }).eq('id', idAuto);
        if (!error) {
            alert("¡Felicidades por la venta!");
            cargarInventario();
        } else {
            console.error("Error al marcar como vendido:", error);
        }
    }
};

// --- CARGAR INVENTARIO (READ) ---
async function cargarInventario() {
    const { data: autos } = await supabaseClient.from('cars').select('*').order('status', { ascending: true });
    const cont = document.getElementById("contenedor-autos");
    document.getElementById("total-autos").innerText = autos ? autos.length : 0;
    
    cont.innerHTML = autos?.length > 0 ? autos.map(a => `
        <div class="auto-block" style="${a.status === 'Vendido' ? 'opacity: 0.5;' : ''}">
            <div style="flex: 1;">
                <div style="display:flex; align-items:center;">
                    <h4>${a.brand} ${a.model}</h4>
                    <span style="font-size:11px; margin-left:8px; background:var(--bg-main); padding:2px 6px; border-radius:4px; color:var(--text-muted);">${a.year}</span>
                </div>
                <div class="auto-price">$${Number(a.price).toLocaleString('es-MX')} MXN</div>
                
                ${a.image_url ? `<a href="${a.image_url}" target="_blank" style="display:inline-block; margin-top:6px; font-size:11px; color:var(--text-pure); text-decoration:underline;">Ver Fotos</a>` : ''}
                
                <div style="margin-top: 4px;">
                    <span class="auto-status-badge">${a.status}</span>
                </div>
            </div>
            
            ${a.status !== 'Vendido' ? `
                <button onclick="marcarVendido('${a.id}')" class="btn-primary" style="background: var(--bg-card); color: var(--text-pure); border: 1px solid var(--border-color); padding: 8px 12px; font-size: 11px;">
                    ✔ Vendido
                </button>
            ` : ''}
        </div>
    `).join('') : `<p class="empty-state">No hay unidades registradas.</p>`;
}

// --- CARGAR CITAS (READ) ---
async function cargarCitas() {
    const { data: citas } = await supabaseClient.from('citas').select('*').order('id', { ascending: false });
    const cont = document.getElementById("contenedor-citas");
    
    cont.innerHTML = citas?.length > 0 ? citas.map(c => `
        <div class="cita-block">
            <div class="cita-main">
                <h4>Interés: ${c.auto_interes}</h4>
                <p>Cliente: ${c.nombre_cliente}</p>
                <span class="cita-tag">${c.fecha_hora_cita || 'En proceso'}</span>
            </div>
            <span class="cita-status-live">Nuevo Lead</span>
        </div>
    `).join('') : `<p class="empty-state">Aún no hay leads generados por la IA.</p>`;
}

// --- NOTIFICACIONES EN TIEMPO REAL ---
function escucharTiempoReal() {
    supabaseClient
        .channel('dashboard-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'citas' }, async (p) => {
            if (Notification.permission === "granted") {
                new Notification("¡Nuevo Lead Cerrado!", { 
                    body: `${p.new.nombre_cliente} quiere información sobre el ${p.new.auto_interes}`,
                    icon: "https://cdn-icons-png.flaticon.com/512/3062/3062634.png"
                });
            }
            await cargarCitas();
        })
        .subscribe();
}