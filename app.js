// ================== Utiles ==================
const norm = (s) => String(s ?? '')
  .trim()
  .toUpperCase()
  .normalize('NFD')                 // separa acentos
  .replace(/[\u0300-\u036f]/g, '')  // quita acentos
  .replace(/\s*&\s*/g, ' & ')       // espacios alrededor de &
  .replace(/\s+/g, ' ')             // colapsa espacios
  .replace(/[^\w &-]/g, '');        // deja letras/números/espacio/&/-

const isRowEmpty = (row = []) => row.every(v => String(v ?? '').trim() === '');

// ================== Cargar Excel (RAW/MEDIA) ==================
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
      const catName = headers[ci];                 // nombre normalizado (columna)
      const val = String(row[ci] ?? '').trim();    // valor: nombre del PDF (sin .pdf o con .pdf)
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

// ================== HEAD helper para verificar existencia ==================
async function existePDF(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

// ================== Visor PDF embebido ==================
const PDFJS_VIEWER = 'https://mozilla.github.io/pdf.js/web/viewer.html';

function setPreview(pdfUrl) {
  const cont  = document.getElementById('pdfContainer');
  const frame = document.getElementById('pdfFrame');
  if (!cont || !frame) return;

  // Usamos el visor oficial de Mozilla. IMPORTANTE:
  // - No incluir ningún <script> de pdfjs en el index para evitar conflictos de versión.
  // - GitHub Media permite CORS, por lo que el visor puede descargar el PDF sin problema.
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

  // Construir URL final (MEDIA — Git LFS)
  const base = (window.PDF_BASE || '').replace(/\/+$/, '');
  const url  = `${base}/${encodeURIComponent(fileName)}`;

  // Verificar existencia
  const ok = await existePDF(url);
  if (!ok) {
    console.warn('[app] 404 intentando:', url);
    estado.innerHTML = `No se encontró el PDF en GitHub.<br><code>${url}</code><br>
    Verifica que el archivo exista en <code>pdfs/</code> y que el nombre coincida exactamente (mayúsculas, guiones, espacios).`;
    document.getElementById('btnAbrirNueva').style.display = 'none';
    document.getElementById('btnDescargar').style.display  = 'none';
    // ocultar visor si fallo
    const cont = document.getElementById('pdfContainer');
    if (cont) cont.style.display = 'none';
    return;
  }

  // Pintar botones + previsualización
  document.getElementById('visorMsg').textContent = fileName;
  const aNueva = document.getElementById('btnAbrirNueva');
  const aDesc  = document.getElementById('btnDescargar');
  aNueva.style.display = aDesc.style.display = 'inline-block';
  aNueva.href = url;
  aDesc.href  = url;
  aDesc.download = fileName;

  setPreview(url);                 // <— aquí reactivamos la vista previa estable
  estado.textContent = 'PDF listo.';
}

// ================== Init ==================
async function init() {
  try {
    document.getElementById('estado').textContent = 'Cargando…';
    const parsed = await cargarExcel(window.URL_EXCEL);
    armarIndice(parsed);
    document.getElementById('estado').textContent = 'PDF listo.';
  } catch (e) {
    console.error('[app] Error en init:', e);
    document.getElementById('estado').textContent = `Error: ${e.message}`;
  }

  document.getElementById('btnBuscar')?.addEventListener('click', buscarYPintar);
}
document.addEventListener('DOMContentLoaded', init);
