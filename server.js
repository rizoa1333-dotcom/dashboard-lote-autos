const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Cabeceras de seguridad. La CSP real la define el <meta http-equiv> en
// dashboard.html; aquí se desactiva la CSP de helmet para no duplicarla
// con reglas divergentes, y se dejan el resto de protecciones (HSTS,
// noSniff, frameguard, etc.)
app.use(helmet({ contentSecurityPolicy: false }));

// Límite de peticiones por IP — mitiga scraping/fuerza bruta.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// Sirve los archivos reales (styles.css, dashboard.js, favicon, etc.)
// tal cual. Si la ruta pedida coincide con un archivo, Express lo entrega
// aquí y nunca llega al fallback de abajo.
app.use(express.static(path.join(__dirname)));

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