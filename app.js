document.addEventListener("DOMContentLoaded", () => {
    // Menú retráctil
    const btnMenu = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');

    btnMenu.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        btnMenu.textContent = sidebar.classList.contains('active') ? '✕ Cerrar' : '☰ Opciones';
    });

    // Auto-conexión inmediata
    const url = "https://deljncdcddfghfihuumd.supabase.co";
    const key = "sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-"; 
    
    if (window.supabase) {
        supabaseClient = supabase.createClient(url, key);
        conectarEcosistema();
    }
});

let supabaseClient = null;

async function conectarEcosistema() {
    if (Notification.permission !== "denied") Notification.requestPermission();
    await Promise.all([cargarInventario(), cargarCitas()]);

    supabaseClient.channel('realtime').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'citas' }, async (p) => {
        if (Notification.permission === "granted") new Notification("¡Nueva Cita!", { body: `${p.new.nombre_cliente} - ${p.new.auto_interes}` });
        await cargarCitas();
    }).subscribe();
}

async function cargarInventario() {
    const { data: autos } = await supabaseClient.from('cars').select('*');
    document.getElementById("total-autos").innerText = autos ? autos.length : 0;
    document.getElementById("contenedor-autos").innerHTML = autos?.map(a => `<div class="auto-block"><div><h4>${a.brand}</h4><div class="auto-price">$${a.price}</div></div></div>`).join('') || '';
}

async function cargarCitas() {
    const { data: citas } = await supabaseClient.from('citas').select('*');
    document.getElementById("contenedor-citas").innerHTML = citas?.map(c => `<div class="cita-block"><h4>${c.auto_interes}</h4><p>${c.nombre_cliente}</p></div>`).join('') || '';
}
