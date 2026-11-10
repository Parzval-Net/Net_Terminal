import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Sin StrictMode: el doble montaje en desarrollo abriría cada conexión dos veces.
// ErrorBoundary: un error al dibujar muestra la pantalla de recuperación en vez de una ventana en blanco.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
