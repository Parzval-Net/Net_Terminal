import { runAudit, type AuditInput, type AuditOptions, type AuditResult } from "./audit";
import type { ResolvedRules } from "./auditRules";

/**
 * Auditoría en un Web Worker (fuera del hilo de la interfaz). Mismos resultados que runAudit; si el
 * navegador no permite workers o el worker falla al cargar, se calcula en el hilo principal.
 */
let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (r: AuditResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./auditWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: AuditResult; error?: string }>) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.error !== undefined) job.reject(new Error(e.data.error));
      else job.resolve(e.data.result!);
    };
    worker.onerror = () => {
      // El worker no cargó: los trabajos pendientes y los siguientes se calculan en el hilo principal.
      worker?.terminate();
      worker = null;
      for (const [id, job] of pending) {
        pending.delete(id);
        job.reject(new Error("worker"));
      }
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function runAuditAsync(input: AuditInput, resolved: ResolvedRules, opts: AuditOptions = {}): Promise<AuditResult> {
  const w = typeof Worker === "function" ? getWorker() : null;
  if (!w) return Promise.resolve().then(() => runAudit(input, resolved, opts));
  const id = ++nextId;
  return new Promise<AuditResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, input, resolved, opts });
  }).catch((e: Error) => {
    if (e.message === "worker") return runAudit(input, resolved, opts);
    throw e;
  });
}
