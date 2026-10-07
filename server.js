const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

// Helmet aplica HSTS, protección contra iframes, MIME sniffing y otras
// cabeceras. CSP queda desactivada hasta retirar los scripts/estilos inline
// y fijar una política compatible con los proveedores externos usados.
app.use(helmet({ contentSecurityPolicy: false }));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Límite de peticiones por IP — mitiga scraping/fuerza bruta.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

const registerRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }
});

// Crea Auth y el lote desde el servidor. Auth y PostgREST no comparten una
// transacción SQL; si el INSERT falla se compensa eliminando al usuario Auth
// recién creado. La service-role key nunca llega al navegador.
app.post('/api/register-lote', registerRateLimit, express.json({ limit: '20kb' }), async (req, res) => {
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appBaseUrl = process.env.APP_BASE_URL;
  const { email, password, datosLote, legalConsent } = req.body || {};

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appBaseUrl) {
    return res.status(503).json({ code: 'REGISTRATION_NOT_CONFIGURED', message: 'El registro no está configurado en el servidor. Contacta soporte.' });
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ code: 'INVALID_EMAIL', message: 'Escribe un correo válido.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ code: 'INVALID_PASSWORD', message: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  if (!datosLote || typeof datosLote !== 'object' || Array.isArray(datosLote) || !String(datosLote.nombre || '').trim()) {
    return res.status(400).json({ code: 'INVALID_LOTE', message: 'Revisa los datos obligatorios del lote.' });
  }
  if (legalConsent?.terms !== true || legalConsent?.privacy !== true || !legalConsent?.version) {
    return res.status(400).json({ code: 'LEGAL_CONSENT_REQUIRED', message: 'Debes aceptar los Términos del servicio y el Aviso de privacidad.' });
  }

  let redirectUrl;
  try {
    redirectUrl = new URL(appBaseUrl);
    if (redirectUrl.protocol !== 'https:' && redirectUrl.hostname !== 'localhost') throw new Error('unsafe origin');
  } catch (_) {
    return res.status(503).json({ code: 'INVALID_APP_BASE_URL', message: 'La URL de confirmación no está configurada correctamente.' });
  }

  const allowedLoteFields = [
    'nombre', 'whatsapp_number', 'direccion', 'ciudad', 'estado', 'hora_abre', 'hora_cierra',
    'dias_atencion', 'rfc', 'razon_social', 'cp_fiscal', 'regimen_fiscal', 'uso_cfdi',
    'tipo_financiamiento', 'financieras', 'plazos_meses', 'tasa_anual',
    'enganche_minimo_pct', 'acepta_buro_afectado'
  ];
  const lote = Object.fromEntries(allowedLoteFields
    .filter((field) => Object.hasOwn(datosLote, field))
    .map((field) => [field, datosLote[field]]));
  lote.nombre = String(lote.nombre).trim();
  lote.email_admin = email.trim().toLowerCase();

  const headers = { apikey: anonKey, 'Content-Type': 'application/json' };
  let createdUserId = null;
  try {
    const signupUrl = new URL(`${supabaseUrl}/auth/v1/signup`);
    signupUrl.searchParams.set('redirect_to', redirectUrl.toString());
    const authResponse = await fetch(signupUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        data: { legal_consent: legalConsent }
      })
    });
    const authResult = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || !authResult.user?.id) {
      const message = String(authResult.msg || authResult.message || authResult.error_description || 'No se pudo crear la cuenta.').toLowerCase();
      const duplicate = /already|registered|exists|duplicate|already been registered/.test(message);
      return res.status(duplicate ? 422 : (authResponse.status >= 500 ? 502 : authResponse.status)).json({
        code: duplicate ? 'EMAIL_ALREADY_REGISTERED' : 'AUTH_SIGNUP_FAILED',
        message: duplicate ? 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.' : (authResult.msg || authResult.message || 'No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.')
      });
    }
    createdUserId = authResult.user.id;

    const lotResponse = await fetch(`${supabaseUrl}/rest/v1/lotes?select=*`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ profile_id: createdUserId, ...lote })
    });
    const lotResult = await lotResponse.json().catch(() => null);
    if (!lotResponse.ok || !Array.isArray(lotResult) || !lotResult[0]) {
      const missingEmailAdmin = lotResponse.status === 400 && /email_admin/i.test(JSON.stringify(lotResult));
      let rollbackOk = false;
      try {
        // Limpia primero por si la petición REST alcanzó a guardar antes de
        // perder la respuesta; borrar por profile_id es idempotente.
        const lotCleanup = await fetch(`${supabaseUrl}/rest/v1/lotes?profile_id=eq.${encodeURIComponent(createdUserId)}`, {
          method: 'DELETE',
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
        });
        const deleteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(createdUserId)}`, {
          method: 'DELETE',
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
        });
        rollbackOk = (lotCleanup.ok || lotCleanup.status === 404) && (deleteResponse.ok || deleteResponse.status === 404);
      } catch (rollbackError) {
        console.error('[Registro] Falló la compensación de Auth:', rollbackError.message);
      }
      if (!rollbackOk) console.error('[Registro] Cuenta Auth creada pero no se pudo confirmar su limpieza tras fallar el lote.');
      console.error('[Registro] Falló la creación del lote:', lotResponse.status, lotResult?.code || 'database_error');
      return res.status(missingEmailAdmin ? 503 : 422).json({
        code: missingEmailAdmin ? 'EMAIL_ADMIN_COLUMN_MISSING' : 'LOTE_CREATE_FAILED',
        rollbackOk,
        message: !rollbackOk
          ? 'No se pudo guardar el lote ni completar la limpieza automática de la cuenta. Contacta soporte antes de intentar registrarte otra vez.'
          : missingEmailAdmin
            ? 'Falta la columna email_admin en Supabase. La cuenta temporal se limpió; aplica la migración del esquema e inténtalo de nuevo.'
            : 'No se pudo guardar la información del lote. La cuenta temporal se limpió; revisa los datos e inténtalo de nuevo.'
      });
    }

    return res.status(201).json({
      user: { id: createdUserId, email: authResult.user.email },
      lote: lotResult[0],
      session: authResult.session || null,
      requiresEmailConfirmation: !authResult.session
    });
  } catch (error) {
    console.error('[Registro] Error de conexión creando cuenta/lote:', error.message);
    let cleanupOk = !createdUserId;
    if (createdUserId) {
      try {
        const lotCleanup = await fetch(`${supabaseUrl}/rest/v1/lotes?profile_id=eq.${encodeURIComponent(createdUserId)}`, {
          method: 'DELETE',
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
        });
        const cleanup = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(createdUserId)}`, {
          method: 'DELETE',
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
        });
        cleanupOk = (lotCleanup.ok || lotCleanup.status === 404) && (cleanup.ok || cleanup.status === 404);
        if (!cleanupOk) console.error('[Registro] No se pudo limpiar la cuenta tras una excepción de red.');
      } catch (cleanupError) {
        console.error('[Registro] Error limpiando cuenta Auth:', cleanupError.message);
      }
    }
    return res.status(502).json({
      code: cleanupOk ? 'REGISTRATION_NETWORK_ERROR' : 'REGISTRATION_CLEANUP_FAILED',
      cleanupOk,
      message: cleanupOk
        ? 'No se pudo completar el registro por un problema de conexión. Inténtalo de nuevo.'
        : 'La conexión falló y no se pudo confirmar la limpieza automática. Contacta soporte antes de volver a registrarte.'
    });
  }
});

// Crea una sesión corta del portal de Stripe. El usuario y su lote se
// validan con Supabase usando su propio JWT; nunca se acepta un customer_id
// enviado por el navegador.
app.post('/api/stripe-portal', express.json({ limit: '10kb' }), async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const appBaseUrl = process.env.APP_BASE_URL;
  const authorization = req.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!supabaseUrl || !supabaseAnonKey || !stripeSecretKey || !appBaseUrl) {
    return res.status(503).json({ message: 'El portal de facturación no está configurado.' });
  }
  if (!token) return res.status(401).json({ message: 'Inicia sesión para gestionar tu plan.' });
  if (typeof req.body?.lote_id !== 'string' || !req.body.lote_id) {
    return res.status(400).json({ message: 'Falta el identificador del lote.' });
  }

  try {
    const userResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` }
    });
    if (!userResponse.ok) return res.status(401).json({ message: 'La sesión no es válida. Inicia sesión de nuevo.' });
    const user = await userResponse.json();

    const query = new URLSearchParams({
      select: 'id,stripe_customer_id',
      id: `eq.${req.body.lote_id}`,
      profile_id: `eq.${user.id}`,
      limit: '1'
    });
    const loteResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/lotes?${query}`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` }
    });
    if (!loteResponse.ok) throw new Error('No se pudo validar la cuenta del lote.');
    const lotes = await loteResponse.json();
    const customerId = lotes?.[0]?.stripe_customer_id;
    if (!customerId) return res.status(409).json({ message: 'Esta cuenta todavía no tiene un cliente de Stripe vinculado.' });

    const baseUrl = new URL(appBaseUrl);
    if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost') {
      return res.status(503).json({ message: 'La URL de retorno de la aplicación no es segura.' });
    }
    const stripeBody = new URLSearchParams({ customer: customerId, return_url: baseUrl.toString() });
    const stripeResponse = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${stripeSecretKey}:`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: stripeBody
    });
    const portal = await stripeResponse.json();
    if (!stripeResponse.ok || !portal.url) {
      console.error('[Stripe Portal] Error de Stripe:', portal.error?.type || stripeResponse.status);
      return res.status(502).json({ message: 'Stripe no pudo abrir el portal de facturación.' });
    }
    return res.json({ url: portal.url });
  } catch (error) {
    console.error('[Stripe Portal] Error creando sesión:', error.message);
    return res.status(502).json({ message: 'No se pudo abrir el portal de facturación.' });
  }
});

// Health check para Railway.
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Publica solo los recursos que necesita el navegador. No expongas por error
// server.js, package.json, archivos de configuración ni flujos de n8n.
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/ui-feedback.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.type('application/javascript').sendFile(path.join(__dirname, 'ui-feedback.js'));
});
app.get('/dashboard.js', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.js')));
app.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json').sendFile(path.join(__dirname, 'manifest.webmanifest'));
});
app.get('/icons/icon-192.png', (req, res) => res.sendFile(path.join(__dirname, 'public', 'icon-192.png')));
app.get('/icons/icon-512.png', (req, res) => res.sendFile(path.join(__dirname, 'public', 'icon-512.png')));
app.get('/sw.js', (req, res) => {
  // El SW solo hace peticiones de red; no almacena páginas ni datos privados.
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache');
  res.type('application/javascript').sendFile(path.join(__dirname, 'sw.js'));
});

// Fallback de SPA: cualquier otra ruta recibe el mismo dashboard.html,
// para que tu JS decida qué vista mostrar (login/registro/dashboard).
// Uso sendFile, NO res.redirect: un redirect cambia la URL que ve el
// navegador y es justo lo que puede perder el fragmento #access_token
// que manda Supabase en los links de sesión — sendFile mantiene la URL
// (y el fragmento) exactamente como llegó.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[VeloDrive] Servidor de producción corriendo en puerto ${PORT}`);
  });
}

module.exports = app;
