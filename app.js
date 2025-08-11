// === utilidades de normalización ===
const norm = (s) => String(s ?? '')
  .trim()
  .toUpperCase()
  .normalize('NFD')                 // separa acentos
  .replace(/[\u0300-\u036f]/g, '')  // quita acentos
  .replace(/\s*&\s*/g, ' & ')       // normaliza espacios alrededor de &
  .replace(/\s+/g, ' ')             // colapsa espacios
  .replace(/[^\w &-]/g, '');        // limpia raro (deja letras/números/espacio/&/-)

const isRowEmpty = (row=[]) => row.every(v => String(v ?? '').trim() === '');

// === carga Excel desde RAW ===
async function cargarExcel(url) {
  console.log('[app] URL_EXCEL =>', url);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo descargar el Excel (${res.status})`);
  const ab = await res.arrayBuffer();

  const wb = XLSX.read(ab, { type: 'array' });
  const wsName = wb.SheetNames[0];     // primera hoja
  const ws = wb.Sheets[wsName];

  // matriz de celdas
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });

  // encuentra la primera fila no vacía como encabezados
  let headerRowIdx = rows.findIndex(r => !isRowEmpty(r));
  if (headerRowIdx < 0) throw new Error('No se encontró ninguna fila con datos en el Excel.');

  const rawHeaders = rows[headerRowIdx];
  const headers = rawHeaders.map(norm);

  console.log('[app] Hoja =>', wsName);
  console.log('[app] Fila de encabezados:', headerRowIdx, ' | Encabezados (normalizados):', headers);

  // busca la columna SAP de forma robusta
  const candidatesSAP = ['SAP', 'COD SAP', 'CODIGO SAP', 'ID SAP'];
  let sapCol = -1;
  for (const c of candidatesSAP) {
    const i = headers.indexOf(norm(c));
    if (i >= 0) { sapCol = i; break; }
  }
  if (sapCol < 0) {
    throw new Error('No se encontró la columna SAP en los encabezados. Encabezados vistos: ' + JSON.stringify(headers));
  }

  // detecta columnas de categorías (todas las que no sean claves conocidas)
  const claveNoCategoria = new Set([
    norm('REGIÓN'), norm('REGION'),
    norm('Z'), norm('ZONA'),
    norm('TIENDA'), norm('SURTIDO'),
    norm('TIPOLOGIA'), norm('TIPOLOGÍA'),
    norm('TIPO DE TIENDA POR MÓDULOS ORIGINAL'),
    norm('TIPO DE TIENDA POR MODULOS ORIGINAL'),
    norm('SAP')
  ]);

  const catCols = headers
    .map((h, idx) => ({ h, idx }))
    .filter(o => !claveNoCategoria.has(o.h) && o.idx !== sapCol)
    .map(o => o.idx);

  if (catCols.length === 0) {
    throw new Error('No se detectaron columnas de categoría. Encabezados vistos: ' + JSON.stringify(headers));
  }

  // categorías normalizadas (para el <select>)
  const categorias = catCols.map(i => headers[i]);
  console.log('[app] Categorías detectadas =>', categorias);

  // arma el índice { sap: { CATEGORIA: nombrePdf } }
  const data = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (isRowEmpty(row)) continue;
    const sapVal = String(row[sapCol] ?? '').trim();
    if (!sapVal) continue;

    const reg = { SAP: sapVal };
    for (const ci of catCols) {
      const catName = headers[ci];
      reg[catName] = String(row[ci] ?? '').trim();
    }
    data.push(reg);
  }

  console.log('[app] Filas útiles:', data.length);
  return { headers, sapCol, catCols, categorias, data };
}

// === arma índice y llena el select ===
let INDICE = null;

function armarIndice(parsed) {
  const { data, categorias } = parsed;

  // llena el <select> de categorías
  const sel = document.getElementById('selectCategoria');
  sel.innerHTML = '';
  const optEmpty = document.createElement('option');
  optEmpty.value = '';
  optEmpty.textContent = '—';
  sel.appendChild(optEmpty);
  for (const cat of categorias) {
    const o = document.createElement('option');
    o.value = cat;
    o.textContent = cat;     // ya viene normalizado
    sel.appendChild(o);
  }

  // índice por SAP
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

// === búsqueda y construcción de URL de PDF ===
function buscarYPintar() {
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
  const fileName = INDICE.idx[sap][cat] || '';
  if (!fileName) {
    estado.textContent = `No hay PDF para SAP ${sap} en la categoría ${cat}.`;
    return;
  }

  // PDF_BASE viene de env-gh.js (Media/LFS)
  const base = (window.PDF_BASE || '').replace(/\/+$/, '');
  const url = `${base}/${encodeURIComponent(fileName)}.pdf`;
  console.log('[app] PDF =>', url);

  // pinta visor/botones
  document.getElementById('visorMsg').textContent = fileName;
  const aNueva = document.getElementById('btnAbrirNueva');
  const aDesc  = document.getElementById('btnDescargar');
  aNueva.style.display = aDesc.style.display = 'inline-block';
  aNueva.href = url; aDesc.href = url;
}

// === init ===
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

  // eventos
  document.getElementById('btnBuscar')?.addEventListener('click', buscarYPintar);
}
document.addEventListener('DOMContentLoaded', init);
