// app.js — robusto, local-first para XLSX y con mensajes claros

(() => {
  // ---------- helpers DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const estadoEl       = $('#estado');
  const excelRemotoEl  = $('#excelRemoto');
  const pdfsRemotosEl  = $('#pdfsRemotos');
  const selCategoria   = $('#selectCategoria');
  const inputSap       = $('#inputSap');
  const btnBuscar      = $('#btnBuscar');
  const visorMsg       = $('#visorMsg');
  const btnAbrirNueva  = $('#btnAbrirNueva');
  const btnDescargar   = $('#btnDescargar');

  const setStatus = (msg) => { if (estadoEl) estadoEl.textContent = msg; };

  const renderRutas = () => {
    if (excelRemotoEl && window.URL_EXCEL) excelRemotoEl.textContent = window.URL_EXCEL;
    if (pdfsRemotosEl && window.PDF_BASE)   pdfsRemotosEl.textContent   = window.PDF_BASE;
  };

  // ---------- Cargar XLSX: local primero; si falla, prueba 2 CDNs ----------
  function ensureXLSX() {
    if (window.XLSX) return Promise.resolve('ya_estaba');
    return new Promise((resolve, reject) => {
      const tryLoad = (src, next) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve(src);
        s.onerror = () => next ? next() : reject(new Error(`No se pudo cargar XLSX desde ${src}`));
        document.head.appendChild(s);
      };

      // 1) local
      tryLoad('./lib/xlsx.full.min.js', () => {
        // 2) cdnjs
        tryLoad('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => {
          // 3) unpkg
          tryLoad('https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js', null);
        });
      });
    });
  }

  // ---------- Leer el Excel ----------
  async function leerExcel(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Error HTTP ${res.status} al descargar Excel`);
    const buf = await res.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
    if (!rows.length) throw new Error('El Excel está vacío o no se pudo leer.');
    return rows;
  }

  // ---------- Parseo ----------
  const norm = (s) => String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '');

  const indexMap = new Map();   // key: `${sap}|${categoria}`  -> nombreArchivo
  let categoriasDetectadas = [];

  function armarIndice(rows) {
    const header = rows[0];
    // localizar SAP
    const sapCol = header.findIndex(h => norm(h) === 'sap');
    if (sapCol < 0) throw new Error('No se encontró la columna SAP en los encabezados.');

    // localizar columnas de categorías por palabras clave
    const catCols = [];
    header.forEach((h, i) => {
      const nh = norm(h);
      if (nh.includes('galleta') || nh.includes('panela') || nh.includes('azucar')) {
        catCols.push(i);
      }
    });
    if (!catCols.length) throw new Error('No se detectaron columnas de categorías (GALLETAS / PANELA & AZÚCAR).');

    categoriasDetectadas = catCols.map(i => String(header[i]).trim());

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

  // ---------- Buscar ----------
  async function buscarPDF() {
    visorMsg.textContent = '';
    btnAbrirNueva.style.display = 'none';
    btnDescargar.style.display  = 'none';

    const sap = Number(String(inputSap.value || '').replace(/[^\d]/g, ''));
    const cat = selCategoria.value.trim();
    if (!sap || !cat) {
      visorMsg.textContent = 'Ingresa un SAP y elige una categoría.';
      return;
    }

    const key = `${sap}|${cat}`;
    const nombre = indexMap.get(key);
    if (!nombre) {
      visorMsg.textContent = `No se encontró PDF para SAP ${sap} en categoría "${cat}".`;
      return;
    }

    const file = nombre.toLowerCase().endsWith('.pdf') ? nombre : `${nombre}.pdf`;
    const base = (window.PDF_BASE || '').replace(/\/+$/, '');
    const url  = `${base}/${encodeURIComponent(file)}`;

    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) throw new Error();
    } catch {
      visorMsg.textContent = `No se pudo acceder al PDF: ${file}`;
      return;
    }

    visorMsg.textContent = `Archivo encontrado: ${file}`;
    btnAbrirNueva.href = url;
    btnDescargar.href  = url;
    btnAbrirNueva.style.display = 'inline-block';
    btnDescargar.style.display  = 'inline-block';
  }

  // ---------- Init ----------
  async function init() {
    try {
      renderRutas();
      setStatus('Cargando…');

      // Cargar XLSX (local → CDN fallback)
      await ensureXLSX();

      if (!window.URL_EXCEL || !window.PDF_BASE) {
        throw new Error('Faltan URL_EXCEL o PDF_BASE (revisa env-gh.js / index.html).');
      }

      const rows = await leerExcel(window.URL_EXCEL);
      armarIndice(rows);
      pintarCategorias();

      setStatus('Datos cargados correctamente.');
    } catch (err) {
      console.error('[app] Error en init:', err);
      setStatus(`Error: ${err.message}`);
    }
  }

  if (btnBuscar) btnBuscar.addEventListener('click', buscarPDF);
  init();
})();
