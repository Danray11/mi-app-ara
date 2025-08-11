export const handler = async () => {
  try {
    const mod = await import('@netlify/blobs');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        typeofModule: typeof mod,
        keys: Object.keys(mod || {}),
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: String(e?.message || e)
      })
    };
  }
};
