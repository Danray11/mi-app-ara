<script>
(() => {
  const OWNER  = 'Danray11';
  const REPO   = 'ara-data';
  const BRANCH = 'main';

  // MEDIA para todo (evita problema de punteros LFS)
  const MEDIA_BASE = `https://media.githubusercontent.com/media/${OWNER}/${REPO}/${BRANCH}/`;

  // Exponer rutas globales que usa app.js
  window.URL_EXCEL = MEDIA_BASE + 'data/Layout.xlsx';
  window.PDF_BASE  = MEDIA_BASE + 'pdfs/';

  // Ayuda visual en UI (si existen esos spans)
  const excelSpan = document.getElementById('excelRemoto');
  const pdfsSpan  = document.getElementById('pdfsRemotos');
  if (excelSpan) excelSpan.textContent = window.URL_EXCEL;
  if (pdfsSpan)  pdfsSpan.textContent  = window.PDF_BASE;

  console.log('[env-gh] MEDIA_BASE =>', MEDIA_BASE);
  console.log('[env-gh] URL_EXCEL =>', window.URL_EXCEL);
  console.log('[env-gh] PDF_BASE  =>', window.PDF_BASE);
})();
</script>
