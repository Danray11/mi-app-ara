// netlify/functions/publish.js
// Función serverless para guardar Excel y PDFs en Netlify Blobs.
// Recibe JSON: { excel: { name, contentBase64 }, pdfs: [{ name, contentBase64 }, ...] }

import { set } from '@netlify/blobs'; // instalado en package.json

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Esperamos JSON (NO multipart aquí)
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, body: 'Cuerpo inválido. Se espera JSON.' };
    }

    const { excel, pdfs } = payload;
    const uploaded = [];

    // 1) Guardar Excel
    if (excel?.name && excel?.contentBase64) {
      const buf = Buffer.from(excel.contentBase64, 'base64');
      const key = `excel/${excel.name}`;
      await set(key, buf, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      uploaded.push({ type: 'excel', key });
    }

    // 2) Guardar PDFs
    if (Array.isArray(pdfs)) {
      for (const f of pdfs) {
        if (f?.name && f?.contentBase64) {
          const buf = Buffer.from(f.contentBase64, 'base64');
          const key = `pdfs/${f.name}`;
          await set(key, buf, { contentType: 'application/pdf' });
          uploaded.push({ type: 'pdf', key });
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        uploaded,
        // Las URLs públicas en Blobs se acceden bajo /.netlify/blobs/<key>
        baseUrl: `${process.env.URL || ''}/.netlify/blobs/`
      })
    };

  } catch (err) {
    console.error('publish error:', err);
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
};
