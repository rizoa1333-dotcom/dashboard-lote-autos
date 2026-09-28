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
app.get('/dashboard.js', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.js')));

// Fallback de SPA: cualquier otra ruta recibe el mismo dashboard.html,
// para que tu JS decida qué vista mostrar (login/registro/dashboard).
// Uso sendFile, NO res.redirect: un redirect cambia la URL que ve el
// navegador y es justo lo que puede perder el fragmento #access_token
// que manda Supabase en los links de sesión — sendFile mantiene la URL
// (y el fragmento) exactamente como llegó.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`[VeloDrive] Servidor de producción corriendo en puerto ${PORT}`);
});
