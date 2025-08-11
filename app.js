/* app.js – versión estable y tolerante
   - Lee el Excel desde URL_EXCEL (definida en env-gh.js)
   - Usa encabezados de forma flexible (case-insensitive / sin acentos)
   - No requiere cambiar tu Excel si ya funcionaba
   - No rompe si faltan spans opcionales (#estado, #excelRemoto, #pdfsRemotos)
*/

(function () {
  // ---------- Utilidades UI seguras ----------
  const $ = (id) => document.getElementById(id) || null;
  const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
  const show = (id) => { const el = $(id); if (el) el.style.display = ''; };
  const hide = (id) => { const el = $(id); if (el) el.style.display = 'none'; };

  const log = (...a) => console.log('[app]', ...a);
  const warn = (...a) => console.warn('[app]', ...a);
  const err = (...a) => console.error('[app]', ...a);

  // ---------- Normalizadores ----------
  // Normaliza claves (encabezados) para comparar sin acentos/espacios
  const normKey = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '')
      .trim();

  // Normaliza SAP (deja letras/números)
  const normSap = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

  // ---------- Config que viene de env-gh.js ----------
  const URL_EXCEL = window.URL_EXCEL || '';
  const PDF_BASE  = window.PDF_BASE  || '';

  // Si están los spans, muestro info
  setText('excelRemoto', URL_EXCEL);
  setText('pdfsRemotos', PDF_BASE);

  // ---------- Búsqueda tolerante de claves en objetos ----------
  // Acepta varios alias y no depende de mayúsculas/acentos en el Excel
  function findKey(obj, aliases) {
    // Mapa normalizado -> clave real
    const map = {};
    Object.keys(obj).forEach(k => { map[normKey(k)] = k; });

    for (const alias of aliases) {
      const nk = normKey(alias);
      if (map[nk]) return map[nk];
    }
    return null;
  }

  // ---------- Lectura Excel ----------
  async function cargarExcel() {
    if (!URL_EXCEL) throw new Error('URL_EXCEL no está definida.');

    setText('estado', 'Cargando…');

    const resp = await fetch(URL_EXCEL, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`No se pudo obtener el Excel. HTTP ${resp.status}`);

    const buf = await resp.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Leemos a objetos (usa primera fila como encabezados)
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    log('Filas leídas:', rows.length);

    if (!rows.length) throw new Error('El Excel está vacío.');

    // Intentamos detectar claves con varios alias comunes
    // (no cambies tu Excel: esto intenta adaptarse a lo que ya tenías)
    const sample = rows[0];
    const keySAP      = findKey(sample, ['sap', 'codigo', 'codigosap', 'sku', 'id']) || 'sap';
    const keyArchivo  = findKey(sample, ['archivo', 'file', 'pdf', 'ruta', 'path', 'nombre', 'nombrearchivo']) || 'archivo';
    const keyCategoria= findKey(sample, ['categoria', 'category', 'tipo', 'grupo']); // opcional

    log('Columnas detectadas =>', { keySAP, keyArchivo, keyCategoria });

    // Validación mínima
    if (!sample[keySAP] || !sample[keyArchivo]) {
      // No rompo: explico y salgo con error claro
      throw new Error(
        'No se detectaron columnas mínimas. ' +
        'Se necesita una columna de SAP y una de ARCHIVO/PDF en la primera fila de encabezados.'
      );
    }

    // Normalizo dataset
    const data = rows
      .map(r => ({
        sap:       normSap(r[keySAP]),
        categoria: keyCategoria ? String(r[keyCategoria] || '').trim() : '',
        archivo:   String(r[keyArchivo] || '').trim()
      }))
      .filter(r => r.sap && r.archivo);

    // Categorías únicas (si hay)
    const categorias = Array.from(new Set(data.map(r => r.categoria).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));

    setText('estado', 'Datos cargados correctamente.');
    return { data, categorias };
  }

  // ---------- Render categorías ----------
  function renderCategorias(categorias) {
    const sel = $('selectCategoria');
    if (!sel) return; // tolerante si no existe

    // Limpio
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '—';
    sel.appendChild(opt0);

    categorias.forEach(c => {
      const op = document.createElement('option');
      op.value = c;
      op.textContent = c;
      sel.appendChild(op);
    });
  }

  // ---------- Buscar / Mostrar resultado ----------
  function mostrarResultado(pdfUrl) {
    const visorMsg = $('visorMsg');
    const btnNueva = $('btnAbrirNueva');
    const btnDesc  = $('btnDescargar');

    if (!visorMsg) return; // tolerante

    if (pdfUrl) {
      visorMsg.textContent = 'Documento encontrado.';
      if (btnNueva) { btnNueva.href = pdfUrl; show('btnAbrirNueva'); }
      if (btnDesc)  { btnDesc.href  = pdfUrl; show('btnDescargar'); }
    } else {
      visorMsg.textContent = 'Sin resultados.';
      if (btnNueva) hide('btnAbrirNueva');
      if (btnDesc)  hide('btnDescargar');
    }
  }

  function buscarPDF(data) {
    const input = $('inputSap');
    if (!input) return;

    const sap = normSap(input.value);
    if (!sap) {
      mostrarResultado(''); // nada que buscar
      return;
    }

    const categoriaSel = $('selectCategoria') ? $('selectCategoria').value : '';

    // Filtro por SAP y (si se eligió) por categoría
    const candidatos = data.filter(r =>
      r.sap === sap && (!categoriaSel || r.categoria === categoriaSel)
    );

    if (!candidatos.length) {
      mostrarResultado('');
      return;
    }

    // Tomo el primero
    const archivo = candidatos[0].archivo;
    const url = (archivo.startsWith('http://') || archivo.startsWith('https://'))
      ? archivo
      : (PDF_BASE.replace(/\/+$/, '') + '/' + archivo.replace(/^\/+/, ''));

    mostrarResultado(url);
  }

  // ---------- Init ----------
  async function init() {
    try {
      setText('estado', 'Cargando…');

      // Muestro rutas (si hay spans)
      setText('excelRemoto', URL_EXCEL);
      setText('pdfsRemotos', PDF_BASE);

      const { data, categorias } = await cargarExcel();
      window._DATA = data; // útil para depurar

      renderCategorias(categorias);
      setText('estado', 'Datos cargados correctamente.');
      log('Registros:', data.length, 'Categorías:', categorias.length);
    } catch (e) {
      setText('estado', 'Error: ' + e.message);
      err(e);
    }
  }

  // ---------- Eventos ----------
  function bindEvents() {
    const btnReintentar = $('btnReintentar');
    if (btnReintentar) btnReintentar.addEventListener('click', init);

    const btnBuscar = $('btnBuscar');
    if (btnBuscar) btnBuscar.addEventListener('click', () => buscarPDF(window._DATA || []));

    const sel = $('selectCategoria');
    if (sel) sel.addEventListener('change', () => buscarPDF(window._DATA || []));
  }

  // ---------- Arranque ----------
  bindEvents();
  init();
})();
