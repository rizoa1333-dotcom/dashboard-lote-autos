// Tus credenciales fijas y ocultas en el código
const SUPABASE_URL = "https://deljncdcddfghfihuumd.supabase.co";
const SUPABASE_KEY = "sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); // Evitar que la página recargue
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btnSubmit = document.getElementById('btn-submit');
    const errorDiv = document.getElementById('login-error');

    // UI de cargando...
    btnSubmit.textContent = "Verificando...";
    btnSubmit.disabled = true;
    errorDiv.style.display = "none";

    // 1. Intentar iniciar sesión con Supabase Auth
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        // Error de credenciales
        errorDiv.textContent = "Credenciales incorrectas. Intente de nuevo.";
        errorDiv.style.display = "block";
        btnSubmit.textContent = "Iniciar Sesión";
        btnSubmit.disabled = false;
    } else {
        // 2. Éxito: Guardar sesión y redirigir al Dashboard corporativo
        window.location.href = "/dashboard.html";
    }
});

// Comprobar si ya está logueado para saltar esta pantalla
window.onload = async () => {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
        window.location.href = "/dashboard.html";
    }
};