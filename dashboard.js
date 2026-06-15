// ============================================================
// PROJECT 360 - dashboard.js (SPA UNIFICADA INTEGRAL)
// ============================================================

const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let localLeadsCache = [];
let currentLote = null;

// ============================================================
// ORQUESTADOR DE VISTAS (SPA)
// ============================================================
function showView(viewName) {
  const viewRegistro = document.getElementById("view-registro");
  const viewLogin = document.getElementById("view-login");
  const viewDashboard = document.getElementById("view-dashboard");
  const body = document.body;

  body.className = "bg-[#F8FAFC] text-slate-900 min-h-screen flex";

  if (viewName === 'dashboard') {
    if (viewRegistro) viewRegistro.classList.add("hidden");
    if (viewLogin) viewLogin.classList.add("hidden");
    if (viewDashboard) viewDashboard.classList.remove("hidden");
    body.classList.add("flex-col", "md:flex-row", "justify-start", "items-stretch");
  } else if (viewName === 'login') {
    if (viewRegistro) viewRegistro.classList.add("hidden");
    if (viewDashboard) viewDashboard.classList.add("hidden");
    if (viewLogin) viewLogin.classList.remove("hidden");
    body.classList.add("items-center", "justify-center", "p-4");
  } else {
    if (viewLogin) viewLogin.classList.add("hidden");
    if (viewDashboard) viewDashboard.classList.add("hidden");
    if (viewRegistro) viewRegistro.classList.remove("hidden");
    body.classList.add("items-center", "justify-center", "p-4");
  }
}

// ============================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  
  // 1. Alternadores visuales con navegación segura (?.)
  document.getElementById("to-login-btn")?.addEventListener("click", () => showView('login'));
  document.getElementById("to-registro-btn")?.addEventListener("click", () => showView('registro'));

  // 2. Escuchar Formulario de Registro
  document.getElementById("form-registro")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const nombreLote = document.getElementById('nombre-lote').value.trim();
    const ciudad = document.getElementById('ciudad').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const btn = document.getElementById('btn-registrar');

    if (btn) {
      btn.textContent = "Configurando Empresa...";
      btn.disabled = true;
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;

      const { error: loteError } = await supabase.from('lotes').insert([
        { nombre: nombreLote, ciudad: ciudad, whatsapp_number: telefono, profile_id: authData.user.id }
      ]);
      if (loteError) throw loteError;

      alert('¡Cuenta Creada! Inicializando panel...');
      location.reload(); 
    } catch (err) {
      alert("Error al registrar: " + err.message);
      if (btn) {
        btn.textContent = "Registrar Lote e Ingresar";
        btn.disabled = false;
      }
    }
  });

  // 3. Escuchar Formulario de Inicio de Sesión
  document.getElementById("form-login")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login-submit');
    const errorDiv = document.getElementById('login-error');

    if (btn) {
      btn.textContent = "Validando...";
      btn.disabled = true;
    }
    if (errorDiv) errorDiv.style.display = "none";

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      location.reload();
    } catch (err) {
      if (errorDiv) {
        errorDiv.textContent = "Credenciales incorrectas.";
        errorDiv.style.display = "block";
      }
      if (btn) {
        btn.textContent = "Iniciar Sesión";
        btn.disabled = false;
      }
    }
  });

  // 4. Escuchar el Botón de Cerrar Sesión con navegación segura (?.) para evitar el error de null
  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.reload();
  });

  // 5. VALIDACIÓN DE RUTA INTERNA
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;

  if (!user) {
    showView('registro'); 
    return; 
  }

  const { data: lote, error: loteError } = await supabase
    .from('lotes')
    .select('*')
    .eq('profile_id', user.id)
    .single();

  if (loteError || !lote) {
    showView('registro');
    return;
  }

  currentLote = lote;
  showView('dashboard');
  
  const headerText = document.getElementById("loteHeaderName");
  if (headerText) {
    headerText.innerHTML = `${lote.nombre} <span class="text-slate-400 font-normal text-xs">• ID Lote: ${lote.id.slice(0,8)}...</span>`;
  }
  const sidebarText = document.getElementById("loteSidebarName");
  if (sidebarText) sidebarText.textContent = lote.nombre;

  const configNombre = document.getElementById("configNombreLote");
  const configPhone = document.getElementById("configPhoneLote");
  if (configNombre) configNombre.value = lote.nombre;
  if (configPhone) configPhone.value = lote.whatsapp_number || '';

  initSidebar();
  initNavigation();
  initDrawer();
  
  await fetchAndRenderAll();
  setInterval(fetchAndRenderAll, 10000);
});

async function fetchAndRenderAll() {
  if (!currentLote) return;
  await renderLeadsAndCounters();
  await renderCars();
}

// ============================================================
// FUNCIONES DE CONTROL DE INTERFAZ INTERNA
// ============================================================
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  const openBtn = document.getElementById("openSidebar");
  const closeBtn = document.getElementById("closeSidebar");
  if (!sidebar) return; 

  const open = () => { sidebar.classList.remove("-translate-x-full"); overlay?.classList.remove("hidden"); };
  const close = () => { sidebar.classList.add("-translate-x-full"); overlay?.classList.add("hidden"); };

  if (openBtn) openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (overlay) overlay.addEventListener("click", close);
  window._closeSidebar = close;
}

function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".section-panel");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((i) => i.classList.remove("active", "bg-[#F1F5F9]"));
      item.classList.add("active");

      const target = item.dataset.section;
      sections.forEach((sec) => {
        sec.classList.toggle("hidden", sec.id !== `section-${target}`);
      });
      if (window.innerWidth < 768 && window._closeSidebar) window._closeSidebar();
    });
  });
}

async function renderLeadsAndCounters() {
  const { data: leads, error } = await supabase.from('leads').select('*').eq('lote_id', currentLote.id);
  if (error) return;
  localLeadsCache = leads || [];

  const containerLeadsList = document.getElementById("leadsList");
  const containerCitasList = document.getElementById("citasListContainer");
  const containerMonitorMensajes = document.getElementById("monitorMensajesContainer");

  if (containerLeadsList) containerLeadsList.innerHTML = "";
  if (containerCitasList) containerCitasList.innerHTML = "";
  if (containerMonitorMensajes) containerMonitorMensajes.innerHTML = "";

  let totalCalificadosPendientes = 0, totalCitasHoy = 0, countNuevo = 0, countPendiente = 0, countCita = 0;

  localLeadsCache.forEach((lead) => {
    if (lead.fecha_cita) { countCita++; totalCitasHoy++; }
    else if (lead.status === 'Pendiente') countPendiente++;
    else countNuevo++;

    if (lead.status === 'Pendiente' && containerLeadsList) {
      totalCalificadosPendientes++;
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-[#E2E8F0]";
      row.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-amber-500">★</span>
          <div class="min-w-0">
            <p class="text-sm font-medium text-slate-900 truncate">${lead.name || 'Prospecto Anónimo'}</p>
            <p class="text-xs text-slate-400 truncate">${lead.auto_interes || 'Sin especificar'} • Enganche: ${lead.enganche || '—'}</p>
          </div>
        </div>
        <button class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-2.5 py-1.5 rounded-md font-medium" data-lead-id="${lead.id}">Ver Perfil Pro</button>
      `;
      containerLeadsList.appendChild(row);
    }

    if (lead.fecha_cita && containerCitasList) {
      const rowCita = document.createElement("div");
      rowCita.className = "flex items-center justify-between bg-white p-3 rounded-lg border border-[#E2E8F0]";
      rowCita.innerHTML = `
        <div><p class="text-sm font-medium text-slate-900">${lead.name || 'Interesado'}</p><p class="text-xs text-slate-400">${lead.auto_interes || 'Unidad'} • Horario: <strong>${lead.fecha_cita}</strong></p></div>
        <span class="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">Agendada</span>
      `;
      containerCitasList.appendChild(rowCita);
    }

    if (containerMonitorMensajes) {
      const rowMsg = document.createElement("div");
      rowMsg.className = "bg-white p-3 rounded-lg border border-[#E2E8F0]";
      rowMsg.innerHTML = `<p class="text-sm text-slate-800"><span class="font-medium">${lead.phone_number || 'Sin número'}</span> — <span class="text-xs text-slate-400">Paso: ${lead.encuesta_step || 0}</span></p>`;
      containerMonitorMensajes.appendChild(rowMsg);
    }
  });

  if (leadsCountEl = document.getElementById("leadsCount")) leadsCountEl.textContent = totalCalificadosPendientes;
  if (citasCountEl = document.getElementById("citasCount")) citasCountEl.textContent = totalCitasHoy;
  if (pNuevo = document.getElementById("pipeNuevo")) pNuevo.textContent = `${countNuevo} conversaciones en proceso`;
  if (pPendiente = document.getElementById("pipePendiente")) pPendiente.textContent = `${countPendiente} leads listos en Dashboard`;
  if (pCita = document.getElementById("pipeCita")) pCita.textContent = `${countCita} citas registradas`;

  containerLeadsList?.querySelectorAll("[data-lead-id]").forEach(b => b.addEventListener("click", () => openDrawer(b.dataset.leadId)));
}

async function renderCars() {
  const { data: cars, error } = await supabase.from('cars').select('*').eq('lote_id', currentLote.id);
  if (error) return;
  const tbody = document.getElementById("carsTableBody");
  if (!tbody) return; tbody.innerHTML = "";

  if (document.getElementById("carsCount")) document.getElementById("carsCount").textContent = cars ? cars.length : 0;
  if (!cars || cars.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="text-center text-xs text-slate-400 py-6">Sin autos.</td></tr>`; return; }

  cars.forEach((car) => {
    const tr = document.createElement("tr"); tr.className = "border-b border-slate-100 text-slate-700";
    tr.innerHTML = `<td class="py-3 font-mono text-xs">${car.id.slice(0,5)}...</td><td class="font-medium text-slate-900 py-3">${car.brand_model}</td><td>${car.year}</td><td>$${car.price.toLocaleString()}</td><td>${car.status}</td>`;
    tbody.appendChild(tr);
  });
}

function initDrawer() {
  const closeBtn = document.getElementById("closeDrawer"), overlay = document.getElementById("drawerOverlay");
  const c = () => { document.getElementById("drawer")?.classList.add("translate-x-full"); overlay?.classList.add("hidden"); };
  closeBtn?.addEventListener("click", c); overlay?.addEventListener("click", c);
}

function openDrawer(leadId) {
  const lead = localLeadsCache.find(l => String(l.id) === String(leadId)); if (!lead) return;
  document.getElementById("drawerSubtitle").textContent = `ID: ${lead.id.slice(0,8)}`;
  document.getElementById("drawerExpandedData").innerHTML = `<p class="font-semibold text-slate-800">${lead.name || 'Anónimo'}</p><p class="text-xs text-slate-500 mt-2">🚗 Interés: ${lead.auto_interes || '—'}<br>💰 Enganche: ${lead.enganche || '—'}</p>`;
  document.getElementById("drawerOverlay")?.classList.remove("hidden");
  document.getElementById("drawer")?.classList.remove("translate-x-full");
}