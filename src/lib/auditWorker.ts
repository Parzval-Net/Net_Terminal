// Web Worker de la auditoría: runAudit corre fuera del hilo de la interfaz, así una configuración
// grande (miles de políticas) no congela la app mientras se evalúa.
import { runAudit, type AuditInput, type AuditOptions } from "./audit";
import type { ResolvedRules } from "./auditRules";

interface Job {
  id: number;
  input: AuditInput;
  resolved: ResolvedRules;
  opts: AuditOptions;
}

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, input, resolved, opts } = e.data;
  try {
    self.postMessage({ id, result: runAudit(input, resolved, opts) });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
