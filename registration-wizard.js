
  // ── WIZARD DE REGISTRO ──────────────────────────────────────────────────
  (function() {
    let currentStep = 1;
    const totalSteps = 4;

    function showStep(step) {
      for (let i = 1; i <= totalSteps; i++) {
        const el = document.getElementById('wizardStep' + i);
        if (el) el.classList.toggle('hidden', i !== step);
        const dot = document.querySelector('[data-step="' + i + '"]');
        if (dot) {
          dot.classList.remove('active', 'done');
          if (i === step) dot.classList.add('active');
          else if (i < step) dot.classList.add('done');
        }
      }
      currentStep = step;
      // Actualizar precio al llegar a paso 2
      if (step === 2) triggerPrecio();
      // Actualizar resumen al llegar a paso 4
      if (step === 4) actualizarResumen();
    }

    function triggerPrecio() {
      const estado = document.getElementById('registroEstado').value;
      const box = document.getElementById('registroPrecioBox');
      const txt = document.getElementById('registroPrecioTexto');
      if (estado && box && txt) {
        const precio = new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(window.VELODRIVE_PLAN_PRICE_MXN);
        txt.textContent = window.VELODRIVE_STRIPE_TEST_MODE
          ? `Prueba: ${precio} al mes · sin cobro real`
          : window.VELODRIVE_STRIPE_LIVE_QA_MODE
            ? `Prueba con cobro real: ${precio} al mes · recurrente`
            : `${precio} + IVA`;
        box.classList.remove('hidden');
      }
    }

    function actualizarResumen() {
      const nombre = document.getElementById('registroNombreLote').value || '—';
      const ciudad = document.getElementById('registroCiudad').value || '';
      const estado = document.getElementById('registroEstado').value || '';
      const abre   = document.getElementById('registroHoraAbre').value || '';
      const cierra = document.getElementById('registroHoraCierra').value || '';
      const tipo   = document.querySelector('input[name="tipoFinanciamiento"]:checked');

      const elN = document.getElementById('resumenNombre');
      const elU = document.getElementById('resumenUbicacion');
      const elH = document.getElementById('resumenHorario');
      const elF = document.getElementById('resumenFinanciamiento');

      if (elN) elN.textContent = nombre;
      if (elU) elU.textContent = [ciudad, estado].filter(Boolean).join(', ') || '—';
      if (elH) elH.textContent = (abre && cierra) ? abre + ' – ' + cierra : '—';
      if (elF && tipo) {
        const labels = { propio: 'Propio', financiera: 'Financiera externa', ambos: 'Propio + Financiera', ninguno: 'Solo contado' };
        elF.textContent = labels[tipo.value] || '—';
      }
    }

    function validateStep(step) {
      const errEl = document.getElementById('registroError');
      errEl.classList.add('hidden');
      errEl.textContent = '';

      if (step === 1) {
        const nombre  = document.getElementById('registroNombreLote').value.trim();
        const phone   = document.getElementById('registroPhoneLote').value.trim();
        const dir     = document.getElementById('registroDireccion').value.trim();
        const ciudad  = document.getElementById('registroCiudad').value.trim();
        const estado  = document.getElementById('registroEstado').value;
        const dias    = document.querySelectorAll('#diasAtencionGroup input:checked');
        if (!nombre)  { showError('Ingresa el nombre comercial del lote.'); return false; }
        if (!phone)   { showError('Ingresa el teléfono de WhatsApp del lote.'); return false; }
        if (!dir)     { showError('Ingresa la dirección del lote.'); return false; }
        if (!ciudad)  { showError('Ingresa la ciudad.'); return false; }
        if (!estado)  { showError('Selecciona el estado.'); return false; }
        if (dias.length === 0) { showError('Selecciona al menos un día de atención.'); return false; }
      }
      if (step === 2) {
        const rfc = document.getElementById('registroRFC').value.trim();
        const rs  = document.getElementById('registroRazonSocial').value.trim();
        const cp  = document.getElementById('registroCP').value.trim();
        if (!rfc) { showError('Ingresa el RFC.'); return false; }
        if (!rs)  { showError('Ingresa la razón social.'); return false; }
        if (!/^\d{5}$/.test(cp)) { showError('El código postal debe tener 5 dígitos.'); return false; }
      }
      if (step === 4) {
        const email = document.getElementById('registroEmail').value.trim();
        const pass  = document.getElementById('registroPassword').value;
        if (!email)       { showError('Ingresa tu correo electrónico.'); return false; }
        if (pass.length < 8) { showError('La contraseña debe tener al menos 8 caracteres.'); return false; }
      }
      return true;
    }

    function showError(msg) {
      const errEl = document.getElementById('registroError');
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    }

    // Mostrar/ocultar detalles de financiamiento
    function toggleFinDetalles() {
      const tipo = document.querySelector('input[name="tipoFinanciamiento"]:checked');
      const wrap = document.getElementById('finDetallesWrap');
      if (wrap) wrap.classList.toggle('hidden', tipo && tipo.value === 'ninguno');
    }

    document.addEventListener('DOMContentLoaded', function() {
      // Navegación wizard
      document.getElementById('wizardNext1')?.addEventListener('click', function() {
        if (validateStep(1)) showStep(2);
      });
      document.getElementById('wizardPrev2')?.addEventListener('click', function() { showStep(1); });
      document.getElementById('wizardNext2')?.addEventListener('click', function() {
        if (validateStep(2)) showStep(3);
      });
      document.getElementById('wizardPrev3')?.addEventListener('click', function() { showStep(2); });
      document.getElementById('wizardNext3')?.addEventListener('click', function() { showStep(4); });
      document.getElementById('wizardPrev4')?.addEventListener('click', function() { showStep(3); });

      // Toggle financiamiento
      document.querySelectorAll('input[name="tipoFinanciamiento"]').forEach(function(el) {
        el.addEventListener('change', toggleFinDetalles);
      });

      // Estado → precio
      document.getElementById('registroEstado')?.addEventListener('change', triggerPrecio);
    });

    // Exponer para uso de dashboard.js
    window._wizardGetDatosLote = function() {
      const diasChecked = Array.from(document.querySelectorAll('#diasAtencionGroup input:checked')).map(e => e.value);
      const financierasChecked = Array.from(document.querySelectorAll('#financierasGroup input:checked')).map(e => e.value);
      const plazosChecked = Array.from(document.querySelectorAll('#plazosGroup input:checked')).map(e => e.value);
      const tipoFin = document.querySelector('input[name="tipoFinanciamiento"]:checked')?.value || 'ninguno';
      const aceptaBuro = document.querySelector('input[name="aceptaBuro"]:checked')?.value || 'depende';
      return {
        nombre:          document.getElementById('registroNombreLote').value.trim(),
        whatsapp_number: document.getElementById('registroPhoneLote').value.trim(),
        direccion:       document.getElementById('registroDireccion').value.trim(),
        ciudad:          document.getElementById('registroCiudad').value.trim(),
        estado:          document.getElementById('registroEstado').value,
        hora_abre:       document.getElementById('registroHoraAbre').value,
        hora_cierra:     document.getElementById('registroHoraCierra').value,
        dias_atencion:   diasChecked.join(', '),
        rfc:             document.getElementById('registroRFC').value.trim().toUpperCase(),
        razon_social:    document.getElementById('registroRazonSocial').value.trim(),
        cp_fiscal:       document.getElementById('registroCP').value.trim(),
        regimen_fiscal:  document.getElementById('registroRegimenFiscal').value,
        uso_cfdi:        document.getElementById('registroUsoCFDI').value,
        tipo_financiamiento: tipoFin,
        financieras:     financierasChecked.join(', '),
        plazos_meses:    plazosChecked.join(', '),
        tasa_anual:      parseFloat(document.getElementById('registroTasaAnual').value) || null,
        enganche_minimo_pct: parseFloat(document.getElementById('registroEngancheMin').value) || null,
        acepta_buro_afectado: aceptaBuro
      };
    };
  })();
  