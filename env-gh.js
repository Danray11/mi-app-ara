// env-gh.js
(function () {
  const ENV = window.ENV || {};
  const OWNER  = ENV.GH_OWNER  || 'Danray11';
  const REPO   = ENV.GH_REPO   || 'ara-data';
  const BRANCH = ENV.GH_BRANCH || 'main';
  const PATH_XLSX = (ENV.GH_PATH_EXCEL || 'data/Layout.xlsx').replace(/^\/+/, '');
  const PATH_PDFS = (ENV.GH_PATH_PDFS  || 'pdfs/').replace(/^\/+/, '').replace(/\/+$/, '') + '/';

  // RAW para Excel
  const RAW_BASE   = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/`;
  // MEDIA para PDFs (sirve binarios bajo Git LFS)
  const MEDIA_BASE = `https://media.githubusercontent.com/media/${OWNER}/${REPO}/${BRANCH}/`;

  // Expone URLs globales
  window.URL_EXCEL = RAW_BASE + PATH_XLSX;
  window.PDF_BASE  = MEDIA_BASE + PATH_PDFS;

  // (opcional) Mostrar en UI
  const setTxt = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  setTxt('excelRemoto', window.URL_EXCEL);
  setTxt('pdfsRemotos', window.PDF_BASE);

  // Logs útiles
  console.log('[env-gh] RAW_BASE   =>', RAW_BASE);
  console.log('[env-gh] MEDIA_BASE =>', MEDIA_BASE);
  console.log('[env-gh] URL_EXCEL  =>', window.URL_EXCEL);
  console.log('[env-gh] PDF_BASE   =>', window.PDF_BASE);
})();
