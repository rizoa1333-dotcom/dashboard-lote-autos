// ============================================================
// PROJECT 360 - dashboard.js (PROD CONECTADO A SUPABASE VIVO)
// ============================================================

const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';

// Usamos el cliente global provisto por el script del HTML
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Almacén local de datos descargados para el Drawer
let localLeadsCache = [];

// ============================================================
// INICIALIZACIÓN GENERAL
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initSidebar();
  initNavigation();
  initDrawer();
  
  // Ejecutamos las consultas reales a Supabase
  fetchAndRenderAll();
  
  // Realtime Opcional: Recargar cada 10 segundos para ver cambios del bot en vivo
  setInterval(fetchAndRenderAll, 10000);
});

async function fetchAndRenderAll() {
  await renderLeadsAndCounters();
  await renderCars();
}

// ============================================================
// SIDEBAR MÓVIL
// ============================================================
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  const openBtn = document.getElementById("openSidebar");
  const closeBtn = document.getElementById("closeSidebar");

  const open = () => {
    sidebar.classList.remove("-translate-x-full");
    overlay.classList.remove("hidden");
  };
  const close = () => {
    sidebar.classList.add("-translate-x-full");
    overlay.classList.add("hidden");
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
  // 1. Descargamos todos los leads de la tabla real
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*');

  if (error) {
    console.error("Error cargando leads de Supabase:", error);
    return;
  }

  localLeadsCache = leads || [];

  // Containers del HTML
  const containerLeadsList = document.getElementById("leadsList");
  const containerCitasList = document.getElementById("citasListContainer");
  const containerMonitorMensajes = document.getElementById("monitorMensajesContainer");

  // Limpieza inicial
  containerLeadsList.innerHTML = "";
  if (containerCitasList) containerCitasList.innerHTML = "";
  if (containerMonitorMensajes) containerMonitorMensajes.innerHTML = "";

  // Variables para contadores analíticos
  let totalCalificadosPendientes = 0;
  let totalCitasHoy = 0;
  let countNuevo = 0;
  let countPendiente = 0;
  let countCita = 0;

  localLeadsCache.forEach((lead) => {
    // Clasificación para el Pipeline
    if (lead.fecha_cita) {
      countCita++;
      totalCitasHoy++;
    } else if (lead.status === 'Pendiente') {
      countPendiente++;
    } else {
      countNuevo++;
    }

    // A: Pintar en Monitor de Leads Precalificados (Solo si status === 'Pendiente')
    if (lead.status === 'Pendiente') {
      totalCalificadosPendientes++;
      
      const row = document.createElement("div");
      row.className = "lead-row flex items-center justify-between gap-3 bg-white";
      row.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <span class="score-badge score-high">★</span>
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">${lead.name || 'Prospecto Anónimo'}</p>
            <p class="text-xs text-slate-400 truncate">${lead.auto_interes || 'Sin auto definido'} • Enganche: ${lead.enganche || 'Pendiente'}</p>
          </div>
        </div>
        <button class="btn-ghost flex-shrink-0" data-lead-id="${lead.id}">
          Ver Perfil Pro
        </button>
      `;
      containerLeadsList.appendChild(row);
    }

    // B: Pintar en pestaña de Citas Agendadas (Si tiene fecha_cita)
    if (lead.fecha_cita && containerCitasList) {
      const rowCita = document.createElement("div");
      rowCita.className = "flat-row flex items-center justify-between bg-white";
      rowCita.innerHTML = `
        <div>
          <p class="text-sm font-medium">${lead.name || 'Interesado'}</p>
          <p class="text-xs text-slate-400">${lead.auto_interes || 'Unidad'} • Hora asignada: <strong class="text-slate-900">${lead.fecha_cita}</strong></p>
        </div>
        <span class="status-pill status-green">Agendada</span>
      `;
      containerCitasList.appendChild(rowCita);
    }

    // C: Pintar en pestaña de Módulo de Mensajes
    if (containerMonitorMensajes) {
      const rowMsg = document.createElement("div");
      rowMsg.className = "flat-row bg-white";
      rowMsg.innerHTML = `
        <p class="text-sm"><span class="font-medium">${lead.phone_number || 'Sin Teléfono'}</span> — <span class="text-xs text-slate-400">Paso Encuesta: ${lead.encuesta_step || 0}</span></p>
        <p class="text-xs text-slate-500 mt-1">Interés en: ${lead.auto_interes || 'No especificado'} | Situación: ${lead.situacion_laboral || 'No capturada'}</p>
      `;
      containerMonitorMensajes.appendChild(rowMsg);
    }
  });

  // Mensajes de lista vacía por seguridad
  if (totalCalificadosPendientes === 0) {
    containerLeadsList.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No hay leads precalificados pendientes en este momento.</p>`;
  }
  if (containerCitasList && totalCitasHoy === 0) {
    containerCitasList.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No hay ninguna cita registrada en la base de datos.</p>`;
  }

  // 3. Renderizar los contadores superiores globales
  document.getElementById("leadsCount").textContent = totalCalificadosPendientes;
  document.getElementById("citasCount").textContent = totalCitasHoy;

  // 4. Actualizar textos del Pipeline de Ventas dinámicamente
  document.getElementById("pipeNuevo").textContent = `${countNuevo} conversaciones activas`;
  document.getElementById("pipePendiente").textContent = `${countPendiente} leads listos en Dashboard`;
  document.getElementById("pipeCita").textContent = `${countCita} citas confirmadas`;

  // Listener para abrir el Drawer con datos extendidos
  containerLeadsList.querySelectorAll("[data-lead-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openDrawer(btn.dataset.leadId);
    });
  });
}

// ============================================================
// CONTROL DE INVENTARIO DESDE SUPABASE REAL
// ============================================================
async function renderCars() {
  const { data: cars, error } = await supabase
    .from('cars')
    .select('*');

  if (error) {
    console.error("Error cargando inventario de Supabase:", error);
    return;
  }

  const tbody = document.getElementById("carsTableBody");
  tbody.innerHTML = "";

  document.getElementById("carsCount").textContent = cars ? cars.length : 0;

  const statusClassMap = {
    Disponible: "status-green",
    Apartado: "status-yellow",
    Vendido: "status-gray",
  };

  if (!cars || cars.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-xs text-slate-400 py-4">Sin autos en el inventario de Supabase.</td></tr>`;
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
// DRAWER EXTENDIDO: MOSTRAR DETALLES DE LA ENCUESTA DE WHATSAPP
// ============================================================
function initDrawer() {
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const closeBtn = document.getElementById("closeDrawer");

  const close = () => {
    drawer.classList.add("translate-x-full");
    overlay.classList.add("hidden");
  };

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (overlay) overlay.addEventListener("click", close);

  window._closeDrawer = close;
}

function openDrawer(leadId) {
  // Buscamos el lead guardado localmente en la caché
  const lead = localLeadsCache.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const subtitle = document.getElementById("drawerSubtitle");
  const containerExtended = document.getElementById("drawerExpandedData");

  subtitle.textContent = `ID Lead: ${lead.id} • Teléfono: ${lead.phone_number || 'Desconocido'}`;
  
  // Imprimir todas las nuevas respuestas de la encuesta de WhatsApp de manera elegante
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
      <p class="text-sm font-semibold text-emerald-900 mt-0.5">${lead.fecha_cita ? lead.fecha_cita : '❌ Aún no agenda cita'}</p>
    </div>
  `;

  overlay.classList.remove("hidden");
  drawer.classList.remove("translate-x-full");
}