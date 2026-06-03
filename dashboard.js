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

    const btnMenu = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    if (btnMenu && sidebar) {
        btnMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
            btnMenu.textContent = sidebar.classList.contains('active') ? '✕ Cerrar' : '☰ Opciones';
        });
    }

    const btnAlertas = document.getElementById('btn-alertas');
    if (btnAlertas) {
        if (Notification.permission === 'granted') btnAlertas.style.display = 'none';
        btnAlertas.addEventListener('click', async () => {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                alert("¡Alertas activadas con éxito!");
                btnAlertas.style.display = 'none';
            }
        });
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "/index.html";
});

// --- ENVIAR AUTO NUEVO ---
document.getElementById('form-nuevo-auto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const marca = document.getElementById('auto-marca').value.trim();
    const modelo = document.getElementById('auto-modelo').value.trim();
    const ano = document.getElementById('auto-ano').value;
    const precio = document.getElementById('auto-precio').value;
    const foto = document.getElementById('auto-foto').value.trim(); 

    const { error } = await supabaseClient.from('cars').insert([
        { brand: marca, model: modelo, year: ano, price: precio, status: 'Disponible', image_url: foto }
    ]);

    if (!error) {
        alert("¡Vehículo agregado con éxito!");
        document.getElementById('form-nuevo-auto').reset();
        document.getElementById('form-nuevo-auto').style.display = 'none';
        cargarInventario();
    }
});

// --- MARCAR VENDIDO (INVENTARIO) ---
window.marcarVendido = async (idAuto) => {
    if (confirm("¿Confirmas que este auto ha sido vendido?")) {
        const { error } = await supabaseClient.from('cars').update({ status: 'Vendido' }).eq('id', idAuto);
        if (!error) {
            alert("¡Felicidades por la venta! 💲🎉");
            cargarInventario();
        }
    }
};

// --- CAMBIAR ESTADO DE CITA (MINI CRM) ---
window.cambiarEstadoCita = async (idCita, nuevoEstado) => {
    const { error } = await supabaseClient.from('citas').update({ estado_lead: nuevoEstado }).eq('id', idCita);
    if (!error) {
        if (nuevoEstado === 'Vendido') alert("¡Increíble! Lead cerrado con éxito. 💲🥳");
        cargarCitas();
    }
};

// --- CARGAR INVENTARIO Y CALCULAR MÉTRICAS ---
async function cargarInventario() {
    const { data: autos } = await supabaseClient.from('cars').select('*').order('status', { ascending: true });
    const cont = document.getElementById("contenedor-autos");
    document.getElementById("total-autos").innerText = autos ? autos.length : 0;
    
    // Inicializadores para estadísticas analíticas superiores
    let disponibles = 0;
    let valorTotal = 0;
    let vendidos = 0;

    cont.innerHTML = autos?.length > 0 ? autos.map(a => {
        if (a.status === 'Disponible') {
            disponibles++;
            valorTotal += Number(a.price || 0);
        } else if (a.status === 'Vendido') {
            vendidos++;
        }

        return `
            <div class="auto-block" style="${a.status === 'Vendido' ? 'opacity: 0.5;' : ''}">
                <div style="flex: 1;">
                    <div style="display:flex; align-items:center;">
                        <h4>${a.brand} ${a.model}</h4>
                        <span style="font-size:11px; margin-left:8px; background:var(--bg-main); padding:2px 6px; border-radius:4px; color:var(--text-muted); font-weight:600;">${a.year}</span>
                    </div>
                    <div class="auto-price">$${Number(a.price).toLocaleString('es-MX')} MXN</div>
                    ${a.image_url ? `<a href="${a.image_url}" target="_blank" style="display:inline-block; margin-top:6px; font-size:11px; color:var(--text-pure); text-decoration:underline; font-weight:500;">Ver Galería</a>` : ''}
                    <div style="margin-top: 6px;"><span class="auto-status-badge" style="${a.status === 'Vendido' ? 'color: var(--danger);' : ''}">${a.status}</span></div>
                </div>
                ${a.status !== 'Vendido' ? `<button onclick="marcarVendido('${a.id}')" class="btn-primary" style="background:transparent; color:var(--text-pure); border:1px solid var(--border-color); padding:6px 12px; font-size:11px;">✔ Vendido</button>` : ''}
            </div>
        `;
    }).join('') : `<p class="empty-state">No hay unidades en inventario.</p>`;

    // Renderizar métricas calculadas en los tableros superiores
    document.getElementById('kpi-disponibles').innerText = disponibles;
    document.getElementById('kpi-valor').innerText = `$${valorTotal.toLocaleString('es-MX')} MXN`;
    document.getElementById('kpi-vendidos').innerText = vendidos;
}

// --- CARGAR CITAS Y OPERACIONES CRM ---
async function cargarCitas() {
    const { data: citas } = await supabaseClient.from('citas').select('*').order('id', { ascending: false });
    const cont = document.getElementById("contenedor-citas");
    
    cont.innerHTML = citas?.length > 0 ? citas.map(c => {
        // Limpiar número telefónico para enlace limpio de API WhatsApp (soporta campo telefono_cliente o telefono)
        const rawTel = c.telefono_cliente || c.telefono || '';
        const cleanTel = rawTel.replace(/\D/g, '');
        const estadoActual = c.estado_lead || 'Nuevo Lead';

        return `
            <div class="cita-block">
                <div class="cita-main">
                    <h4>Vehículo: ${c.auto_interes}</h4>
                    <p>👤 Prospecto: ${c.nombre_cliente}</p>
                    <span class="cita-tag">⏰ Agenda: ${c.fecha_hora_cita || 'En proceso por la IA'}</span>
                    
                    <div class="crm-actions">
                        ${cleanTel ? `<a href="https://wa.me/${cleanTel}" target="_blank" class="btn-whatsapp">💬 WhatsApp</a>` : ''}
                        <select onchange="cambiarEstadoCita('${c.id}', this.value)" class="select-crm">
                            <option value="Nuevo Lead" ${estadoActual === 'Nuevo Lead' ? 'selected' : ''}>Nuevo Lead</option>
                            <option value="Contactado" ${estadoActual === 'Contactado' ? 'selected' : ''}>Contactado</option>
                            <option value="Prueba de Manejo" ${estadoActual === 'Prueba de Manejo' ? 'selected' : ''}>Prueba de Manejo</option>
                            <option value="En Negociación" ${estadoActual === 'En Negociación' ? 'selected' : ''}>En Negociación</option>
                            <option value="Vendido" ${estadoActual === 'Vendido' ? 'selected' : ''}>Vendido</option>
                            <option value="Perdido" ${estadoActual === 'Perdido' ? 'selected' : ''}>Perdido</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }).join('') : `<p class="empty-state">No hay citas registradas de forma reciente.</p>`;
}

function escucharTiempoReal() {
    supabaseClient
        .channel('dashboard-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'citas' }, async (p) => {
            if (Notification.permission === "granted") {
                new Notification("¡Cita Agendada por la IA! 🏎️", { 
                    body: `${p.new.nombre_cliente} agendó para el coche ${p.new.auto_interes}`
                });
            }
            await cargarCitas();
        })
        .subscribe();
}