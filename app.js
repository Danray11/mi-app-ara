// ===============================
//  Utilidades DOM seguras
// ===============================
const $ = (id) => document.getElementById(id);
const setText = (id, txt) => {
  const el = $(id);
  if (el) el.textContent = txt;
  else console.warn(`[app] Falta el elemento #${id}`);
};
const setHTML = (id, html) => {
  const el = $(id);
  if (el) el.innerHTML = html;
  else console.warn(`[app] Falta el elemento #${id}`);
};

// Logger
const log = (...a) => console.log('[app]', ...a);
const warn = (...a) => console.warn('[app]', ...a);

// ===============================
//  Rutas base (inyectadas por env-gh.js)
// ===============================
const URL_EXCEL = window.URL_EXCEL || '';
const PDF_BASE  = window.PDF_BASE  || '';

log('URL_EXCEL =>', URL_EXCEL);
log('PDF_BASE  =>', PDF_BASE);

// Mostrar en UI (si existen)
setText('excelRemoto', URL_EXCEL || '(sin URL)');
setText('pdfsRemotos', PDF_BASE  || '(sin URL)');

// ===============================
//  Normalizador de headers
// ===============================
// Acepta varios alias para cada columna, así el Excel puede variar sin romper.
const HEADERS_ALIASES = {
  sap:       ['sap', 'codigo', 'codigosap', 'sku', 'id'],
  categoria: ['categoria', 'category', 'tipo', 'grupo'],
  archivo:   ['archivo', 'file', 'pdf', 'ruta', 'path', 'nombre', 'nombrearchivo']
};

const norm = (s) => String(s || '').trim().toLowerCase();

function detectHeaderIndexes(headerRow) {
  // headerRow es un array (sheet_to_json con header:1)
  const idx = { sap: -1, categoria: -1, archivo: -1 };

  headerRow.forEach((cell, i) => {
    const h = norm(cell);
    if (HEADERS_ALIASES.sap.includes(h))       idx.sap = (idx.sap === -1 ? i : idx.sap);
    if (HEADERS_ALIASES.categoria.includes(h)) idx.categoria = (idx.categoria === -1 ? i : idx.categoria);
    if (HEADERS_ALIASES.archivo.includes(h))   idx.archivo = (idx.archivo === -1 ? i : idx.archivo);
  });

  return idx;
}

// Construye una URL válida para PDFs incluso con subcarpetas/espacios
function joinPdfUrl(base, relativePath) {
  const segs = String(relativePath || '').split('/').map(encodeURIComponent);
  let b = base.endsWith('/') ? base : base + '/';
  return b + segs.join('/');
}

// ===============================
//  Lectura de Excel (GitHub Raw)
// ===============================
async function cargarExcel() {
  if (!URL_EXCEL) throw new Error('URL_EXCEL no está definida.');

  setText('estado', 'Cargando…');

  const resp = await fetch(URL_EXCEL, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`No se pudo obtener el Excel. HTTP ${resp.status}`);

  const buf = await resp.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Leemos como matriz para detectar headers con flexibilidad
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (!rows.length) throw new Error('Hoja vacía.');
  const headers = rows[0];

  const idx = detectHeaderIndexes(headers);
  log('Headers:', headers, 'Indexes:', idx);

  if (idx.sap < 0 || idx.archivo < 0) {
    throw new Error(
      `No se detectaron las columnas mínimas. ` + 
      `Requeridas: SAP y ARCHIVO. Alias soportados:\n` + 
      `SAP = ${HEADERS_ALIASES.sap.join(', ')}\n` +
      `ARCHIVO = ${HEADERS_ALIASES.archivo.join(', ')}\n` +
      `CATEGORIA (opcional) = ${HEADERS_ALIASES.categoria.join(', ')}`
    );
  }

  // Normalizamos filas a objetos {sap, categoria?, archivo}
  const data = rows.slice(1)
    .map(r => ({
      sap:       norm(r[idx.sap]),
      categoria: idx.categoria >= 0 ? String(r[idx.categoria]).trim() : '',
      archivo:   String(r[idx.archivo]).trim()
    }))
    .filter(r => r.sap && r.archivo);

  // Construir categorías únicas (si existen)
  const categorias = Array.from(
    new Set(data.map(r => r.categoria).filter(Boolean))
  ).sort((a,b)=>a.localeCompare(b));

  log(`Leídas ${data.length} filas útiles. Categorías:`, categorias);

  setText('estado', 'Datos cargados correctamente.');
  return { data, categorias };
}

// ===============================
//  UI: llenar combo, buscar, visor
// ===============================
function llenarCategorias(categorias) {
  const sel = $('selectCategoria');
  if (!sel) { warn('Falta #selectCategoria'); return; }

  sel.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = '—';
  sel.appendChild(opt0);

  categorias.forEach(cat => {
    const o = document.createElement('option');
    o.value = cat;
    o.textContent = cat;
    sel.appendChild(o);
  });
}

function mostrarResultado(url) {
  // Muestra y configura los botones del visor
  const abrir = $('btnAbrirNueva');
  const down  = $('btnDescargar');

  if (abrir) { abrir.style.display = 'inline-block'; abrir.href = url; }
  if (down)  { down.style.display  = 'inline-block'; down.href  = url; }

  setText('visorMsg', `Archivo listo: ${url}`);
}

function limpiarVisor(msg = 'Sin resultados todavía.') {
  const abrir = $('btnAbrirNueva');
  const down  = $('btnDescargar');
  if (abrir) abrir.style.display = 'none';
  if (down)  down.style.display  = 'none';
  setText('visorMsg', msg);
}

// ===============================
//  Búsqueda por SAP + categoría
// ===============================
function prepararBuscador(dataset) {
  const btn = $('btnBuscar');
  const inp = $('inputSap');
  const sel = $('selectCategoria');

  if (!btn || !inp) {
    warn('Faltan #btnBuscar y/o #inputSap');
    return;
  }

  btn.onclick = () => {
    limpiarVisor();

    const sap = norm(inp.value);
    const cat = sel ? String(sel.value).trim() : '';

    if (!sap) { setText('visorMsg', 'Ingresa un código SAP.'); return; }

    // Filtrado
    let candidatos = dataset.data.filter(r => r.sap === sap);
    if (cat) candidatos = candidatos.filter(r => r.categoria === cat);

    if (!candidatos.length) {
      setText('visorMsg', 'No se encontraron coincidencias.');
      return;
    }

    const archivo = candidatos[0].archivo;
    if (!archivo.toLowerCase().endsWith('.pdf')) {
      warn('El archivo no parece PDF:', archivo);
    }

    const url = joinPdfUrl(PDF_BASE, archivo);
    mostrarResultado(url);
  };
}

// ===============================
//  Init
// ===============================
async function init() {
  try {
    setText('estado', 'Cargando…');           // seguro (no falla si falta)
    setText('excelRemoto', URL_EXCEL);
    setText('pdfsRemotos', PDF_BASE);

    const dataset = await cargarExcel();
    llenarCategorias(dataset.categorias);
    prepararBuscador(dataset);
  } catch (err) {
    warn('Error en init:', err);
    setText('estado', `Error al cargar datos: ${err.message || err}`);
    limpiarVisor('No hay datos para buscar.');
  }

  const btnRe = $('btnReintentar');
  if (btnRe) btnRe.onclick = init;
}

// Ejecuta cuando el DOM está listo (por si alguien quita "defer")
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
