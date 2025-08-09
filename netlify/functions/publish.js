// netlify/functions/publish.js
// Compat con distintas variantes del SDK @netlify/blobs
// - Usa set(...) si existe
// - Si no, intenta blobs().set(...) o createClient().set(...)
// Además, devuelve errores detallados para diagnóstico.

async function getSetFunction() {
  const mod = await import('@netlify/blobs');

  // Caso 1: API clásica: exporta set directamente
  if (typeof mod.set === 'function') {
    return mod.set;
  }

  // Caso 2: API basada en cliente: blobs()
  if (typeof mod.blobs === 'function') {
    const client = mod.blobs();
    if (client && typeof client.set === 'function') {
      return (key, data, options) => client.set(key, data, options);
    }
  }

  // Caso 3: API basada en cliente: createClient()
  if (typeof mod.createClient === 'function') {
    const client = mod.createClient();
    if (client && typeof client.set === 'function') {
      return (key, data, options) => client.set(key, data, options);
    }
  }

  throw new Error('El SDK @netlify/blobs no expone set(). Actualiza el paquete o usa una versión compatible.');
}

const bad = (code, message, extra = {}) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ok: false, code, message, ...extra })
});

export const handler = async (event) => {
  let setFn;
  try {
    setFn = await getSetFunction();
  } catch (e) {
    console.error('No se pudo obtener set() de @netlify/blobs:', e?.message);
    return bad(500, 'No se pudo obtener set() de @netlify/blobs', { error: String(e?.message || e) });
  }

  try {
    if (event.httpMethod !== 'POST') {
      return bad(405, 'Method Not Allowed (usa POST)');
    }

    const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
    if (!ct.includes('application/json')) {
      console.warn('Content-Type no es application/json:', ct);
    }

    const bodySize = Buffer.byteLength(event.body || '', 'utf8');
    console.log('Body size (bytes):', bodySize);

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      console.error('JSON parse error:', e?.message);
      return bad(400, 'Cuerpo inválido. Se espera JSON.', { bodySize });
    }

    const { excel, pdfs } = payload;
    const uploaded = [];

    // Guardar Excel
    if (excel?.name && excel?.contentBase64) {
      try {
        const buf = Buffer.from(excel.contentBase64, 'base64');
        const key = `excel/${excel.name}`;
        await setFn(key, buf, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        uploaded.push({ type: 'excel', key, size: buf.length });
        console.log('Subido Excel:', key, 'size:', buf.length);
      } catch (e) {
        console.error('Error subiendo Excel:', e?.message);
        return bad(500, 'Error guardando Excel', { error: String(e?.message || e) });
      }
    }

    // Guardar PDFs
    if (Array.isArray(pdfs)) {
      let idx = 0;
      for (const f of pdfs) {
        idx++;
        if (!(f?.name && f?.contentBase64)) continue;
        try {
          const buf = Buffer.from(f.contentBase64, 'base64');
          const key = `pdfs/${f.name}`;
          await setFn(key, buf, { contentType: 'application/pdf' });
          uploaded.push({ type: 'pdf', key, size: buf.length, idx });
          console.log('Subido PDF:', key, 'size:', buf.length);
        } catch (e) {
          console.error('Error subiendo PDF', f?.name, e?.message);
          return bad(500, `Error guardando PDF ${f?.name}`, { error: String(e?.message || e) });
        }
      }
    }

    const baseUrl = `${process.env.URL || ''}/.netlify/blobs/`;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, uploaded, baseUrl, bodySize })
    };

  } catch (err) {
    console.error('publish fatal error:', err);
    return bad(500, 'Error interno en publish', { error: String(err?.message || err) });
  }
};
