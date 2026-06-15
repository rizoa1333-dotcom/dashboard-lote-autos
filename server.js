const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos de forma limpia
app.use(express.static(path.join(__dirname)));

// Enrutamiento SPA tradicional: Si el archivo existe lo sirve, si no va a la raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Comodín para interceptar recargas de página accidentales
app.get('*', (req, res) => {
  res.slice ? res.redirect('/') : res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`PROJECT 360 server running on port ${PORT}`);
});