document.addEventListener('DOMContentLoaded', () => {
    // Carga inicial nada más abrir el panel
    cargarFlujoProspectos();
    
    // Polling activo: Consulta cambios en la base de datos de manera transparente cada 10 segundos
    setInterval(cargarFlujoProspectos, 10000);
});

async function cargarFlujoProspectos() {
    const contenedor = document.getElementById('contenedor-prospectos');
    if (!contenedor) return;

    try {
        const respuesta = await fetch('/api/leads');
        if (!respuesta.ok) throw new Error('Error al conectar con la API de prospectos');
        
        const prospectos = await respuesta.json();

        // Validar si la tabla de Supabase está vacía
        if (prospectos.length === 0) {
            contenedor.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <p class="text-gray-400 text-sm italic">No hay prospectos registrados actualmente en el sistema.</p>
                </div>`;
            return;
        }

        contenedor.innerHTML = ''; // Limpiar placeholders o estados de carga previos

        prospectos.forEach(lead => {
            const esPerfilado = lead.status === 'perfilado';
            
            // Asignación estética del color del badge según el estado del Lead
            const badgeClase = esPerfilado 
                ? 'bg-purple-50 text-purple-700 border-purple-200' 
                : 'bg-amber-50 text-amber-700 border-amber-200';
            
            // Formatear la visualización del enganche y la situación laboral dinámicamente
            const mostrarEnganche = lead.enganche 
                ? `<span class="font-bold text-purple-700">$${Number(lead.enganche).toLocaleString('es-MX')} MXN</span>` 
                : '<span class="text-gray-400 italic">Sin rellenar formulario</span>';
                
            const mostrarTrabajo = lead.situacion_laboral 
                ? `<span class="font-semibold text-gray-800">${lead.situacion_laboral}</span>` 
                : '<span class="text-gray-400 italic">Pendiente</span>';

            // Construcción modular de la tarjeta en formato de cadena HTML
            const tarjetaHTML = `
                <div class="bg-white border border-gray-200 rounded-xl p-5 shadow-xs flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:border-gray-300">
                    <div>
                        <!-- Fila Superior: Nombre y Estatus -->
                        <div class="flex justify-between items-start gap-2 mb-3">
                            <h4 class="font-bold text-gray-900 text-base truncate pr-2" title="${lead.nombre || 'Interesado'}">
                                ${lead.nombre || 'Prospecto por WhatsApp'}
                            </h4>
                            <span class="text-[10px] px-2 py-0.5 rounded-full border ${badgeClase} font-bold tracking-wider uppercase whitespace-nowrap">
                                ${lead.status || 'nuevo'}
                            </span>
                        </div>

                        <!-- Información de Contacto -->
                        <p class="text-xs text-gray-500 mb-4 flex items-center gap-1.5">
                            <span>📱</span> <span class="font-semibold text-gray-700">${lead.phone_number}</span>
                        </p>

                        <!-- Bloque de Atributos de Perfilación Extraídos de n8n -->
                        <div class="bg-gray-50 rounded-lg p-3 space-y-2 text-xs border border-gray-100">
                            <div class="flex justify-between items-center">
                                <span class="text-gray-500">🚙 Auto de Interés:</span>
                                <span class="font-bold text-gray-800">${lead.auto_interes || 'No definido'}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-500">💰 Enganche Dispuesto:</span>
                                ${mostrarEnganche}
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-500">💼 Situación Laboral:</span>
                                ${mostrarTrabajo}
                            </div>
                        </div>
                    </div>

                    <!-- Metadatos Inferiores de Registro -->
                    <div class="mt-4 pt-3 border-t border-gray-100 text-[10px] text-gray-400 flex justify-between items-center">
                        <span>Lead ID: #${lead.id}</span>
                        <span>${new Date(lead.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' })}</span>
                    </div>
                </div>
            `;

            contenedor.insertAdjacentHTML('beforeend', tarjetaHTML);
        });

    } catch (error) {
        console.error('Error al renderizar el flujo de prospectos:', error);
        contenedor.innerHTML = `
            <div class="col-span-full text-center py-6">
                <p class="text-red-500 text-sm font-semibold">⚠️ Ocurrió un error al sincronizar el flujo de prospectos con Supabase.</p>
            </div>`;
    }
}