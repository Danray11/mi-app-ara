// app.js — Lectura matricial (SAP x Categoría -> PDF) con auto-detección
// y soporte opcional de "pistas" manuales (MATRIX_HINT) desde window.ENV.

(function () {
  // DOM helpers
  const $ = (id) => document.getElementById(id);
  const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };

  // Normalizaciones
  const normKey = (s) => (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

  const normSap = (v) => (v ?? '').toString().trim().replace(/[^\da-zA-Z]/g, '');

  // Convierte "A"->0, "B"->1, ..."Z"->25, "AA"->26...
  function colLetterToIndex(col) {
    if (!col) return -1;
    const s = col.toUpperCase().replace(/[^A-Z]/g, '');
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      n = n * 26 + (s.charCodeAt(i) - 64); // A=1
    }
    return n - 1; // 0-based
  }

  // Dump de depuración (muestra primeras filas y columnas)
  function debugDump(matrix, rows = 10, cols = 20) {
    const out = [];
    for (let r = 0; r < Math.min(rows, matrix.length); r++) {
      const row = matrix[r] || [];
      out.push(row.slice(0, cols));
    }
    console.log('[debug] primeras filas/cols =>', out);
  }

  // Estado global
  let MATRIX = [];     // [{sap, byCat:{catName->pdfName}}...]
  let CATEGORIES = []; // ['GALLETAS','PANELA & AZÚCAR',...]

  // Auto-detección de encabezados
  function detectHeaderRow(matrix) {
    const MAX_SCAN = Math.min(matrix.length, 50);
    for (let r = 0; r < MAX_SCAN; r++) {
      const row = matrix[r] || [];
      const nkRow = row.map(normKey);

      const sapCol = nkRow.findIndex(v => v === 'sap'); // literal "sap"
      if (sapCol === -1) continue;

      // Categorías: celdas no vacías y != 'sap' en esa fila
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

  // Construye la matriz interna desde una hoja ya cargada
  function buildFromMatrix(matrix) {
    // 1) ¿Hay pistas manuales?
    const hint = (window.ENV && window.ENV.MATRIX_HINT) || null;

    let headerRow, sapCol, catCols, firstDataRow;

    if (hint) {
      // Modo forzado por "pistas"
      const hrExcel = Number(hint.headerRow || hint.headerRowIndex || 2); // fila con 'SAP' y categorías (Excel 1-based)
      headerRow = Math.max(0, hrExcel - 1); // interno 0-based

      sapCol = (typeof hint.sapCol === 'string')
        ? colLetterToIndex(hint.sapCol) : Number(hint.sapCol || 3); // D -> 3

      if (Array.isArray(hint.categories) && hint.categories.length) {
        catCols = hint.categories.map(c => ({
          name: c.name,
          idx: (typeof c.col === 'string') ? colLetterToIndex(c.col) : Number(c.col)
        }));
      } else {
        // Si no se definieron, tomamos todas a la derecha de SAP en esa fila
        catCols = [];
        const row = matrix[headerRow] || [];
        for (let c = sapCol + 1; c < row.length; c++) {
          const raw = (row[c] ?? '').toString().trim();
          if (raw) catCols.push({ name: raw, idx: c });
        }
      }

      const frExcel = Number(hint.firstDataRow || (hrExcel + 1));
      firstDataRow  = Math.max(0, frExcel - 1);
      console.log('[app] Usando MATRIX_HINT =>', { headerRow, sapCol, catCols, firstDataRow });
    } else {
      // 2) Auto-detección
      const header = detectHeaderRow(matrix);
      if (!header) {
        throw new Error('No se encontró fila de encabezados con "SAP" y columnas de categorías.');
      }
      headerRow    = header.headerRow;
      sapCol       = header.sapCol;
      catCols      = header.catCols;
      firstDataRow = headerRow + 1;
      console.log('[app] Auto encabezados =>', header);
    }

    // 3) Construcción de estructura
    const categorias = catCols.map(c => c.name);
    const rows = [];
    for (let r = firstDataRow; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const sap = normSap(row[sapCol] ?? '');
      if (!sap) continue;

      const byCat = {};
      for (const c of catCols) {
        const val = (row[c.idx] ?? '').toString().trim();
        if (val) byCat[c.name] = val;
      }
      rows.push({ sap, byCat });
    }
    return { rows, categorias };
  }

  async function cargarExcel() {
    if (!window.URL_EXCEL) throw new Error('URL_EXCEL no está definida.');

    setText('estado', 'Cargando…');

    const resp = await fetch(window.URL_EXCEL, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`No se pudo descargar Excel. HTTP ${resp.status}`);

    const buf = await resp.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];

    // Leemos como matriz:
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!matrix.length) throw new Error('El Excel está vacío.');
    debugDump(matrix); // <- útil para ver qué hay en las primeras filas

    const { rows, categorias } = buildFromMatrix(matrix);

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
      // Por si el encabezado varía en acentos/espacios
      const key = Object.keys(fila.byCat).find(k => normKey(k) === normKey(cat));
      if (key) nombre = fila.byCat[key];
    }
    if (!nombre) { noResultado('No hay archivo para esa categoría.'); return; }

    const fname = /\.pdf$/i.test(nombre) ? nombre : `${nombre}.pdf`;
    const url   = (window.PDF_BASE || '') + fname;
    mostrarArchivo(url, fname);
  }

  async function init() {
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
