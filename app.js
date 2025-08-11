// --- app.js (al inicio) ---
async function ensureXLSX() {
  if (window.XLSX) return window.XLSX;

  // Espera hasta 5s a que la librería aparezca
  await new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.XLSX) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 5000) {
        clearInterval(timer);
        reject(new Error('XLSX no cargó en tiempo'));
      }
    }, 50);
  });

  return window.XLSX;
}

// --------------------------- utilidades DOM ---------------------------
const $id = (id) => document.getElementById(id) || null;

// Intenta mapear ids comunes; ajusta aquí si tus ids difieren
const els = {
  // Bloque "estado de datos"
  statusBox:       $id('statusBox') || $id('statusText'),
  btnRetry:        $id('btnRetry') || $id('btnReload') || $id('btnReintentar'),
  excelRemoteOut:  $id('txtExcelRemote') || $id('excelRemote') || $id('excelStatus'),
  pdfBaseOut:      $id('txtPdfBase') || $id('pdfBaseOut') || $id('statusPdfsBase'),
  loadingLabel:    $id('loadingLabel'),

  // Buscar por SAP
  inputSAP:        $id('inputSap') || $id('sapInput') || $id('txtSAP'),
  selectCategoria: $id('selectCategoria') || $id('categorySelect'),
  btnBuscar:       $id('btnBuscar') || $id('btnSearch'),

  // Resultados
  linkOpen:        $id('openLink') || $id('linkOpen') || $id('abrirNueva'),
  linkDownload:    $id('downloadLink') || $id('linkDownload') || $id('descargar'),

  // Informativo (opcional)
  sourceNote:      $id('sourceNote'),
};

// --------------------------- estado de datos ---------------------------
let _rows         = [];        // filas crudas del Excel (como objetos)
let _bySAP        = new Map(); // Map<SAP, Array<row>>
let _categorias   = new Set(); // Set con categorías únicas

// Columnas aceptadas (flexibles por distintos nombres)
const COLNAMES = {
  sap:       ['sap','codigo','cod_sap','sap_code','id','idsap','c_sap'],
  categoria: ['categoria','categoría','category','grupo','familia','clase'],
  archivo:   ['archivo','pdf','file','filename','nombre','nombrepdf']
};

function pick(obj, aliases) {
  const keys = Object.keys(obj);
  const low  = keys.reduce((acc,k) => (acc[k.toLowerCase()] = k, acc), {});
  for (const a of aliases) {
    if (low[a]) return obj[ low[a] ];
  }
  return '';
}

function limpiarNombrePDF(nombre) {
  if (!nombre) return '';
  let n = String(nombre).trim();
  // Si trae rutas tipo "pdfs/archivo.pdf" o "/pdfs/archivo.pdf", recorta directorios
  n = n.replace(/^.*[\\/]/,'');
  // Asegura extensión .pdf
  if (!/\.pdf$/i.test(n)) n += '.pdf';
  return n;
}

// --------------------------- carga del Excel ---------------------------
async function cargarExcel() {
  try {
    actualizarEstado('Cargando datos…');

    if (els.excelRemoteOut) els.excelRemoteOut.textContent = window.URL_EXCEL || '';
    if (els.pdfBaseOut)     els.pdfBaseOut.textContent     = window.PDF_BASE || '';

    // fetch RAW Excel
    const resp = await fetch(window.URL_EXCEL, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const ab = await resp.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });

    // Tomamos la primera hoja
    const wsName = wb.SheetNames[0];
    const ws     = wb.Sheets[wsName];

    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
    _rows = json;

    indexarDatos(json);

    actualizarEstado('Datos cargados correctamente.');
    if (els.sourceNote) els.sourceNote.textContent = 'Leyendo desde GitHub Raw';
  } catch (err) {
    console.error('[app] Error cargando Excel', err);
    actualizarEstado(`Error al cargar Excel: ${err.message || err}`, true);
  }
}

function indexarDatos(filas) {
  _bySAP.clear();
  _categorias.clear();

  filas.forEach((r) => {
    const sap   = String(pick(r, COLNAMES.sap)).trim();
    const cat   = String(pick(r, COLNAMES.categoria)).trim();
    const arch  = limpiarNombrePDF( pick(r, COLNAMES.archivo) );

    if (sap) {
      const obj = { sap, categoria: cat, archivo: arch, raw: r };
      if (!_bySAP.has(sap)) _bySAP.set(sap, []);
      _bySAP.get(sap).push(obj);
    }
    if (cat) _categorias.add(cat);
  });

  // Refresca el combo de categorías
  if (els.selectCategoria) {
    const prev = els.selectCategoria.value || '';
    els.selectCategoria.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = ''; opt0.textContent = '—';
    els.selectCategoria.appendChild(opt0);

    Array.from(_categorias).sort().forEach((c) => {
      const op = document.createElement('option');
      op.value = c; op.textContent = c;
      els.selectCategoria.appendChild(op);
    });

    // si había una seleccionada, intenta respetarla
    if ([...els.selectCategoria.options].some(o => o.value === prev)) {
      els.selectCategoria.value = prev;
    }
  }
}

// --------------------------- búsqueda ---------------------------
function buscarPDF() {
  const sap = (els.inputSAP?.value || '').trim();
  const cat = (els.selectCategoria?.value || '').trim();

  if (!sap) {
    alert('Ingresa un código SAP.');
    return;
  }
  if (!_bySAP.size) {
    alert('Aún no hay datos cargados.');
    return;
  }

  const lista = _bySAP.get(sap);
  if (!lista || !lista.length) {
    actualizarEstado(`No se encontraron PDFs para SAP ${sap}.`, true);
    setResultado(null);
    return;
  }

  // Si hay categoría elegida, filtra; si no, toma la primera
  let match = lista;
  if (cat) match = lista.filter(x => (x.categoria || '') === cat);

  if (!match.length) {
    actualizarEstado(`Sin coincidencias para SAP ${sap} en categoría "${cat}".`, true);
    setResultado(null);
    return;
  }

  const elegido = match[0];
  const urlPDF  = window.PDF_BASE + elegido.archivo;

  setResultado(urlPDF);
  actualizarEstado(`PDF encontrado para SAP ${sap}${cat ? ` (${cat})` : ''}.`);
}

function setResultado(url) {
  if (els.linkOpen) {
    if (url) { els.linkOpen.href = url; els.linkOpen.classList.remove('disabled'); }
    else     { els.linkOpen.removeAttribute('href'); els.linkOpen.classList.add('disabled'); }
  }
  if (els.linkDownload) {
    if (url) { els.linkDownload.href = url; els.linkDownload.download = ''; els.linkDownload.classList.remove('disabled'); }
    else     { els.linkDownload.removeAttribute('href'); els.linkDownload.removeAttribute('download'); els.linkDownload.classList.add('disabled'); }
  }
}

// --------------------------- UI helpers ---------------------------
function actualizarEstado(msg, esError = false) {
  if (els.statusBox) {
    els.statusBox.textContent = msg;
    els.statusBox.style.color = esError ? '#b00020' : '#333';
  } else {
    console.log('[estado]', msg);
  }
}

// --------------------------- eventos ---------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Mostrar desde dónde lee
  if (els.excelRemoteOut) els.excelRemoteOut.textContent = window.URL_EXCEL || '';
  if (els.pdfBaseOut)     els.pdfBaseOut.textContent     = window.PDF_BASE || '';

  // Botón reintentar
  if (els.btnRetry) els.btnRetry.addEventListener('click', cargarExcel);

  // Buscar
  if (els.btnBuscar) els.btnBuscar.addEventListener('click', buscarPDF);

  // Carga inicial
  cargarExcel();
});
