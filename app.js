/* app.js - versión robusta (GitHub Raw) */

(() => {
  const $ = (sel) => document.querySelector(sel);

  const elEstado   = $("#estado");
  const elExcelRem = $("#excelRemoto");
  const elPdfsRem  = $("#pdfsRemotos");

  const elSelectCat = $("#selectCategoria");
  const elInputSap  = $("#inputSap");
  const elBtnBuscar = $("#btnBuscar");
  const elBtnRetry  = $("#btnReintentar");

  const elVisorMsg  = $("#visorMsg");
  const elAbrir     = $("#btnAbrirNueva");
  const elDesc      = $("#btnDescargar");

  // Expuestas por env-gh.js (ya comprobamos que están bien)
  const URL_EXCEL = window.URL_EXCEL;
  const PDF_BASE  = window.PDF_BASE;

  // Estado en memoria
  let rows = [];           // filas puras (sin encabezado)
  let headers = [];        // encabezados normalizados
  let data = [];           // [{sap, categoria, archivo}]
  let categorias = [];     // únicas

  // Normaliza texto: trim, lower, sin acentos
  const normalize = (s) =>
    (s == null ? "" : String(s))
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu,"");

  function logStatus(msg, ok=true){
    elEstado.textContent = msg;
    elEstado.style.color = ok ? "#16a34a" : "#b91c1c";
  }

  function showInfoPaths(){
    // Solo para UI informativa, ya lo venías mostrando
    if (elExcelRem) elExcelRem.textContent = URL_EXCEL || "(sin URL_EXCEL)";
    if (elPdfsRem)  elPdfsRem.textContent  = PDF_BASE  || "(sin PDF_BASE)";
  }

  // Detecta índices de columnas en el header
  function detectarColumnas(hdrs) {
    // Mientras más patrones, mejor tolerante
    const idxSAP = hdrs.findIndex(h =>
      ["sap", "codigo", "codigosap", "id"].some(p => h === p || h.includes(p))
    );

    const idxCategoria = hdrs.findIndex(h =>
      ["categoria", "categoría", "category", "tipo", "grupo"].some(p => h.includes(p))
    );

    const idxArchivo = hdrs.findIndex(h =>
      ["archivo", "pdf", "file", "documento", "nombre"].some(p => h.includes(p))
    );

    return { idxSAP, idxCategoria, idxArchivo };
  }

  async function cargarExcel() {
    try {
      logStatus("Cargando Excel desde GitHub Raw…", true);
      const res = await fetch(URL_EXCEL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status} al cargar Excel`);
      const ab = await res.arrayBuffer();

      // XLSX debe existir (lo cargas en index antes de app.js)
      const wb = XLSX.read(ab, { type: "array" });

      // Toma la primera hoja no vacía (o la primera si te sirve)
      const sheetNames = wb.SheetNames;
      let ws;
      let pickedName = "";

      for (const name of sheetNames) {
        const tmp = wb.Sheets[name];
        const r = XLSX.utils.sheet_to_json(tmp, { header: 1, defval: "" });
        if (Array.isArray(r) && r.length > 0) {
          ws = tmp;
          pickedName = name;
          break;
        }
      }
      if (!ws) throw new Error("No se encontró una hoja válida en el Excel");

      const r = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (!Array.isArray(r) || r.length < 2) {
        throw new Error("El Excel no tiene filas suficientes (necesita encabezado + datos)");
      }

      const rawHeaders = r[0].map(x => String(x));
      headers = rawHeaders.map(normalize);
      rows = r.slice(1); // sin encabezado

      console.log("[app] Hoja usada:", pickedName);
      console.log("[app] Encabezados brutos:", rawHeaders);
      console.log("[app] Encabezados normalizados:", headers);

      const { idxSAP, idxCategoria, idxArchivo } = detectarColumnas(headers);
      console.log("[app] idxSAP / idxCategoria / idxArchivo =>", idxSAP, idxCategoria, idxArchivo);

      if (idxSAP === -1 || idxCategoria === -1 || idxArchivo === -1) {
        logStatus("No se encontraron columnas SAP/Categoria/Archivo en el Excel.", false);
        console.warn(
          "[app] Columnas requeridas no detectadas. " +
          "Asegúrate de tener columnas tipo: SAP | Categoria | Archivo (nombres tolerantes)."
        );
        return;
      }

      // Construye dataset limpio
      data = rows
        .map((row) => {
          const sap = String(row[idxSAP] ?? "").trim();
          const cat = String(row[idxCategoria] ?? "").trim();
          const arc = String(row[idxArchivo] ?? "").trim();
          return { sap, categoria: cat, archivo: arc };
        })
        .filter(item => item.archivo && item.categoria); // al menos estos 2

      // Categorías únicas
      const setCat = new Set(data.map(d => d.categoria).filter(Boolean));
      categorias = [...setCat].sort((a,b) => a.localeCompare(b, "es"));

      // Llena el combo
      llenarCategorias();

      logStatus("Datos cargados correctamente.");
      console.log("[app] Filas de datos:", data.length);
      console.log("[app] Categorías:", categorias);

    } catch (err) {
      logStatus(`Error al cargar Excel: ${err.message}`, false);
      console.error("[app] Error cargando Excel:", err);
    }
  }

  function llenarCategorias() {
    // Limpia el select (mantiene la opción “—”)
    while (elSelectCat.options.length > 1) elSelectCat.remove(1);
    categorias.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      elSelectCat.appendChild(opt);
    });
  }

  function buscar() {
    elAbrir.style.display = "none";
    elDesc.style.display  = "none";
    elAbrir.href = "#";
    elDesc.href  = "#";

    const sap = (elInputSap.value || "").trim();
    const cat = elSelectCat.value;

    if (!sap) {
      elVisorMsg.textContent = "Ingresa un SAP.";
      return;
    }
    if (!cat) {
      elVisorMsg.textContent = "Selecciona una categoría.";
      return;
    }

    const res = data.filter(d =>
      String(d.sap).trim() === sap && String(d.categoria).trim() === cat
    );

    if (!res.length) {
      elVisorMsg.textContent = "Sin resultados para ese SAP y categoría.";
      return;
    }

    const archivo = res[0].archivo;
    const url = `${PDF_BASE}${encodeURIComponent(archivo)}`;

    elVisorMsg.textContent = `Archivo: ${archivo}`;
    elAbrir.href = url;
    elDesc.href  = url;
    elAbrir.style.display = "inline-block";
    elDesc.style.display  = "inline-block";
  }

  function events(){
    elBtnBuscar.addEventListener("click", buscar);
    elBtnRetry?.addEventListener("click", () => {
      data = []; categorias = []; rows = []; headers = [];
      llenarCategorias();
      logStatus("Reintentando…", true);
      cargarExcel();
    });
  }

  function init(){
    showInfoPaths();
    events();
    cargarExcel();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
