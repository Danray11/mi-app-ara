// app.js — versión "matricial" (SAP x Categoría -> PDF)

(function () {
  // Helpers DOM
  const $ = (id) => document.getElementById(id);
  const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };

  // Normaliza clave (quita acentos, espacios y símbolos)
  const normKey = (s) => (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

  // Normalización del SAP (permite dígitos o alfanumérico simple)
  const normSap = (v) => (v ?? '').toString().trim().replace(/[^\da-zA-Z]/g, '');

  // Estado global
  let MATRIX = [];     // [{ sap: '5', byCat: { 'GALLETAS': '...', 'PANELA & AZÚCAR': '...' } }, ...]
  let CATEGORIES = []; // ['GALLETAS', 'PANELA & AZÚCAR', ...]

  // Busca la fila de encabezados y columnas SAP + Categorías
  function detectHeaderRow(matrix) {
    const MAX_SCAN = Math.min(matrix.length, 40);
    for (let r = 0; r < MAX_SCAN; r++) {
      const row = matrix[r] || [];
      const nkRow = row.map(normKey);

      // Columna SAP
      const sapCol = nkRow.findIndex(v => v === 'sap');
      if (sapCol === -1) continue;

      // Categorías: toda celda no vacía y distinta de 'sap' en esa misma fila
      const catCols = [];
      for (let c = 0; c < row.length; c++) {
        const raw = (row[c] ?? '').toString().trim();
        const nk  = normKey(raw);
        if (nk && nk !== 'sap') {
          catCols.push({ name: raw, idx: c });
        }
      }
      if (catCols.length > 0) {
        return { headerRow: r, sapCol, catCols };
      }
    }
    return null;
  }

  async function cargarExcel() {
    if (!window.URL_EXCEL) throw new Error('URL_EXCEL no está definida.');

    setText('estado', 'Cargando…');

    const resp = await fetch(window.URL_EXCEL, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`No se pudo descargar Excel. HTTP ${resp.status}`);

    const buf = await resp.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];

    // Leemos como matriz para poder detectar headers y mapear categoría por columnas
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!matrix.length) throw new Error('El Excel está vacío.');

    const header = detectHeaderRow(matrix);
    console.log('[app] Encabezados detectados =>', header);

    if (!header) {
      throw new Error('No se encontró fila de encabezados con "SAP" y columnas de categorías (p. ej., GALLETAS, PANELA & AZÚCAR).');
    }

    const { headerRow, sapCol, catCols } = header;

    // Categorías (tal cual aparecen en el Excel, para mostrar en el select)
    const categorias = catCols.map(c => c.name);

    // Parseo de filas a partir de la fila siguiente al encabezado
    const rows = [];
    for (let r = headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const sap = normSap(row[sapCol] ?? '');
      if (!sap) continue;

      const byCat = {};
      for (const c of catCols) {
        const val = (row[c.idx] ?? '').toString().trim();
        if (val) byCat[c.name] = val; // nombre PDF (sin o con .pdf)
      }
      rows.push({ sap, byCat });
    }

    console.log('[app] Filas leídas:', rows.length, 'Categorías:', categorias);

    setText('estado', 'Datos cargados correctamente.');
    return { rows, categorias };
  }

  function llenarSelectCategorias(cats) {
    const sel = $('selectCategoria');
    if (!sel) return;
    sel.innerHTML = '<option value="">—</option>' +
      cats.map(name => `<option value="${name}">${name}</option>`).join('');
  }

  function toggleVisorBtns(show) {
    const a = $('btnAbrirNueva');
    const d = $('btnDescargar');
    if (a) a.style.display = show ? 'inline-block' : 'none';
    if (d) d.style.display = show ? 'inline-block' : 'none';
  }

  function mostrarArchivo(url, nombre) {
    $('btnAbrirNueva').href = url;
    $('btnDescargar').href = url;
    setText('visorMsg', `Archivo: ${nombre}`);
    toggleVisorBtns(true);
  }

  function noResultado(msg) {
    setText('visorMsg', msg);
    toggleVisorBtns(false);
  }

  async function onBuscar() {
    const sap = normSap($('inputSap').value);
    const cat = $('selectCategoria').value;

    if (!sap) { alert('Ingresa el SAP.'); return; }
    if (!cat) { alert('Selecciona la categoría.'); return; }

    const fila = MATRIX.find(r => r.sap === sap);
    if (!fila) { noResultado(`No se encontró el SAP ${sap}.`); return; }

    let nombre = fila.byCat[cat];
    if (!nombre) {
      // por si hay pequeñas diferencias de espacios/acentos en la cabecera
      const key = Object.keys(fila.byCat).find(k => normKey(k) === normKey(cat));
      if (key) nombre = fila.byCat[key];
    }

    if (!nombre) { noResultado('No hay archivo para esa categoría.'); return; }

    const fname = /\.pdf$/i.test(nombre) ? nombre : `${nombre}.pdf`;
    const url   = (window.PDF_BASE || '') + fname;

    mostrarArchivo(url, fname);
  }

  async function init() {
    // Mostrar las rutas que vamos a usar
    if (window.RAW_BASE)  console.log('[env-gh] RAW_BASE  =>', window.RAW_BASE);
    if (window.URL_EXCEL) console.log('[env-gh] URL_EXCEL =>', window.URL_EXCEL);
    if (window.PDF_BASE)  console.log('[env-gh] PDF_BASE  =>', window.PDF_BASE);

    setText('excelRemoto', window.URL_EXCEL || '');
    setText('pdfsRemotos', window.PDF_BASE || '');

    try {
      const { rows, categorias } = await cargarExcel();
      MATRIX = rows;
      CATEGORIES = categorias;
      llenarSelectCategorias(categorias);
    } catch (err) {
      console.error(err);
      setText('estado', `Error: ${err.message}`);
    }

    const btnBuscar    = $('btnBuscar');
    const btnReintento = $('btnReintentar');
    if (btnBuscar)     btnBuscar.onclick    = onBuscar;
    if (btnReintento)  btnReintento.onclick = init;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
