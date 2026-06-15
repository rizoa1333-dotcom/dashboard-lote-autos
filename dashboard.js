// ============================================================
// PROJECT 360 - dashboard.js (SaaS MULTI-TENANT OPTIMIZADO)
// ============================================================

const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';

// Inicialización limpia usando el objeto global expuesto por el script del HTML
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Almacén local de datos descargados para alimentar el panel dinámico
let localLeadsCache = [];
let currentLote = null; // Almacenará los datos del lote que inició sesión

// ============================================================
// CONTROL DE ACCESO E INICIALIZACIÓN GENERAL
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Verificar si el usuario tiene sesión activa en Supabase Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.log("Acceso denegado. Redirigiendo al login...");
    window.location.href = "login.html";
    return;
  }

  // 2. Descargar el lote que le pertenece a este usuario (amarre por profile_id)
  const { data: lote, error: loteError } = await supabase
    .from('lotes')
    .select('*')
    .eq('profile_id', user.id)
    .single();

  if (loteError || !lote) {
    console.error("Error al obtener el lote vinculado:", loteError);
    alert("Tu cuenta de usuario no tiene ningún lote asignado. Contacta a soporte.");
    window.location.href = "login.html";
    return;
  }

  // Guardamos el lote en memoria global para los filtros del panel
  currentLote = lote;

  // 3. Pintar dinámicamente los datos del lote en la cabecera (BLINDADO CONTRA NULL)
  const headerText = document.getElementById("loteHeaderName") || document.querySelector("header p") || document.querySelector("h1");
  if (headerText) {
    headerText.innerHTML = `${lote.nombre} <span class="text-slate-400 font-normal text-xs">• ID Lote: ${lote.id.slice(0,8)}... • Ciudad: ${lote.ciudad}</span>`;
  }
  
  const bottomProfileText = document.querySelector(".Automotriz-Manzanillo-text"); 
  if (bottomProfileText) bottomProfileText.textContent = lote.nombre;

  // 4. Inicializar de forma segura la interactividad visual de pestañas y barras laterales
  try { initSidebar(); } catch (e) { console.error("Error initSidebar:", e); }
  try { initNavigation(); } catch (e) { console.error("Error initNavigation:", e); }
  try { initDrawer(); } catch (e) { console.error("Error initDrawer:", e); }
  
  // Ejecutamos la consulta filtrada inicial
  await fetchAndRenderAll();
  
  // Polling automático cada 10 segundos para pintar leads en vivo sin refrescar
  setInterval(fetchAndRenderAll, 10000);
});

async function fetchAndRenderAll() {
  if (!currentLote) return; // Seguridad si el polling corre antes de cargar el lote
  await renderLeadsAndCounters();
  await renderCars();
}

// ============================================================
// SIDEBAR MÓVIL (Blindado contra elementos inexistentes en el DOM)
// ============================================================
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  const openBtn = document.getElementById("openSidebar");
  const closeBtn = document.getElementById("closeSidebar");

  // Si no existe la barra lateral en el HTML, salimos pacíficamente sin romper el código
  if (!sidebar) return; 

  const open = () => {
    sidebar.classList.remove("-translate-x-full");
    if (overlay) overlay.classList.remove("hidden");
  };
  const close = () => {
    sidebar.classList.add("-translate-x-full");
    if (overlay) overlay.classList.add("hidden");
  };

  if (openBtn) openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (overlay) overlay.addEventListener("click", close);

  window._closeSidebar = close;
}

// ============================================================
// NAVEGACIÓN ENTRE SECCIONES
// ============================================================
function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".section-panel");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");

      const target = item.dataset.section;
      sections.forEach((sec) => {
        sec.classList.toggle("hidden", sec.id !== `section-${target}`);
      });

      if (window.innerWidth < 768 && window._closeSidebar) {
        window._closeSidebar();
      }
    });
  });
}

// ============================================================
// RENDEREADO DE LEADS, CONTADORES Y PIPELINE DESDE SUPABASE
// ============================================================
async function renderLeadsAndCounters() {
  // FILTRO MULTI-TENANT SEGURO: Trae únicamente los leads del lote logueado
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .eq('lote_id', currentLote.id);

  if (error) {
    console.error("Error cargando leads de Supabase:", error);
    return;
  }

  localLeadsCache = leads || [];

  // Containers del HTML seguro
  const containerLeadsList = document.getElementById("leadsList");
  const containerCitasList = document.getElementById("citasListContainer");
  const containerMonitorMensajes = document.getElementById("monitorMensajesContainer");

  // Limpieza inicial antes de inyectar datos reales
  if (containerLeadsList) containerLeadsList.innerHTML = "";
  if (containerCitasList) containerCitasList.innerHTML = "";
  if (containerMonitorMensajes) containerMonitorMensajes.innerHTML = "";

  // Variables contadoras para las tarjetas analíticas de arriba
  let totalCalificadosPendientes = 0;
  let totalCitasHoy = 0;
  let countNuevo = 0;
  let countPendiente = 0;
  let countCita = 0;

  localLeadsCache.forEach((lead) => {
    // Clasificación de contadores basados en la estructura real
    if (lead.fecha_cita) {
      countCita++;
      totalCitasHoy++;
    } else if (lead.status === 'Pendiente') {
      countPendiente++;
    } else {
      countNuevo++;
    }

    // A: Inyectar en Monitor de Leads Precalificados (Solo si status === 'Pendiente')
    if (lead.status === 'Pendiente' && containerLeadsList) {
      totalCalificadosPendientes++;
      
      const row = document.createElement("div");
      row.className = "lead-row flex items-center justify-between gap-3 bg-white";
      row.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <span class="score-badge score-high">★</span>
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">${lead.name || 'Prospecto Anónimo'}</p>
            <p class="text-xs text-slate-400 truncate">${lead.auto_interes || 'Sin auto especificado'} • Enganche: ${lead.enganche || 'Pendiente'}</p>
          </div>
        </div>
        <button class="btn-ghost flex-shrink-0" data-lead-id="${lead.id}">
          Ver Perfil Pro
        </button>
      `;
      containerLeadsList.appendChild(row);
    }

    // B: Inyectar en pestaña de Citas Agendadas (Si tiene fecha_cita guardada)
    if (lead.fecha_cita && containerCitasList) {
      const rowCita = document.createElement("div");
      rowCita.className = "flat-row flex items-center justify-between bg-white";
      rowCita.innerHTML = `
        <div>
          <p class="text-sm font-medium">${lead.name || 'Interesado'}</p>
          <p class="text-xs text-slate-400">${lead.auto_interes || 'Unidad'} • Horario: <strong class="text-slate-900">${lead.fecha_cita}</strong></p>
        </div>
        <span class="status-pill status-green">Agendada</span>
      `;
      containerCitasList.appendChild(rowCita);
    }

    // C: Inyectar en pestaña de Módulo de Mensajes
    if (containerMonitorMensajes) {
      const rowMsg = document.createElement("div");
      rowMsg.className = "flat-row bg-white";
      rowMsg.innerHTML = `
        <p class="text-sm"><span class="font-medium">${lead.phone_number || 'Sin Teléfono'}</span> — <span class="text-xs text-slate-400">Paso Encuesta: ${lead.encuesta_step || 0}</span></p>
        <p class="text-xs text-slate-500 mt-1">Auto: ${lead.auto_interes || 'No especificado'} | Trabajo: ${lead.situacion_laboral || 'No capturada'}</p>
      `;
      containerMonitorMensajes.appendChild(rowMsg);
    }
  });

  // Validaciones en caso de listas vacías
  if (containerLeadsList && totalCalificadosPendientes === 0) {
    containerLeadsList.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No hay leads precalificados pendientes.</p>`;
  }
  if (containerCitasList && totalCitasHoy === 0) {
    containerCitasList.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No hay citas registradas en la base de datos.</p>`;
  }

  // Renderizar valores en los contadores analíticos superiores protegiendo la carga
  const leadsCountEl = document.getElementById("leadsCount");
  const citasCountEl = document.getElementById("citasCount");
  if (leadsCountEl) leadsCountEl.textContent = totalCalificadosPendientes;
  if (citasCountEl) citasCountEl.textContent = totalCitasHoy;

  // Actualizar textos del Pipeline de Ventas lateral
  const pNuevo = document.getElementById("pipeNuevo");
  const pPendiente = document.getElementById("pipePendiente");
  const pCita = document.getElementById("pipeCita");
  if (pNuevo) pNuevo.textContent = `${countNuevo} conversaciones en proceso`;
  if (pPendiente) pPendiente.textContent = `${countPendiente} leads listos en Dashboard`;
  if (pCita) pCita.textContent = `${countCita} citas registradas`;

  // Listener para levantar el Drawer con los detalles guardados por Carlos
  if (containerLeadsList) {
    containerLeadsList.querySelectorAll("[data-lead-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openDrawer(btn.dataset.leadId);
      });
    });
  }
}

// ============================================================
// CONTROL DE INVENTARIO DESDE SUPABASE REAL
// ============================================================
async function renderCars() {
  // FILTRO MULTI-TENANT SEGURO: Trae únicamente el stock de autos del lote logueado
  const { data: cars, error } = await supabase
    .from('cars')
    .select('*')
    .eq('lote_id', currentLote.id);

  if (error) {
    console.error("Error cargando inventario de Supabase:", error);
    return;
  }

  const tbody = document.getElementById("carsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const carsCountEl = document.getElementById("carsCount");
  if (carsCountEl) carsCountEl.textContent = cars ? cars.length : 0;

  const statusClassMap = {
    Disponible: "status-green",
    Apartado: "status-yellow",
    Vendido: "status-gray",
  };

  if (!cars || cars.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-xs text-slate-400 py-4">Sin autos en el inventario de este lote.</td></tr>`;
    return;
  }

  cars.forEach((car) => {
    const pillClass = statusClassMap[car.status] || "status-gray";
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-100";
    tr.innerHTML = `
      <td class="text-slate-400 font-mono text-xs py-3">${car.id}</td>
      <td class="font-medium text-slate-900">${car.brand_model || 'Sin especificar'}</td>
      <td>${car.year || '—'}</td>
      <td>$${car.price ? car.price.toLocaleString("es-MX") : '0'}</td>
      <td><span class="status-pill ${pillClass}">${car.status || 'Disponible'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
// DRAWER EXTENDIDO: DETALLES COMPLETOS DE LA ENCUESTA
// ============================================================
function initDrawer() {
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const closeBtn = document.getElementById("closeDrawer");

  if (!drawer || !overlay) return;

  const close = () => {
    drawer.classList.add("translate-x-full");
    overlay.classList.add("hidden");
  };

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (overlay) overlay.addEventListener("click", close);

  window._closeDrawer = close;
}

function openDrawer(leadId) {
  const lead = localLeadsCache.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const subtitle = document.getElementById("drawerSubtitle");
  const containerExtended = document.getElementById("drawerExpandedData");

  if (!drawer || !subtitle || !containerExtended) return;

  subtitle.textContent = `ID Lead: ${lead.id} • Teléfono: ${lead.phone_number || 'Desconocido'}`;
  
  // Render de los datos de la encuesta de WhatsApp recolectados por la IA
  containerExtended.innerHTML = `
    <div class="border-b border-slate-200 pb-2 mb-2">
      <p class="text-xs text-slate-400 uppercase font-bold tracking-wider">Nombre del Cliente</p>
      <p class="text-sm font-semibold text-slate-800">${lead.name || 'No proporcionado'}</p>
    </div>
    <div>
      <p class="text-xs text-slate-400 font-medium">🚗 Auto de Interés:</p>
      <p class="font-medium text-slate-900">${lead.auto_interes || 'No especificado'}</p>
    </div>
    <div>
      <p class="text-xs text-slate-400 font-medium">💰 Enganche Declarado:</p>
      <p class="font-medium text-slate-900">${lead.enganche || 'No declarado'}</p>
    </div>
    <div>
      <p class="text-xs text-slate-400 font-medium">💼 Situación Laboral:</p>
      <p class="font-medium text-slate-900">${lead.situacion_laboral || 'No capturada'}</p>
    </div>
    <div>
      <p class="text-xs text-slate-400 font-medium">📊 Historial Crediticio (Buró):</p>
      <p class="font-medium text-slate-900">${lead.historial_crediticio || 'Sin evaluar'}</p>
    </div>
    <div>
      <p class="text-xs text-slate-400 font-medium">📅 Presupuesto Mensual:</p>
      <p class="font-medium text-slate-900">${lead.presupuesto_mensual || 'No calculado'}</p>
    </div>
    <div class="mt-4 pt-3 border-t border-slate-200 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
      <p class="text-xs text-emerald-700 font-bold uppercase tracking-wider">📅 Cita de Manejo / Visita:</p>
      <p class="text-sm font-semibold text-emerald-900 mt-0.5">${lead.fecha_cita ? lead.fecha_cita : '❌ Sin cita asignada aún'}</p>
    </div>
  `;

  if (overlay) overlay.classList.remove("hidden");
  drawer.classList.remove("translate-x-full");
}