const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos desde el directorio actual (o 'public' si decides moverlos)
app.use(express.static(path.join(__dirname)));

// Ruteador comodín: SPA Routing Catch-All
// Sirve dashboard.html sin redirecciones HTTP que puedan destruir los hashes de la URL (#)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 PROJECT 360 Server corriendo en el puerto ${PORT}`);
    console.log(`➡️  Accede a http://localhost:${PORT}`);
});