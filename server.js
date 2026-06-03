const express = require('express');
const { createClient } = require('@supabase/supabase-client');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// API: Obtener autos del inventario
app.get('/api/cars', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cars')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Registrar un auto nuevo desde el formulario del dashboard
app.post('/api/cars', async (req, res) => {
    try {
        const { brand, model, year, price, image_url } = req.body;
        const { data, error } = await supabase
            .from('cars')
            .insert([{ brand, model, year, price: Number(price), image_url, status: 'disponible' }]);
        if (error) throw error;
        res.status(201).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Cambiar estado a Vendido
app.patch('/api/cars/:id/vendido', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('cars')
            .update({ status: 'vendido' })
            .eq('id', id);
        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Ruta nueva para el flujo de prospectos desde n8n/Google Forms
app.get('/api/leads', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('leads')
            .select('id, phone_number, auto_interes, status, created_at, nombre, enganche, situacion_laboral')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor Proyecto360 corriendo en puerto ${PORT}`);
});