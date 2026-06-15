const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Servir la carpeta raíz de forma estática
app.use(express.static(path.join(__dirname)));

// Forzar la carga del core del Dashboard en la raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Redirecciones explícitas a la raíz para evitar fallos de rutas
app.get(['/index.html', '/login.html', '/registro.html', '/dashboard.html'], (req, res) => {
  res.redirect('/');
});

// Guardián de rutas comodín: Mantiene intactos los parámetros hash (#access_token) de Supabase
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`[PROJECT 360] Servidor de producción corriendo en puerto ${PORT}`);
});