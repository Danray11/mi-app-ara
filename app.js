// app.js (versión robusta con fallback de XLSX y UI segura)

(() => {
  // -------- utilidades DOM --------
  const $ = (sel) => document.querySelector(sel);
  const estadoEl = $('#estado');
  const excelRemotoEl = $('#excelRemoto');
  const pdfsRemotosEl = $('#pdfsRemotos');
  const selCategoria = $('#selectCategoria');
  const inputSap = $('#inputSap');
  const btnBuscar = $('#btnBuscar');
  const visorMsg = $('#visorMsg');
  const btnAbrirNueva = $('#btnAbrirNueva');
  const btnDescargar = $('#btnDescargar');

  const setStatus = (msg) => { if (estadoEl) estadoEl.textContent = msg; };

  // Pone en pantalla las rutas que uses
  const renderRutas = () => {
    if (excelRemotoEl && window.URL_EXCEL) excelRemotoEl.textContent = window.URL_EXCEL;
    if (pdfsRemotosEl && window.PDF_BASE)   pdfsRemotosEl.textContent   = window.PDF_BASE;
  };

  // -------- fallback de XLSX (2 CDNs) --------
  function ensureXLSX() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const load = (src, onerror) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = onerror;
        document.head.appendChild(s);
      };
      // 1er CDN
      load('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => {
        // 2do CDN fallback
        load('https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js', () => {
          reject(new Error('No se pudo cargar XLSX desde los CDNs.'));
        });
      });
    });
  }

  // -------- lectura y parseo del Excel --------
  async function leerExcel(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
    if (!rows.length) throw new Error('El Excel está vacío.');
    return rows;
  }

  // -------- normaliza encabezados --------
  const norm = (s) => String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '');

  // -------- dataset en memoria ----------
  // map: key = `${sap}|${categoria}`, value = nombreArchivo (con o sin .pdf)
  const indexMap = new Map();
  let categoriasDetectadas = [];

  function armarIndice(rows) {
    const header = rows[0];
    // columna SAP
    const sapCol = header.findIndex(h => norm(h) === 'sap');
    if (sapCol < 0) throw new Error('No se encontró la columna SAP en encabezados.');

    // columnas de categorías (galletas, panela, azucar, etc).
    const catCols = [];
    header.forEach((h, i) => {
      const nh = norm(h);
      // ajusta aquí: detectamos por palabras clave del encabezado
      if (nh.includes('galleta') || nh.includes('panela') || nh.includes('azucar')) {
        catCols.push(i);
      }
    });
    if (!catCols.length) throw new Error('No se detectaron columnas de categorías (GALLETAS / PANELA & AZÚCAR).');

    categoriasDetectadas = catCols.map(i => String(header[i]).trim());

    // indices
    indexMap.clear();
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const sapRaw = row[sapCol];
      const sap = Number(String(sapRaw || '').replace(/[^\d]/g, ''));
      if (!sap) continue;

      for (const ci of catCols) {
        const categoria = String(header[ci]).trim();
        const nombreArchivo = String(row[ci] || '').trim();
        if (!nombreArchivo) continue;
        indexMap.set(`${sap}|${categoria}`, nombreArchivo);
      }
    }
  }

  function pintarCategorias() {
    if (!selCategoria) return;
    selCategoria.innerHTML = '<option value="">—</option>';
    for (const cat of categoriasDetectadas) {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      selCategoria.appendChild(opt);
    }
  }

  // -------- buscar y resolver PDF --------
  async function buscarPDF() {
    visorMsg.textContent = '';
    btnAbrirNueva.style.display = 'none';
    btnDescargar.style.display = 'none';

    const sap = Number(String(inputSap.value || '').replace(/[^\d]/g, ''));
    const cat = selCategoria.value.trim();
    if (!sap || !cat) {
      visorMsg.textContent = 'Ingresa un SAP y elige una categoría.';
      return;
    }
    const key = `${sap}|${cat}`;
    const nombre = indexMap.get(key);
    if (!nombre) {
      visorMsg.textContent = `No se encontró PDF para SAP ${sap} y categoría "${cat}".`;
      return;
    }

    // Añade .pdf si no lo trae
    const file = nombre.toLowerCase().endsWith('.pdf') ? nombre : `${nombre}.pdf`;
    const url = (window.PDF_BASE || '').replace(/\/+$/, '') + '/' + encodeURIComponent(file);

    // opcional: HEAD para verificar existencia
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) throw new Error();
    } catch {
      visorMsg.textContent = `No se pudo acceder al PDF: ${file}`;
      return;
    }

    visorMsg.textContent = `Archivo encontrado: ${file}`;
    btnAbrirNueva.href = url;
    btnDescargar.href = url;
    btnAbrirNueva.style.display = 'inline-block';
    btnDescargar.style.display = 'inline-block';
  }

  // -------- init --------
  async function init() {
    try {
      renderRutas();
      setStatus('Cargando…');

      // Asegurar XLSX (si te bloquean un CDN, se usa el otro)
      await ensureXLSX();

      // Validar que las rutas existen
      if (!window.URL_EXCEL || !window.PDF_BASE) {
        throw new Error('Faltan URL_EXCEL o PDF_BASE (revisar env-gh.js / index.html).');
      }

      // Leer y parsear
      const rows = await leerExcel(window.URL_EXCEL);

      // Construir índice SAP + categoría -> archivo
      armarIndice(rows);

      // Pintar categorías en el select
      pintarCategorias();

      setStatus('Datos cargados correctamente.');
    } catch (err) {
      console.error('[app] Error en init:', err);
      setStatus(`Error: ${err.message}`);
    }
  }

  if (btnBuscar) btnBuscar.addEventListener('click', buscarPDF);

  // iniciar
  init();
})();
