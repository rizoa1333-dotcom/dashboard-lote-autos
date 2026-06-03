const express = require('express');
const app = express();
const path = require('path');

app.use(express.static('public')); // Mueve tu index.html, style.css y script.js a una carpeta llamada 'public'

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));