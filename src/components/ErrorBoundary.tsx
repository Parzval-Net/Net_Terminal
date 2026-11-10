import { Component, type ErrorInfo, type ReactNode } from "react";
import { Copy, RefreshCcw } from "lucide-react";

interface State {
  error: Error | null;
  info: string;
  copied: boolean;
}

/**
 * Detalle para informar el fallo. Solo trae el nombre y mensaje del error, la pila técnica y los
 * componentes involucrados: nunca contenido de terminales, notas, sesiones ni ajustes.
 */
export function errorDetail(error: Error, componentStack: string): string {
  const msg = String(error.message ?? error).slice(0, 500);
  return [
    "NetTerminal: error de interfaz",
    `Fecha: ${new Date().toISOString()}`,
    `Error: ${error.name}: ${msg}`,
    "",
    "Pila:",
    String(error.stack ?? "(sin pila)").split("\n").slice(0, 25).join("\n"),
    "",
    "Componentes:",
    componentStack.trim() || "(sin datos)",
  ].join("\n");
}

/**
 * Pantalla de recuperación para un error al dibujar la interfaz (antes quedaba la ventana en
 * blanco). Recargar solo reinicia la interfaz: sesiones, notas y ajustes están en disco. Las
 * conexiones abiertas viven en el proceso de la app (Rust), así que recargar no las corta, pero
 * la interfaz nueva empieza sin pestañas y no puede retomarlas: siguen activas en segundo plano
 * hasta cerrar NetTerminal.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: "", copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("NetTerminal: error al dibujar la interfaz", error, info.componentStack);
    this.setState({ info: info.componentStack ?? "" });
  }

  copy = () => {
    const { error, info } = this.state;
    if (!error) return;
    const text = errorDetail(error, info);
    const done = () => this.setState({ copied: true });
    navigator.clipboard?.writeText(text).then(done, () => {
      // Sin permiso de portapapeles: se selecciona el detalle para copiarlo a mano.
      const el = document.getElementById("nt-error-detail");
      if (el) window.getSelection()?.selectAllChildren(el);
    });
  };

  render() {
    const { error, info, copied } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="h-full grid place-items-center bg-bg text-fg p-6" role="alert">
        <div className="w-full max-w-[560px] space-y-3 text-[13px]">
          <h1 className="text-[16px] font-semibold">NetTerminal no pudo mostrar la ventana</h1>
          <p className="text-muted">
            Ocurrió un error al dibujar la interfaz. Tus sesiones, notas y ajustes siguen guardados en la carpeta de datos.
          </p>
          <p className="font-mono text-[12px] break-words select-text">
            {error.name}: {String(error.message ?? error).slice(0, 300)}
          </p>
          <p className="text-muted text-[12px]">
            Al recargar, la interfaz empieza sin pestañas. Las conexiones que estaban abiertas no se cortan, pero no se pueden retomar
            y siguen activas en segundo plano hasta que cierres NetTerminal.
          </p>
          <div className="flex items-center gap-2">
            <button
              autoFocus
              className="h-8 px-3.5 inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-fg font-medium"
              onClick={() => location.reload()}
            >
              <RefreshCcw size={13} />
              Recargar la interfaz
            </button>
            <button
              className="h-8 px-3.5 inline-flex items-center gap-1.5 rounded-md border border-line hover:bg-hover"
              onClick={this.copy}
            >
              <Copy size={13} />
              {copied ? "Detalle copiado" : "Copiar detalle"}
            </button>
          </div>
          <details>
            <summary className="cursor-pointer text-muted text-[12px]">Ver detalle técnico</summary>
            <pre id="nt-error-detail" className="mt-2 text-[11px] whitespace-pre-wrap break-words max-h-56 overflow-y-auto select-text">
              {errorDetail(error, info)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
