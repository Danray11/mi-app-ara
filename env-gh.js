/* env-gh.js
   Lee window.ENV (definida en index.html) y expone:
   - window.URL_EXCEL  -> URL cruda al Excel en GitHub
   - window.PDF_BASE   -> Carpeta base (raw) para los PDFs
   - window.DATA_REPO  -> info útil para depurar
*/

(function () {
  const ENV = (window.ENV || {});
  const { GH_OWNER, GH_REPO, GH_BRANCH, GH_PATH_PDFS, GH_PATH_EXCEL } = ENV;

  if (!GH_OWNER || !GH_REPO || !GH_BRANCH) {
    console.warn('[env-gh] ENV incompleta. Asegúrate de definir GH_OWNER, GH_REPO y GH_BRANCH en window.ENV (index.html).');
    return;
  }

  // Base Raw en GitHub
  const RAW_BASE = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/`;

  // Normaliza rutas (quita barras iniciales múltiples)
  const norm = (p) => (p || '').replace(/^\/+/, '');

  // Construye URLs finales
  const URL_EXCEL = RAW_BASE + norm(GH_PATH_EXCEL || 'data/Layout.xlsx');
  const PDF_BASE  = RAW_BASE + norm(GH_PATH_PDFS  || 'pdfs/');

  // Expone globales para app.js
  window.URL_EXCEL = URL_EXCEL;
  window.PDF_BASE  = /\/$/.test(PDF_BASE) ? PDF_BASE : (PDF_BASE + '/');

  // Útil para depuración
  window.DATA_REPO = {
    RAW_BASE,
    EXCEL: window.URL_EXCEL,
    PDF_BASE: window.PDF_BASE,
    OWNER: GH_OWNER,
    REPO : GH_REPO,
    BRANCH: GH_BRANCH
  };

  // Log informativo
  console.log('[env-gh] RAW_BASE =>', RAW_BASE);
  console.log('[env-gh] URL_EXCEL =>', window.URL_EXCEL);
  console.log('[env-gh] PDF_BASE  =>', window.PDF_BASE);
})();
