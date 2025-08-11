// netlify/functions/publish.js
// Usa la API de stores de @netlify/blobs: getStore() / getDeployStore()

const bad = (code, message, extra = {}) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ok: false, code, message, ...extra })
});

async function getStores() {
  const mod = await import('@netlify/blobs');

  // Preferimos getStore; si no está, probamos getDeployStore
  if (typeof mod.getStore === 'function') {
    const excel = await mod.getStore({ name: 'excel' });
    const pdfs  = await mod.getStore({ name: 'pdfs' });
    return { excel, pdfs, api: 'getStore' };
  }
  if (typeof mod.getDeployStore === 'function') {
    const excel = await mod.getDeployStore({ name: 'excel' });
    const pdfs  = await mod.getDeployStore({ name: 'pdfs' });
    return { excel, pdfs, api: 'getDeployStore' };
  }
  return { excel: null, pdfs: null, api: 'none', keys: Object.keys(mod || {}) };
}

export const handler = async (event) => {
  // 1) Obtener stores
  const { excel, pdfs, api, keys } = await getStores();
  if (!excel || !pdfs) {
    return bad(500, 'El SDK @netlify/blobs no expone getStore/getDeployStore', { api, keys });
  }

  try {
    // 2) Validar método
    if (event.httpMethod !== 'POST') {
      return bad(405, 'Method Not Allowed (usa POST)');
    }

    // 3) Parseo del JSON
    const bodySize = Buffer.byteLength(event.body || '', 'utf8');
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return bad(400, 'Cuerpo inválido. Se espera JSON.', { bodySize });
    }

    const { excel: excelFile, pdfs: pdfFiles } = payload;
    const uploaded = [];

    // 4) Guardar Excel (en el store "excel")
    if (excelFile?.name && excelFile?.contentBase64) {
      const buf = Buffer.from(excelFile.contentBase64, 'base64');
      const key = excelFile.name; // en este API, la clave es el nombre dentro del store
      await excel.set(key, buf, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      uploaded.push({ type: 'excel', key, size: buf.length });
      console.log('[publish] Excel subido:', key, 'size:', buf.length);
    }

    // 5) Guardar PDFs (en el store "pdfs")
    if (Array.isArray(pdfFiles)) {
      for (const f of pdfFiles) {
        if (!(f?.name && f?.contentBase64)) continue;
        const buf = Buffer.from(f.contentBase64, 'base64');
        const key = f.name;
        await pdfs.set(key, buf, { contentType: 'application/pdf' });
        uploaded.push({ type: 'pdf', key, size: buf.length });
        console.log('[publish] PDF subido:', key, 'size:', buf.length);
      }
    }

    // 6) Respuesta OK
    const baseExcel = `${process.env.URL || ''}/.netlify/blobs/excel/`;
    const basePdfs  = `${process.env.URL || ''}/.netlify/blobs/pdfs/`;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        uploaded,
        bodySize,
        apiUsed: api,
        bases: { excel: baseExcel, pdfs: basePdfs }
      })
    };

  } catch (err) {
    console.error('[publish] fatal error:', err);
    return bad(500, 'Error interno en publish', { error: String(err?.message || err) });
  }
};

