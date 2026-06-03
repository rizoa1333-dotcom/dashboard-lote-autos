const SUPABASE_URL = "https://deljncdcddfghfihuumd.supabase.co";
const SUPABASE_KEY = "sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btnSubmit = document.getElementById('btn-submit');
    const errorDiv = document.getElementById('login-error');

    btnSubmit.textContent = "Verificando...";
    btnSubmit.disabled = true;
    errorDiv.style.display = "none";

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        errorDiv.textContent = "Credenciales de acceso incorrectas.";
        errorDiv.style.display = "block";
        btnSubmit.textContent = "Iniciar Sesión";
        btnSubmit.disabled = false;
    } else {
        window.location.href = "/dashboard.html";
    }
});

window.onload = async () => {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) window.location.href = "/dashboard.html";
};