// ============================================================
// PROJECT 360 - dashboard.js
// Cliente Supabase
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// MOCK DATA (estructura idéntica a las tablas reales)
// Reemplazar por consultas reales cuando se conecten datos vivos.
// ============================================================

// Equivalente real: const { data } = await supabase.from('leads').select('*').order('score', { ascending: false });
const MOCK_LEADS = [
  { id: 1, name: "Roberto Gómez", vehicle_interest: "Chevrolet Aveo 2021", score: 9, down_payment: 45000 },
  { id: 2, name: "Ana Fernández", vehicle_interest: "VW Vento 2019", score: 8, down_payment: 50000 },
  { id: 3, name: "Luis Castillo", vehicle_interest: "Honda CR-V 2020", score: 6, down_payment: 30000 },
  { id: 4, name: "Patricia Núñez", vehicle_interest: "Nissan Versa 2022", score: 7, down_payment: 38000 },
];

// Equivalente real: const { data } = await supabase.from('cars').select('id, brand_model, year, price, status');
const MOCK_CARS = [
  { id: "CAR-001", brand_model: "VW Vento", year: 2019, price: 189000, status: "Disponible" },
  { id: "CAR-002", brand_model: "Chevrolet Aveo", year: 2021, price: 215000, status: "Apartado" },
  { id: "CAR-003", brand_model: "Honda CR-V", year: 2020, price: 398000, status: "Disponible" },
];

// Equivalente real: const { data } = await supabase.from('chat_history').select('*').eq('lead_id', leadId).order('created_at');
const MOCK_CHAT_HISTORY = {
  1: {
    budget_detected: 45000,
    messages: [
      { direction: "in", text: "Hola, vi el Aveo 2021 en Facebook, ¿sigue disponible?" },
      { direction: "out", text: "¡Hola Roberto! Sí, el Aveo 2021 está disponible. ¿Te gustaría agendar una cita para verlo?" },
      { direction: "in", text: "Sí, claro. Tengo $45,000 para enganche, ¿es suficiente?" },
      { direction: "out", text: "Con $45,000 de enganche entras perfecto al plan a 36 meses. ¿Agendamos para este sábado?" },
      { direction: "in", text: "Sí, por favor." },
    ],
  },
  2: {
    budget_detected: 50000,
    messages: [
      { direction: "in", text: "Buenas tardes, me interesa el Vento 2019." },
      { direction: "out", text: "¡Hola Ana! Con gusto. ¿Cuentas con enganche disponible?" },
      { direction: "in", text: "Sí, tengo $50,000 para enganche." },
    ],
  },
  3: {
    budget_detected: 30000,
    messages: [
      { direction: "in", text: "¿Cuánto de enganche piden para el CR-V?" },
      { direction: "out", text: "El enganche sugerido es de $30,000. ¿Te gustaría agendar una cita?" },
    ],
  },
  4: {
    budget_detected: 38000,
    messages: [
      { direction: "in", text: "Hola, ¿tienen el Versa 2022 en color blanco?" },
      { direction: "out", text: "¡Hola Patricia! Sí, contamos con una unidad blanca. ¿Quieres agendar para verla?" },
    ],
  },
};

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initSidebar();
  initNavigation();
  initDrawer();
  renderLeads();
  renderCars();
});

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

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", close);

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

      if (window.innerWidth < 768) {
        window._closeSidebar();
      }
    });
  });
}

// ============================================================
// MONITOR DE LEADS PRECALIFICADOS
// Tabla real: leads
// Consulta real: supabase.from('leads').select('id, name, vehicle_interest, score, down_payment').order('score', { ascending: false })
// ============================================================
async function renderLeads() {
  // const { data: leads, error } = await supabase
  //   .from('leads')
  //   .select('id, name, vehicle_interest, score, down_payment')
  //   .order('score', { ascending: false });
  // if (error) { console.error(error); return; }

  const leads = MOCK_LEADS; // sustituir por `leads` cuando se conecten datos vivos

  const container = document.getElementById("leadsList");
  container.innerHTML = "";

  leads.forEach((lead) => {
    const scoreClass = lead.score >= 8 ? "score-high" : "score-mid";

    const row = document.createElement("div");
    row.className = "lead-row flex items-center justify-between gap-3";
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <span class="score-badge ${scoreClass}">${lead.score}</span>
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${lead.name}</p>
          <p class="text-xs text-slate-400 truncate">${lead.vehicle_interest} • Enganche $${lead.down_payment.toLocaleString("es-MX")}</p>
        </div>
      </div>
      <button class="btn-ghost flex-shrink-0" data-lead-id="${lead.id}" data-lead-name="${lead.name}">
        Ver Historial
      </button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll("[data-lead-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openDrawer(btn.dataset.leadId, btn.dataset.leadName);
    });
  });
}

// ============================================================
// CONTROL DE INVENTARIO
// Tabla real: cars
// Consulta real: supabase.from('cars').select('id, brand_model, year, price, status')
// ============================================================
async function renderCars() {
  // const { data: cars, error } = await supabase
  //   .from('cars')
  //   .select('id, brand_model, year, price, status');
  // if (error) { console.error(error); return; }

  const cars = MOCK_CARS; // sustituir por `cars` cuando se conecten datos vivos

  const tbody = document.getElementById("carsTableBody");
  tbody.innerHTML = "";

  const statusClassMap = {
    Disponible: "status-green",
    Apartado: "status-yellow",
    "En proceso": "status-gray",
    Vendido: "status-gray",
  };

  cars.forEach((car) => {
    const pillClass = statusClassMap[car.status] || "status-gray";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-slate-400 font-mono text-xs">${car.id}</td>
      <td class="font-medium">${car.brand_model}</td>
      <td>${car.year}</td>
      <td>$${car.price.toLocaleString("es-MX")}</td>
      <td><span class="status-pill ${pillClass}">${car.status}</span></td>
      <td><button class="btn-ghost" data-edit-car="${car.id}">Editar</button></td>
    `;
    tbody.appendChild(tr);
  });

  // ============================================================
  // Edición de inventario
  // Acción real: abrir formulario y luego
  // supabase.from('cars').update({ ... }).eq('id', carId)
  // ============================================================
  tbody.querySelectorAll("[data-edit-car]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const carId = btn.dataset.editCar;
      console.log(`Editar unidad ${carId} — abrir formulario de edición y luego: supabase.from('cars').update({...}).eq('id', '${carId}')`);
    });
  });
}

// ============================================================
// DRAWER: HISTORIAL DE CONVERSACIÓN
// Tabla real: chat_history
// Consulta real: supabase.from('chat_history').select('*').eq('lead_id', leadId).order('created_at')
// ============================================================
function initDrawer() {
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const closeBtn = document.getElementById("closeDrawer");

  const close = () => {
    drawer.classList.add("translate-x-full");
    overlay.classList.add("hidden");
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", close);

  window._closeDrawer = close;
}

async function openDrawer(leadId, leadName) {
  // const { data: history, error } = await supabase
  //   .from('chat_history')
  //   .select('*')
  //   .eq('lead_id', leadId)
  //   .order('created_at', { ascending: true });
  // if (error) { console.error(error); return; }

  const record = MOCK_CHAT_HISTORY[leadId]; // sustituir por `history` cuando se conecten datos vivos

  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const subtitle = document.getElementById("drawerSubtitle");
  const budgetTag = document.getElementById("drawerBudgetTag");
  const messagesContainer = document.getElementById("drawerMessages");

  subtitle.textContent = `tabla: chat_history • lead_id: ${leadId} (${leadName})`;
  messagesContainer.innerHTML = "";

  if (record) {
    if (record.budget_detected) {
      budgetTag.classList.remove("hidden");
      budgetTag.querySelector(".status-pill").textContent =
        `Presupuesto detectado: $${record.budget_detected.toLocaleString("es-MX")}`;
    } else {
      budgetTag.classList.add("hidden");
    }

    record.messages.forEach((msg) => {
      const bubble = document.createElement("div");
      bubble.className = `drawer-msg ${msg.direction === "in" ? "in" : "out"}`;
      bubble.textContent = msg.text;
      messagesContainer.appendChild(bubble);
    });
  }

  overlay.classList.remove("hidden");
  drawer.classList.remove("translate-x-full");
}