const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btnSubmit = document.getElementById('btn-submit');
  const errorDiv = document.getElementById('login-error');

  // Estado de carga
  btnSubmit.textContent = "Verificando...";
  btnSubmit.disabled = true;
  errorDiv.style.display = "none";

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Si todo jala bien, acceso concedido al panel operativo
    window.location.href = 'dashboard.html';

  } catch (error) {
    console.error(error);
    errorDiv.textContent = "Credenciales de acceso incorrectas o error de conexión.";
    errorDiv.style.display = "block";
    btnSubmit.textContent = "Iniciar Sesión";
    btnSubmit.disabled = false;
  }
});