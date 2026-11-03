/* ════════════════════════════════════════════════════════════════
   EMOCIONA 5D — PACKS (en vigor desde el 1 de noviembre de 2026)
   Archivo común que usan: dashboard, sesiones, clientas, ingresos y facturas.

   Cómo se guarda un pack en la hoja "Respuestas de formulario 2026":
   · Una fila por sesión, como siempre.
   · AD "Pack"          → tipo de pack (vacío = sesión suelta)
   · AE "Pack ID"       → número común a todas las sesiones del pack (P-2026-001)
   · AF "Pack sesion"   → 1/3, 2/3, 3/3…
   · AG "Pack anuladas" → solo en la fila de la 1.ª sesión: cuántas sesiones del
                          pack se han marcado como "no realizadas"
   · El pack se cobra ENTERO en la 1.ª sesión: importe (L) y método (M) en esa fila.
   · Las demás sesiones van a 0 € sin método (salvo suplemento de sábado, 10 €).
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Índices de columna (A = 0)
  const COL = {
    PACK: 29,       // AD
    PACK_ID: 30,    // AE
    PACK_SES: 31,   // AF
    PACK_ANUL: 32   // AG
  };
  const LETRA = { PACK: 'AD', PACK_ID: 'AE', PACK_SES: 'AF', PACK_ANUL: 'AG' };
  const CABECERAS = { AD: 'Pack', AE: 'Pack ID', AF: 'Pack sesion', AG: 'Pack anuladas' };
  const RANGO_LECTURA = 'A:AG';

  // Los 4 packs. precioGemelar = pack + suplemento de embarazo múltiple con el mismo descuento.
  const TIPOS = {
    'Pack 2 sesiones Premium': {
      corto: 'Pack 2 Premium', sesiones: 2, precio: 137, precioGemelar: 164, suma: 152, fotos: 5,
      incluye: ['Ecosexo Emociona', 'Ecoemociona']
    },
    'Pack 2 sesiones Económico': {
      corto: 'Pack 2 Económico', sesiones: 2, precio: 122, precioGemelar: 149, suma: 136, fotos: 4,
      incluye: ['Ecosexo Emociona', 'Ecobasic Plus']
    },
    'Pack 3 sesiones Premium': {
      corto: 'Pack 3 Premium', sesiones: 3, precio: 186, precioGemelar: 224, suma: 219, fotos: 6,
      incluye: ['Ecosexo Emociona', 'Ecobasic', 'Ecoemociona']
    },
    'Pack 3 sesiones Económico': {
      corto: 'Pack 3 Económico', sesiones: 3, precio: 173, precioGemelar: 211, suma: 203, fotos: 5,
      incluye: ['Ecosexo Emociona', 'Ecobasic', 'Ecobasic Plus']
    }
  };
  const NOMBRES = Object.keys(TIPOS);

  const SUPLEMENTO_SABADO = 10;   // € por sesión en sábado (también dentro de un pack)
  const SUPLEMENTO_GEMELAR = 15;  // € por sesión suelta (en packs va incluido en precioGemelar)

  // Tarifas de sesiones sueltas (con IVA) a partir del 1/11/2026
  const FECHA_TARIFAS_NUEVAS = new Date(2026, 10, 1).getTime();
  const PRECIOS_NUEVOS = {
    'ecoconfirmación': 35, 'ecosexo': 42, 'ecosexo emociona': 57,
    'ecobasic': 67, 'ecobasic plus': 79, 'ecoemociona': 95
  };

  // ── Utilidades ──
  function txt(v) { return (v == null ? '' : String(v)).trim(); }

  function parseImporte(v) {
    return parseFloat(txt(v).replace(/€/g, '').replace(/\./g, function (m, i, s) {
      // "1.234,50" → quitar el punto de miles solo si después hay coma
      return s.indexOf(',') > -1 ? '' : m;
    }).replace(',', '.').trim()) || 0;
  }

  function parseFecha(str) {
    const p = txt(str).split(' ')[0].split('/');
    if (p.length !== 3) return 0;
    const d = parseInt(p[0], 10), m = parseInt(p[1], 10), a = parseInt(p[2], 10);
    if (isNaN(d) || isNaN(m) || isNaN(a)) return 0;
    return new Date(a, m - 1, d).getTime();
  }

  function esTarifaNueva(fechaStr) {
    const ts = parseFecha(fechaStr);
    return ts >= FECHA_TARIFAS_NUEVAS;
  }

  function normNombre(s) {
    return txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  }

  // Clave de clienta: últimos 9 dígitos del teléfono (col Q); si no hay, nombre + apellidos
  function claveClienta(fila) {
    const tel = txt(fila[16]).replace(/\D/g, '').slice(-9);
    if (tel.length === 9) return 'tel:' + tel;
    return 'nom:' + normNombre(txt(fila[0]) + ' ' + txt(fila[1]));
  }

  // Acepta también variantes escritas a mano ("pack3-premium", "Pack 3 premium"…)
  function normalizarTipo(valor) {
    const v = normNombre(valor).replace(/[-_]/g, ' ');
    if (!v) return '';
    const n = /3/.test(v) ? 3 : /2/.test(v) ? 2 : 0;
    const premium = /premium/.test(v);
    const econ = /econom/.test(v);
    if (!n || (!premium && !econ)) return '';
    return 'Pack ' + n + ' sesiones ' + (premium ? 'Premium' : 'Económico');
  }

  // Suplementos (col AA): "Gemelos", "Sábado", "Gemelos + Sábado" (y el antiguo "Fin de semana")
  function tieneGemelos(supl) { return /gemel|m[uú]ltiple/i.test(txt(supl)); }
  function tieneSabado(supl) { return /s[aá]bado|fin de semana/i.test(txt(supl)); }

  // Info de pack de UNA fila (null si es sesión suelta)
  function infoFila(fila) {
    const id = txt(fila[COL.PACK_ID]);
    const tipo = normalizarTipo(fila[COL.PACK]);
    if (!id || !tipo) return null;
    const def = TIPOS[tipo];
    const m = txt(fila[COL.PACK_SES]).match(/(\d+)\s*\/\s*(\d+)/);
    return {
      id: id,
      tipo: tipo,
      def: def,
      num: m ? parseInt(m[1], 10) : 0,
      total: def.sesiones,
      etiquetaSesion: m ? (m[1] + '/' + def.sesiones) : ('?/' + def.sesiones)
    };
  }

  // Fila del pack que NO lleva dinero (sesión 2/3, 3/3… ya pagada). Equivale a la antigua "regla 0 €".
  function esSesionPackSinCobro(fila) {
    return parseImporte(fila[11]) === 0 && txt(fila[12]) === '';
  }

  /* Construye el índice de todos los packs.
     entradas: [{ fila, sheetRow }]  (sheetRow = nº real de fila en la hoja)
     Devuelve { porId: {id → pack}, lista: [pack] } */
  function construirIndice(entradas) {
    const porId = {};
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    (entradas || []).forEach(function (e) {
      const info = infoFila(e.fila);
      if (!info) return;
      let p = porId[info.id];
      if (!p) {
        p = porId[info.id] = { id: info.id, tipo: info.tipo, def: info.def, total: info.total, sesiones: [], compra: null };
      }
      p.sesiones.push({ fila: e.fila, sheetRow: e.sheetRow, num: info.num, ts: parseFecha(e.fila[3]) });
    });
    Object.keys(porId).forEach(function (id) {
      const p = porId[id];
      p.sesiones.sort(function (a, b) { return (a.num || 99) - (b.num || 99) || a.ts - b.ts; });
      // Fila de compra = la 1/x; si no la hay, la que tiene importe; si no, la primera
      p.compra = p.sesiones.find(function (s) { return s.num === 1; })
              || p.sesiones.find(function (s) { return parseImporte(s.fila[11]) > 0; })
              || p.sesiones[0];
      p.clave = claveClienta(p.compra.fila);
      p.nombre = (txt(p.compra.fila[0]) + ' ' + txt(p.compra.fila[1])).trim();
      p.fechaCompra = txt(p.compra.fila[3]);
      p.importe = parseImporte(p.compra.fila[11]);
      p.metodo = txt(p.compra.fila[12]);
      p.anuladas = Math.max(0, parseInt(txt(p.compra.fila[COL.PACK_ANUL]), 10) || 0);
      p.usadas = p.sesiones.length;                                   // sesiones con fila (hechas o reservadas)
      p.hechas = p.sesiones.filter(function (s) { return s.ts && s.ts <= hoy.getTime() + 86399999; }).length;
      p.reservadas = p.usadas - p.hechas;                             // con fecha futura
      p.pendientes = Math.max(0, p.total - p.usadas - p.anuladas);    // aún por reservar
      p.cerrado = p.pendientes === 0;
      p.siguienteNum = Math.min(p.total, p.usadas + p.anuladas + 1);
      p.siguienteServicio = p.def.incluye[p.siguienteNum - 1] || '';
    });
    const lista = Object.keys(porId).map(function (k) { return porId[k]; })
      .sort(function (a, b) { return a.id.localeCompare(b.id); });
    return { porId: porId, lista: lista };
  }

  // Packs con sesiones por reservar de la misma clienta que esta fila
  function packsAbiertosDe(indice, fila) {
    const clave = claveClienta(fila);
    return indice.lista.filter(function (p) { return p.clave === clave && !p.cerrado; });
  }

  // Todos los packs de una clienta (abiertos y cerrados)
  function packsDeClienta(indice, fila) {
    const clave = claveClienta(fila);
    return indice.lista.filter(function (p) { return p.clave === clave; });
  }

  // Siguiente número de pack: P-AAAA-NNN (correlativo por año)
  function siguienteId(entradas, anio) {
    const pref = 'P-' + anio + '-';
    let max = 0;
    (entradas || []).forEach(function (e) {
      const id = txt(e.fila[COL.PACK_ID]);
      if (id.indexOf(pref) === 0) {
        const n = parseInt(id.slice(pref.length), 10);
        if (n > max) max = n;
      }
    });
    return pref + String(max + 1).padStart(3, '0');
  }

  // Precio que debería cobrarse en la fila de la 1.ª sesión
  function precioCompra(tipo, supl) {
    const def = TIPOS[normalizarTipo(tipo)];
    if (!def) return 0;
    return (tieneGemelos(supl) ? def.precioGemelar : def.precio) + (tieneSabado(supl) ? SUPLEMENTO_SABADO : 0);
  }

  // Precio que debería cobrarse en las sesiones 2.ª, 3.ª… (solo suplemento de sábado)
  function precioSesionSiguiente(supl) {
    return tieneSabado(supl) ? SUPLEMENTO_SABADO : 0;
  }

  function fmtEur(n) {
    return (Math.round(n * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
  }

  function textoEstado(p) {
    const partes = [];
    if (p.hechas) partes.push(p.hechas + ' hecha' + (p.hechas !== 1 ? 's' : ''));
    if (p.reservadas) partes.push(p.reservadas + ' reservada' + (p.reservadas !== 1 ? 's' : ''));
    if (p.anuladas) partes.push(p.anuladas + ' no realizada' + (p.anuladas !== 1 ? 's' : ''));
    if (p.pendientes) partes.push('queda' + (p.pendientes !== 1 ? 'n ' : ' ') + p.pendientes + ' por reservar');
    else partes.push('completo');
    return partes.join(' · ');
  }

  // Estilos compartidos para las etiquetas de pack
  function inyectarEstilos() {
    if (document.getElementById('packs-css')) return;
    const css = `
      .pack-badge { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600;
        padding:3px 8px; border-radius:10px; background:#F6E7F2; color:#A7228C; white-space:nowrap; }
      .pack-badge.cerrado { background:#EEF3F4; color:#6E8A91; }
      .pack-caja { background:#FBF5FA; border:1px solid #EBD3E5; border-radius:10px; padding:10px 12px; font-size:13px; color:#3C4A50; }
      .pack-caja .pack-linea { margin-top:4px; color:#6E8A91; font-size:12px; }
      .pack-caja .pack-aviso { margin-top:6px; color:#A7228C; font-size:12px; }
      .pack-acciones { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
      .pack-btn { border:1px solid #D9B7D0; background:#fff; color:#A7228C; border-radius:8px; padding:5px 10px;
        font-size:12px; cursor:pointer; font-family:inherit; }
      .pack-btn:hover { background:#F6E7F2; }
      .pack-btn.secundario { color:#6E8A91; border-color:#D5E0E3; }
      .pack-btn:disabled { opacity:.5; cursor:default; }
      .pack-select { width:100%; }
      .pack-ficha { border:1px solid #EBD3E5; border-radius:12px; padding:12px 14px; margin-bottom:10px; background:#FDF9FC; }
      .pack-ficha-titulo { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; font-weight:600; color:#3C4A50; font-size:14px; }
      .pack-ficha-sub { font-size:12px; color:#6E8A91; margin-top:3px; }
      .pack-ficha-ses { margin-top:8px; display:flex; flex-direction:column; gap:4px; font-size:12.5px; color:#3C4A50; }
      .pack-ficha-ses .pend { color:#A7228C; }
      .pack-ficha-ses .anul { color:#9BB5BC; text-decoration:line-through; }
    `;
    const st = document.createElement('style');
    st.id = 'packs-css';
    st.textContent = css;
    document.head.appendChild(st);
  }
  if (document.head) inyectarEstilos(); else document.addEventListener('DOMContentLoaded', inyectarEstilos);

  window.Packs = {
    COL: COL, LETRA: LETRA, CABECERAS: CABECERAS, RANGO_LECTURA: RANGO_LECTURA,
    TIPOS: TIPOS, NOMBRES: NOMBRES,
    SUPLEMENTO_SABADO: SUPLEMENTO_SABADO, SUPLEMENTO_GEMELAR: SUPLEMENTO_GEMELAR,
    FECHA_TARIFAS_NUEVAS: FECHA_TARIFAS_NUEVAS, PRECIOS_NUEVOS: PRECIOS_NUEVOS,
    parseImporte: parseImporte, parseFecha: parseFecha, esTarifaNueva: esTarifaNueva,
    claveClienta: claveClienta, normalizarTipo: normalizarTipo,
    tieneGemelos: tieneGemelos, tieneSabado: tieneSabado,
    infoFila: infoFila, esSesionPackSinCobro: esSesionPackSinCobro,
    construirIndice: construirIndice, packsAbiertosDe: packsAbiertosDe, packsDeClienta: packsDeClienta,
    siguienteId: siguienteId, precioCompra: precioCompra, precioSesionSiguiente: precioSesionSiguiente,
    fmtEur: fmtEur, textoEstado: textoEstado
  };
})();
