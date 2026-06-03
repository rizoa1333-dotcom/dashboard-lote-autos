const express = require('express');
const path = require('path');
const app = express();

// 1. Servir todos los archivos estáticos (CSS, JS, HTML) desde la carpeta actual
app.use(express.static(path.resolve(__dirname)));

// 2. Ruta comodín: Si alguien entra a una ruta que no existe, lo mandamos al Login (index.html)
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

// 3. Iniciar el servidor en el puerto que asigne Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor activo y listo en el puerto ${PORT}`);
});