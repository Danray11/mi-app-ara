// ================== Utiles ==================
const norm = (s) => String(s ?? '')
  .trim()
  .toUpperCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s*&\s*/g, ' & ')
  .replace(/\s+/g, ' ')
  .replace(/[^\w &-]/g, '');

const isRowEmpty = (row = []) => row.every(v => String(v ?? '').trim() === '');

// ================== Cargar Excel ==================
async function cargarExcel(url) {
  console.log('[app] URL_EXCEL =>', url);

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo descargar el Excel (${res.status})`);
  const ab = await res.arrayBuffer();

  const wb = XLSX.read(ab, { type: 'array' });
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });

  const headerRowIdx = rows.findIndex(r => !isRowEmpty(r));
  if (headerRowIdx < 0) throw new Error('No se encontró ninguna fila con datos.');
  const rawHeaders = rows[headerRowIdx];
  const headers = rawHeaders.map(norm);

  console.log('[app] Hoja =>', wsName);
  console.log('[app] Fila de encabezados:', headerRowIdx, '| Encabezados (normalizados):', headers);

  const candidatesSAP = ['SAP', 'COD SAP', 'CODIGO SAP', 'ID SAP'];
  let sapCol = -1;
  for (const c of candidatesSAP) {
    const i = headers.indexOf(norm(c));
    if (i >= 0) { sapCol = i; break; }
  }
  if (sapCol < 0) throw new Error('No se encontró la columna SAP en los encabezados.');

  const NO_CAT = new Set([
    norm('REGIÓN'), norm('REGION'),
    norm('Z'), norm('ZONA'), norm('TIENDA'),
    norm('SURTIDO'),
    norm('TIPOLOGIA'), norm('TIPOLOGÍA'),
    norm('TIPO DE TIENDA POR MÓDULOS ORIGINAL'),
    norm('TIPO DE TIENDA POR MODULOS ORIGINAL'),
    norm('SAP')
  ]);

  const catCols = headers
    .map((h, idx) => ({ h, idx }))
    .filter(o => !NO_CAT.has(o.h) && o.idx !== sapCol)
    .map(o => o.idx);

  if (!catCols.length) throw new Error('No se detectaron columnas de categoría.');

  const categorias = catCols.map(i => headers[i]);
  console.log('[app] Categorías detectadas =>', categorias);

  const data = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (isRowEmpty(row)) continue;

    const sapVal = String(row[sapCol] ?? '').trim();
    if (!sapVal) continue;

    const reg = { SAP: sapVal };
    for (const ci of catCols) {
      const catName = headers[ci];
      const val = String(row[ci] ?? '').trim();
      reg[catName] = val.replace(/\.pdf$/i, ''); // guardamos sin .pdf
    }
    data.push(reg);
  }
  console.log('[app] Filas útiles:', data.length);

  return { headers, categorias, data };
}

// ================== Armar índice y UI ==================
let INDICE = null;

function armarIndice(parsed) {
  const { data, categorias } = parsed;

  const sel = document.getElementById('selectCategoria');
  sel.innerHTML = '';
  const optEmpty = document.createElement('option');
  optEmpty.value = '';
  optEmpty.textContent = '—';
  sel.appendChild(optEmpty);
  for (const cat of categorias) {
    const o = document.createElement('option');
    o.value = cat;
    o.textContent = cat;
    sel.appendChild(o);
  }

  const idx = {};
  for (const row of data) {
    const sap = row.SAP;
    if (!idx[sap]) idx[sap] = {};
    for (const k of Object.keys(row)) {
      if (k === 'SAP') continue;
      idx[sap][k] = row[k];
    }
  }
  INDICE = { categorias, idx };
  console.log('[app] Índice armado. SAP únicos:', Object.keys(idx).length);
}

// ================== HEAD helper ==================
async function existePDF(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

// ================== Visor incrustado (PDF.js en CDN) ==================
const PDFJS_VERSION = '4.4.168';
const PDFJS_VIEWER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/web/viewer.html`;
// Si alguna red bloquea jsDelivr, alternativa (comenta la línea de arriba y descomenta esta):
// const PDFJS_VIEWER = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/web/viewer.html`;

function setPreview(pdfUrl) {
  const cont  = document.getElementById('pdfContainer');
  const frame = document.getElementById('pdfFrame');
  if (!cont || !frame) return;

  // ¡OJO! Debe quedar ABSOLUTO y con versión, nada de rutas locales
  const viewerUrl = `${PDFJS_VIEWER}?file=${encodeURIComponent(pdfUrl)}#zoom=page-width`;
  frame.src = viewerUrl;
  cont.style.display = 'block';
  cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ================== Buscar y mostrar ==================
async function buscarYPintar() {
  const estado = document.getElementById('estado');
  const sap = (document.getElementById('inputSap')?.value || '').trim();
  const cat = document.getElementById('selectCategoria')?.value || '';

  if (!sap || !cat) {
    estado.textContent = 'Ingrese SAP y seleccione una categoría.';
    return;
  }
  if (!INDICE || !INDICE.idx[sap]) {
    estado.textContent = `No se encontró información para el SAP ${sap}.`;
    return;
  }

  let fileName = INDICE.idx[sap][cat] || '';
  if (!fileName) {
    estado.textContent = `No hay PDF para SAP ${sap} en la categoría ${cat}.`;
    return;
  }
  if (!/\.pdf$/i.test(fileName)) fileName += '.pdf';

  const base = (window.PDF_BASE || '').replace(/\/+$/, '');
  const url  = `${base}/${encodeURIComponent(fileName)}`;

  const ok = await existePDF(url);
  if (!ok) {
    console.warn('[app] 404 intentando:', url);
    estado.innerHTML = `No se encontró el PDF en GitHub.<br><code>${url}</code><br>
    Verifica que el archivo exista en <code>pdfs/</code> y que el nombre coincida exactamente.`;
    document.getElementById('btnAbrirNueva').style.display = 'none';
    document.getElementById('btnDescargar').style.display  = 'none';
    return;
  }

  document.getElementById('visorMsg').textContent = fileName;
  const aNueva = document.getElementById('btnAbrirNueva');
  const aDesc  = document.getElementById('btnDescargar');
  aNueva.style.display = aDesc.style.display = 'inline-block';
  aNueva.href = url; aDesc.href = url;

  setPreview(url);
  estado.textContent = 'PDF listo.';
}

// ================== Init ==================
async function init() {
  try {
    document.getElementById('estado').textContent = 'Cargando…';
    const parsed = await cargarExcel(window.URL_EXCEL);
    armarIndice(parsed);
    document.getElementById('estado').textContent = 'Datos cargados correctamente.';
  } catch (e) {
    console.error('[app] Error en init:', e);
    document.getElementById('estado').textContent = `Error: ${e.message}`;
  }

  document.getElementById('btnBuscar')?.addEventListener('click', buscarYPintar);

  const sapInput = document.getElementById('inputSap');
  if (sapInput) {
    sapInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') buscarYPintar();
    });
  }
}
document.addEventListener('DOMContentLoaded', init);
