// ================== Utiles ==================
const norm = (s) => String(s ?? '')
  .trim()
  .toUpperCase()
  .normalize('NFD')                 // separa acentos
  .replace(/[\u0300-\u036f]/g, '')  // quita acentos
  .replace(/\s*&\s*/g, ' & ')       // espacios alrededor de &
  .replace(/\s+/g, ' ')             // colapsa espacios
  .replace(/[^\w &-]/g, '');        // deja letras/números/espacio/&/-

const isRowEmpty = (row=[]) => row.every(v => String(v ?? '').trim() === '');

// ================== Cargar Excel ==================
async function cargarExcel(url) {
  console.log('[app] URL_EXCEL =>', url);

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo descargar el Excel (${res.status})`);
  const ab = await res.arrayBuffer();

  const wb = XLSX.read(ab, { type: 'array' });
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];

  // Matriz cruda
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });

  // Primera fila no vacía -> encabezados
  const headerRowIdx = rows.findIndex(r => !isRowEmpty(r));
  if (headerRowIdx < 0) throw new Error('No se encontró ninguna fila con datos.');
  const rawHeaders = rows[headerRowIdx];
  const headers = rawHeaders.map(norm);

  console.log('[app] Hoja =>', wsName);
  console.log('[app] Fila de encabezados:', headerRowIdx, '| Encabezados (normalizados):', headers);

  // Ubicar columna SAP con tolerancia
  const candidatesSAP = ['SAP', 'COD SAP', 'CODIGO SAP', 'ID SAP'];
  let sapCol = -1;
  for (const c of candidatesSAP) {
    const i = headers.indexOf(norm(c));
    if (i >= 0) { sapCol = i; break; }
  }
  if (sapCol < 0) throw new Error('No se encontró la columna SAP en los encabezados.');

  // Columnas de categoría = todas las que no sean claves conocidas
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

  // Cuerpo de datos
  const data = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (isRowEmpty(row)) continue;

    const sapVal = String(row[sapCol] ?? '').trim();
    if (!sapVal) continue;

    const reg = { SAP: sapVal };
    for (const ci of catCols) {
      const catName = headers[ci];                 // nombre normalizado
      const val = String(row[ci] ?? '').trim();    // valor del PDF (sin .pdf)
      reg[catName] = val;
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

  // Llenar <select>
  const sel = document.getElementById('selectCategoria');
  sel.innerHTML = '';
  const optEmpty = document.createElement('option');
  optEmpty.value = '';
  optEmpty.textContent = '—';
  sel.appendChild(optEmpty);
  for (const cat of categorias) {
    const o = document.createElement('option');
    o.value = cat;      // ya viene normalizado
    o.textContent = cat;
    sel.appendChild(o);
  }

  // Índice por SAP
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

// ================== Visor PDFJS (versión fijada) ==================
// Usamos una versión estable que SÍ incluye /web/viewer.html
const PDFJS_VIEWER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/web/viewer.html';

function setPreview(pdfUrl) {
  const cont  = document.getElementById('pdfContainer');
  const frame = document.getElementById('pdfFrame');
  if (!cont || !frame) return;

  const viewerUrl = `${PDFJS_VIEWER}?file=${encodeURIComponent(pdfUrl)}#zoom=page-width`;
  frame.src = viewerUrl;
  cont.style.display = 'block';
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

  // Tomar nombre del Excel y asegurar .pdf
  let fileName = INDICE.idx[sap][cat] || '';
  if (!fileName) {
    estado.textContent = `No hay PDF para SAP ${sap} en la categoría ${cat}.`;
    return;
  }
  if (!/\.pdf$/i.test(fileName)) fileName += '.pdf';

  // Construir URL final (MEDIA evita el .gitattributes Raw + LFS)
  const base = (window.PDF_BASE || '').replace(/\/+$/, '');
  const mediaUrl  = `${base}/${encodeURIComponent(fileName)}`;

  // Verificar existencia con HEAD
  const ok = await existePDF(mediaUrl);
  if (!ok) {
    console.warn('[app] 404 intentando:', mediaUrl);
    estado.innerHTML = `No se encontró el PDF en GitHub.<br><code>${mediaUrl}</code>`;
    document.getElementById('btnAbrirNueva').style.display = 'none';
    document.getElementById('btnDescargar').style.display  = 'none';
    return;
  }

  // Botones
  const aNueva = document.getElementById('btnAbrirNueva');
  const aDesc  = document.getElementById('btnDescargar');

  const viewerUrl = `${PDFJS_VIEWER}?file=${encodeURIComponent(mediaUrl)}`;

  aNueva.href = viewerUrl;
  aNueva.target = '_blank';
  aNueva.rel    = 'noopener';

  aDesc.href = mediaUrl;
  aDesc.removeAttribute('download'); // dejamos que el navegador maneje descarga

  // Vista previa embebida
  setPreview(mediaUrl);

  document.getElementById('visorMsg').textContent = fileName;
  aNueva.style.display = aDesc.style.display = 'inline-block';
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
}
document.addEventListener('DOMContentLoaded', init);
