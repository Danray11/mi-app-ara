// env-gh.js
(function () {
  const ENV = (window.ENV || {});
  const { GH_OWNER, GH_REPO, GH_BRANCH, GH_PATH_PDFS, GH_PATH_EXCEL } = ENV;

  // Validaciones básicas
  if (!GH_OWNER || !GH_REPO || !GH_BRANCH) {
    console.warn('[env-gh] ENV incompleta. Define GH_OWNER, GH_REPO y GH_BRANCH en window.ENV.');
    return;
  }

  // Base Raw de GitHub
  const RAW_BASE = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/`;

  // Normalizamos rutas para evitar dobles barras
  const norm = (p) => (p || '').replace(/^\/+/, '');

  // EXPONE GLOBALES que tu app.js ya usa:
  window.URL_EXCEL = RAW_BASE + norm(GH_PATH_EXCEL);  // p.ej. .../data/Layout.xlsx
  window.PDF_BASE  = RAW_BASE + norm(GH_PATH_PDFS);   // p.ej. .../pdfs/

  // Útil para mostrar en UI o depurar
  window.DATA_REPO = {
    RAW_BASE,
    EXCEL: window.URL_EXCEL,
    PDF_BASE: window.PDF_BASE,
    OWNER: GH_OWNER, REPO: GH_REPO, BRANCH: GH_BRANCH
  };

  // Log informativo
  console.log('[env-gh] URL_EXCEL =>', window.URL_EXCEL);
  console.log('[env-gh] PDF_BASE  =>', window.PDF_BASE);
})();

