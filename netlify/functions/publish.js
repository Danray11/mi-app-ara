// netlify/functions/publish.js
// Sube Excel + PDFs a un repo de GitHub usando un token PRIVADO guardado como variable de entorno.
// No necesitas dependencias externas. Funciona con el fetch nativo de Netlify (Node 18+).

/** Convierte ArrayBuffer/Buffer a base64 */
function toBase64(buf) {
  if (Buffer.isBuffer(buf)) return buf.toString('base64');
  return Buffer.from(new Uint8Array(buf)).toString('base64');
}

/** PUT al GitHub Contents API (crea/actualiza archivo) */
async function putToGitHub({ owner, repo, branch, path, contentBase64, message, token }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'netlify-fn',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  // 1) Si ya existe, obtener sha para actualizar
  let sha;
  {
    const checkUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const res = await fetch(checkUrl, { headers });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json && json.sha) sha = json.sha;
    }
  }

  // 2) Subir (crear o actualizar)
  const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: contentBase64,
    branch,
    ...(sha ? { sha } : {}),
  };
  const putRes = await fetch(putUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!putRes.ok) {
    const txt = await putRes.text();
    throw new Error(`GitHub PUT ${path} -> ${putRes.status}: ${txt}`);
  }
  return putRes.json();
}

/** Parseo simple de multipart/form-data (válido para cargas medianas). */
function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  // Cortar por boundary
  const chunks = buffer.split ? buffer.split(delimiter) : buffer.toString('binary').split(delimiter.toString('binary'));

  // Normalizamos a string binario para evitar problemas de encoding
  const asBinary = Buffer.isBuffer(buffer) ? buffer.toString('binary') : buffer;
  const pieces = asBinary.split(delimiter.toString('binary'));

  for (let piece of pieces) {
    // Ignorar prefijos/sufijos
    if (!piece || piece === '--\r\n' || piece === '--') continue;

    // Separar headers y body
    const sep = '\r\n\r\n';
    const idx = piece.indexOf(sep);
    if (idx === -1) continue;

    const rawHeaders = piece.slice(0, idx);
    let rawBody = piece.slice(idx + sep.length);

    // Quitar cierre final
    if (rawBody.endsWith('\r\n')) rawBody = rawBody.slice(0, -2);
    if (rawBody.endsWith('--')) rawBody = rawBody.slice(0, -2);

    const headerLines = rawHeaders.split('\r\n').filter(Boolean);
    const cd = headerLines.find(h => /content-disposition/i.test(h)) || '';
    const ct = headerLines.find(h => /content-type/i.test(h)) || '';

    const nameMatch = cd.match(/name="([^"]+)"/i);
    const fileMatch = cd.match(/filename="([^"]*)"/i);

    const name = nameMatch ? nameMatch[1] : '';
    const filename = fileMatch ? fileMatch[1] : '';

    // Reconstruir body como Buffer binario
    const data = Buffer.from(rawBody, 'binary');

    parts.push({ name, filename, contentType: ct, data });
  }
  return parts;
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // ====== Variables de entorno (configúralas en Netlify) ======
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // PAT con permiso contents:write
    const GH_OWNER = process.env.GH_OWNER;         // tu usuario/org de GitHub
    const GH_REPO  = process.env.GH_REPO;          // repo de destino (ej: ara-data)
    const GH_BRANCH = process.env.GH_BRANCH || 'main';

    if (!GITHUB_TOKEN || !GH_OWNER || !GH_REPO) {
      return { statusCode: 500, body: 'Faltan variables: GITHUB_TOKEN, GH_OWNER, GH_REPO' };
    }

    // ====== Validar y extraer boundary ======
    const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
    if (!ct.startsWith('multipart/form-data')) {
      return { statusCode: 400, body: 'Content-Type esperado: multipart/form-data' };
    }
    const boundaryMatch = ct.match(/boundary=([^;]+)/i);
    if (!boundaryMatch) {
      return { statusCode: 400, body: 'No se encontró boundary en Content-Type' };
    }
    const boundary = boundaryMatch[1];

    // Body puede venir en base64
    const raw = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');

    // ====== Parsear multipart ======
    const parts = parseMultipart(raw, boundary);

    // Campos esperados (opcionales con default)
    let excelPath = 'data/Layout.xlsx';
    let pdfBase = 'pdfs/';

    const files = { excel: null, pdfs: [] };

    for (const p of parts) {
      if (p.filename) {
        // archivo
        if (p.name === 'excel' && p.filename) files.excel = p;
        if (p.name === 'pdfs' && p.filename)  files.pdfs.push(p);
      } else {
        // campo texto
        const val = p.data.toString('utf8');
        if (p.name === 'excelPath') excelPath = val || excelPath;
        if (p.name === 'pdfBase')   pdfBase   = val || pdfBase;
      }
    }

    const uploaded = [];

    // 1) Excel (opcional)
    if (files.excel && files.excel.filename) {
      const b64 = toBase64(files.excel.data);
      const path = excelPath;
      const msg = `chore: upload excel ${files.excel.filename} -> ${path}`;
      const res = await putToGitHub({
        owner: GH_OWNER, repo: GH_REPO, branch: GH_BRANCH,
        path, contentBase64: b64, message: msg, token: GITHUB_TOKEN
      });
      uploaded.push({ type: 'excel', path, ok: true, sha: res?.content?.sha });
    }

    // 2) PDFs (múltiples)
    for (const f of files.pdfs) {
      const safeName = f.filename.replace(/\\/g, '/').split('/').pop(); // nombre limpio
      const path = `${pdfBase.replace(/\/?$/, '/')}${safeName}`;
      const b64 = toBase64(f.data);
      const msg = `chore: upload pdf ${safeName} -> ${path}`;
      const res = await putToGitHub({
        owner: GH_OWNER, repo: GH_REPO, branch: GH_BRANCH,
        path, contentBase64: b64, message: msg, token: GITHUB_TOKEN
      });
      uploaded.push({ type: 'pdf', path, ok: true, sha: res?.content?.sha });

      // Pequeña pausa para evitar rate-limit
      await new Promise(r => setTimeout(r, 200));
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, uploaded }),
    };

  } catch (err) {
    console.error('publish.js error:', err);
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
};
