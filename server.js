const express = require('express');
const path = require('path');
const app = express();

// Railway te asigna un puerto dinámico mediante la variable de entorno process.env.PORT.
// Si corres de forma local, usará el puerto 3000.
const PORT = process.env.PORT || 3000;

// Sirve de forma automática todos tus archivos estáticos (HTML, JS, CSS, imágenes) 
// que se encuentren en la raíz del proyecto.
app.use(express.static(__dirname));

// Configura que cuando un usuario entre a la URL principal de tu app, 
// lo mande directo a la pantalla de Inicio de Sesión (Login)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Enciende el servidor para escuchar las peticiones de Railway
app.listen(PORT, () => {
    console.log(`Servidor de PROJECT 360 corriendo exitosamente en el puerto ${PORT}`);
});