// env-gh.js
(function () {
  try {
    var ENV = window.ENV || {};
    var owner     = ENV.GH_OWNER;
    var repo      = ENV.GH_REPO;
    var branch    = ENV.GH_BRANCH;
    var pathPdfs  = ENV.GH_PATH_PDFS || '';
    var pathExcel = ENV.GH_PATH_EXCEL || '';

    if (!owner || !repo || !branch) {
      console.warn('[env-gh] ENV incompleta. Define GH_OWNER, GH_REPO y GH_BRANCH en window.ENV.');
      return;
    }

    // Normalizadores simples
    function norm(p) { return (p || '').replace(/^\/+/, ''); }            // quita / iniciales
    function trail(p) { return /\/$/.test(p) ? p : (p + '/'); }           // asegura / final

    // Bases para cada tipo de recurso
    var RAW_BASE   = 'https://raw.githubusercontent.com/' +
                     owner + '/' + repo + '/' + branch + '/';

    // Para archivos bajo Git-LFS (PDFs) usar media.githubusercontent.com
    var MEDIA_BASE = 'https://media.githubusercontent.com/media/' +
                     owner + '/' + repo + '/' + branch + '/';

    // Rutas finales que usará la app
    window.URL_EXCEL = RAW_BASE   + norm(pathExcel);          // Excel por raw
    window.PDF_BASE  = MEDIA_BASE + trail(norm(pathPdfs));    // PDFs por media (LFS)

    // Útil para depurar/mostrar en UI
    window.DATA_REPO = {
      RAW_BASE,
      MEDIA_BASE,
      EXCEL: window.URL_EXCEL,
      PDF_BASE: window.PDF_BASE,
      OWNER: owner,
      REPO: repo,
      BRANCH: branch
    };

    // Logs informativos
    console.log('[env-gh] RAW_BASE   =>', RAW_BASE);
    console.log('[env-gh] MEDIA_BASE =>', MEDIA_BASE);
    console.log('[env-gh] URL_EXCEL  =>', window.URL_EXCEL);
    console.log('[env-gh] PDF_BASE   =>', window.PDF_BASE);
  } catch (err) {
    console.error('[env-gh] Error:', err);
  }
})();
