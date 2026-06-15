const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.getElementById('form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const nombreLote = document.getElementById('nombre-lote').value.trim();
  const ciudad = document.getElementById('ciudad').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const btnRegistrar = document.getElementById('btn-registrar');

  btnRegistrar.textContent = "Creando Ecosistema...";
  btnRegistrar.disabled = true;

  try {
    // 1. Crear el usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error("No se recibió respuesta del servidor de Auth.");

    // 2. Insertar el lote amarrando el profile_id con el UID del usuario creado
    // Nota: El 'id' del lote se genera solo en Supabase como UUID gracias al gen_random_uuid()
    const { error: loteError } = await supabase
      .from('lotes')
      .insert([
        {
          nombre: nombreLote,
          ciudad: ciudad,
          whatsapp_number: telefono,
          profile_id: authData.user.id
        }
      ]);

    if (loteError) throw loteError;

    alert('¡PROJECT 360: Lote configurado con éxito, hermano! Bienvenido.');
    window.location.href = 'dashboard.html';

  } catch (error) {
    console.error(error);
    alert('Error en el registro automático: ' + error.message);
    btnRegistrar.textContent = "Registrar Lote e Ingresar";
    btnRegistrar.disabled = false;
  }
});