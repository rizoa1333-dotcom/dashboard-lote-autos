const express = require('express');
const app = express();
const path = require('path');

// Esto servirá los archivos desde la misma carpeta donde está el server.js
app.use(express.static(__dirname)); 

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));