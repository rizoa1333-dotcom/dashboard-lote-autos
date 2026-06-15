const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Sirve archivos estáticos
app.use(express.static(__dirname));

// La raíz entrega directamente la SPA unificada
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html')); 
});

// ESCUDO EXTRA: Si alguien escribe /index.html o /login.html por error, redirige a la raíz
app.get(['/index.html', '/login.html', '/registro.html', '/dashboard.html'], (req, res) => {
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`Servidor de PROJECT 360 corriendo exitosamente en el puerto ${PORT}`);
});