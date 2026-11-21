import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DataGate } from "./components/DataGate";
import { prefetchSettings } from "./lib/settings";

// Los ajustes se piden ya, en paralelo con el estado de la carpeta cifrada que consulta DataGate.
prefetchSettings();

// Sin StrictMode: el doble montaje en desarrollo abriría cada conexión dos veces.
// ErrorBoundary: un error al dibujar muestra la pantalla de recuperación en vez de una ventana en blanco.
// DataGate: con la carpeta portable cifrada, la app no se monta hasta desbloquear (ver lib/dataCrypt.ts).
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <DataGate>
      <App />
    </DataGate>
  </ErrorBoundary>,
);
