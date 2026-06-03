const express = require('express');
const { createClient } = require('@supabase/supabase-client');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Supabase utilizando tus variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middlewares básicos
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ENDPOINT: Obtener todos los prospectos con sus respuestas del formulario
app.get('/api/leads', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('leads')
            .select('id, phone_number, auto_interes, status, created_at, nombre, enganche, situacion_laboral')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        res.status(200).json(data);
    } catch (error) {
        console.error('Error al obtener leads de Supabase:', error);
        res.status(500).json({ error: 'Error interno del servidor al consultar prospectos' });
    }
});

// Ruta para servir el archivo principal del dashboard
app.get('*', (pathReq, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Inicializar Servidor
app.listen(PORT, () => {
    console.log(`Servidor de Proyecto360 corriendo en el puerto ${PORT}`);
});