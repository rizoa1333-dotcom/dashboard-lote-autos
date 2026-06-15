// dashboard.js

// 1. Inicialización de Supabase
const SUPABASE_URL = 'TU_SUPABASE_URL'; // <-- REEMPLAZAR
const SUPABASE_KEY = 'TU_SUPABASE_ANON_KEY'; // <-- REEMPLAZAR
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales Estrictas
let currentUser = null;
let currentLote = null;
let syncInterval = null;

// 2. Sincronización Estricta del DOM
document.addEventListener('DOMContentLoaded', () => {
    mapEventListeners();
    checkSessionAndLote(); // Guardián de Rutas invocado al final de la carga
});

// Mapeo de Eventos
function mapEventListeners() {
    // Formularios
    document.getElementById('loginForm').addEventListener('submit', handleLoginSubmit);
    document.getElementById('registroForm').addEventListener('submit', handleRegistroSubmit);
    document.getElementById('formNuevoCar').addEventListener('submit', handleCarSubmit);

    // Navegación Vistas (Login <-> Registro Dummy)
    document.getElementById('to-registro-btn').addEventListener('click', () => {
        // En un entorno de producción real este botón redirigiría a una vista de 'Sign Up'
        // Por brevedad, alertamos. Auth de Supabase maneja Sign Up similar a Sign In.
        alert("Para este flujo, el Sign Up se realiza vía la API o creando un usuario en Supabase Auth primero. Ingresa tus credenciales.");
    });

    // Menú Lateral SPA
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => {
                b.classList.remove('bg-slate-800', 'text-white');
                b.classList.add('text-slate-400');
            });
            e.currentTarget.classList.add('bg-slate-800', 'text-white');
            e.currentTarget.classList.remove('text-slate-400');
            
            const targetId = e.currentTarget.getAttribute('data-target');
            document.querySelectorAll('.spa-view').forEach(view => view.classList.add('hidden'));
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

    // Modal Vehículos
    document.getElementById('btn-abrir-modal-car').addEventListener('click', () => {
        document.getElementById('modalCarOverlay').classList.remove('hidden');
    });
    document.getElementById('btn-cerrar-modal-car').addEventListener('click', cerrarModalCar);
    document.querySelector('.btn-cancelar').addEventListener('click', cerrarModalCar);

    // Drawer Prospectos
    document.getElementById('btn-cerrar-drawer').addEventListener('click', () => {
        document.getElementById('drawerPro').classList.add('translate-x-full');
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        localStorage.clear();
        if(syncInterval) clearInterval(syncInterval);
        showView('view-login');
    });
}

// 3. El Guardián de Rutas
async function checkSessionAndLote() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!session || error) {
            localStorage.clear();
            await supabase.auth.signOut();
            showView('view-login');
            return;
        }

        currentUser = session.user;

        // Búsqueda estricta del Tenant
        const { data: lote, error: loteError } = await supabase
            .from('lotes')
            .select('*')
            .eq('profile_id', currentUser.id)
            .single();

        if (lote) {
            currentLote = lote;
            document.getElementById('ui-lote-name').textContent = currentLote.nombre;
            showView('view-dashboard');
            initDashboardWorker();
        } else {
            showView('view-registro');
        }
    } catch (err) {
        console.error("Error en Guardián de Rutas:", err);
        showView('view-login');
    }
}

// Intercambiador de Vistas Top-Level
function showView(viewId) {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-registro').classList.add('hidden');
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById(viewId).classList.remove('hidden');
}

// 4. Lógica de Formularios
async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
        alert("Error de acceso: " + error.message);
        return;
    }
    
    // Asignación inmediata y síncrona
    currentUser = data.user;
    // Disparar guardián para enrutamiento sin delays
    await checkSessionAndLote();
}

async function handleRegistroSubmit(e) {
    e.preventDefault();
    const nombre = document.getElementById('registroNombreLote').value;
    const whatsapp = document.getElementById('registroPhoneLote').value;

    const { data, error } = await supabase
        .from('lotes')
        .insert([{ 
            nombre: nombre, 
            whatsapp_number: whatsapp, 
            profile_id: currentUser.id 
        }])
        .select()
        .single();

    if (error) {
        alert("Error creando lote: " + error.message);
        return;
    }

    currentLote = data;
    document.getElementById('ui-lote-name').textContent = currentLote.nombre;
    showView('view-dashboard');
    initDashboardWorker();
}

async function handleCarSubmit(e) {
    e.preventDefault();
    
    // Mapeo directo y limpio sin strings manipulados
    const newCar = {
        lote_id: currentLote.id,
        brand: document.getElementById('carBrand').value.trim(),
        model: document.getElementById('carModel').value.trim(),
        year: parseInt(document.getElementById('carYear').value),
        price: parseFloat(document.getElementById('carPrice').value),
        kilometraje: parseFloat(document.getElementById('carKilometraje').value),
        transmision: document.getElementById('carTransmision').value,
        enganche_minimo: parseFloat(document.getElementById('carEnganche').value),
        status: 'Disponible'
    };

    const { error } = await supabase.from('cars').insert([newCar]);

    if (error) {
        alert("Error guardando vehículo: " + error.message);
    } else {
        cerrarModalCar();
        document.getElementById('formNuevoCar').reset();
        await fetchCarsAndMetrics(); // Refresco inmediato
    }
}

function cerrarModalCar() {
    document.getElementById('modalCarOverlay').classList.add('hidden');
}

// 5. Worker de Dashboard (Sincronización en Segundo Plano)
function initDashboardWorker() {
    // Carga inicial
    fetchCarsAndMetrics();
    fetchLeads();

    // Sincronización cada 10 segundos
    if(syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(async () => {
        try {
            await fetchCarsAndMetrics();
            await fetchLeads();
        } catch (err) {
            console.warn("Fallo silencioso en sincronización de fondo", err);
        }
    }, 10000);
}

// Procesamiento de Métricas y render de Autos
async function fetchCarsAndMetrics() {
    const { data: cars, error } = await supabase
        .from('cars')
        .select('*')
        .eq('lote_id', currentLote.id)
        .order('id', { ascending: false });

    if (error) return;

    let ganancias = 0;
    let valorPatio = 0;
    const tableBody = document.getElementById('cars-table-body');
    tableBody.innerHTML = '';

    cars.forEach(car => {
        // Lógica Financiera Estricta (Discriminación por Status)
        if (car.status === 'Vendido') {
            ganancias += Number(car.price);
        } else {
            valorPatio += Number(car.price);
        }

        // Render Fila
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-800 hover:bg-slate-800/50 transition";
        tr.innerHTML = `
            <td class="p-4 font-medium text-white">${car.brand} ${car.model}</td>
            <td class="p-4">${car.year}</td>
            <td class="p-4 font-mono text-emerald-400">${formatearMoneda(car.price)}</td>
            <td class="p-4">
                <span class="px-2 py-1 text-xs rounded-full ${car.status === 'Disponible' ? 'bg-blue-500/20 text-blue-400' : (car.status === 'Vendido' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400')}">
                    ${car.status}
                </span>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    document.getElementById('metric-ganancias').textContent = formatearMoneda(ganancias);
    document.getElementById('metric-patio').textContent = formatearMoneda(valorPatio);
}

// Render de Leads capturados por IA
async function fetchLeads() {
    const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .eq('lote_id', currentLote.id)
        .order('fecha_cita', { ascending: false });

    if (error) return;

    const container = document.getElementById('leads-container');
    container.innerHTML = '';

    leads.forEach(lead => {
        const card = document.createElement('div');
        card.className = "bg-slate-900 border border-slate-800 p-5 rounded-xl cursor-pointer hover:border-blue-500 transition";
        card.onclick = () => abrirDrawerLead(lead);
        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h4 class="font-bold text-white">${lead.nombre}</h4>
                <span class="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">${lead.status || 'Nuevo'}</span>
            </div>
            <p class="text-sm text-slate-400 mb-1">Interés: <span class="text-white">${lead.auto_interes}</span></p>
            <p class="text-xs text-slate-500 truncate">Últ. Msg: ${lead.ultimo_mensaje || 'N/A'}</p>
        `;
        container.appendChild(card);
    });
}

function abrirDrawerLead(lead) {
    const drawer = document.getElementById('drawerPro');
    const content = document.getElementById('drawer-content');
    
    content.innerHTML = `
        <div class="space-y-4">
            <div>
                <label class="block text-xs text-slate-500 uppercase tracking-wider">Nombre</label>
                <p class="text-base text-white font-medium">${lead.nombre}</p>
            </div>
            <div>
                <label class="block text-xs text-slate-500 uppercase tracking-wider">Teléfono</label>
                <p class="text-base text-white font-medium">${lead.telefono}</p>
            </div>
            <div>
                <label class="block text-xs text-slate-500 uppercase tracking-wider">Vehículo de Interés</label>
                <p class="text-base text-blue-400 font-medium">${lead.auto_interes}</p>
            </div>
            <div>
                <label class="block text-xs text-slate-500 uppercase tracking-wider">Historial de Mensajes (IA)</label>
                <div class="bg-slate-800 p-3 rounded-lg mt-1 text-slate-300 italic">
                    "${lead.ultimo_mensaje || 'Sin mensajes registrados.'}"
                </div>
            </div>
        </div>
    `;
    
    drawer.classList.remove('translate-x-full');
}

// Utilidades
function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor);
}