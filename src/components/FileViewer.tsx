import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { useModal } from "../lib/useModal";
import { type FileText as Content, logsearchExport, logsearchView } from "../lib/api";

/**
 * Visor de un log, respaldo o nota dentro de la app. Con la carpeta cifrada es la forma de leerlos:
 * el backend descifra en memoria y nada se escribe en claro al disco. "Exportar descifrado…" abre el
 * diálogo de guardado del sistema (el destino lo elige el usuario, fuera de la carpeta de datos).
 */
export function FileViewer({ kind, rel, onClose }: { kind: string; rel: string; onClose: () => void }) {
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const modal = useModal({ onClose });
  useEffect(() => {
    logsearchView(kind, rel)
      .then(setContent)
      .catch((e) => setError(String(e)));
  }, [kind, rel]);
  const exportFile = () => {
    setNote("");
    logsearchExport(kind, rel)
      .then((p) => p && setNote(`Exportado en claro a ${p}. Ese archivo ya no está protegido por la app.`))
      .catch((e) => setError(String(e)));
  };
  return (
    <div {...modal.overlay} className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4" onMouseDown={onClose}>
      <div
        {...modal.dialog}
        className="w-[880px] max-w-full h-[80vh] flex flex-col bg-panel border border-line rounded-xl shadow-pop p-4 gap-2"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-muted shrink-0" aria-hidden />
          <h2 id={modal.titleId} className="text-[13.5px] font-semibold truncate flex-1" title={rel}>
            {rel}
          </h2>
          {content?.encrypted && <span className="text-[11px] text-muted shrink-0">descifrado en memoria</span>}
        </div>
        {content?.truncated && <p className="text-[11.5px] text-warn">Se muestran los primeros 4 MB. Exporta el archivo para verlo completo.</p>}
        {content?.incomplete && <p className="text-[11.5px] text-warn">El archivo no tiene bloque de cierre: la grabación sigue o se cortó. Se muestra todo lo íntegro.</p>}
        {error && (
          <p role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        )}
        <pre tabIndex={0} aria-label={`Contenido de ${rel}`} className="flex-1 min-h-0 overflow-auto rounded-md border border-line bg-bg p-2 text-[12px] font-mono whitespace-pre-wrap break-all">
          {content ? content.text : error ? "" : "Cargando…"}
        </pre>
        {note && (
          <p role="status" className="text-[11.5px] text-accent">
            {note}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={exportFile} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-line hover:bg-hover">
            <Download size={13} aria-hidden /> {content?.encrypted ? "Exportar descifrado…" : "Exportar…"}
          </button>
          <button type="button" data-autofocus onClick={onClose} className="px-3.5 h-8 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
