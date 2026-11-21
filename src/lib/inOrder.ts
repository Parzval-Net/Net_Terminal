// Cola por tema para comandos del backend que guardan datos. Los comandos síncronos de Tauri corren en
// el hilo principal en el orden en que llegan; al pasarlos a async (fuera del hilo principal) dos
// llamadas seguidas pueden terminar en otro orden. Esta cola las envía de a una por tema, en el orden
// en que se pidieron, sin esperar las de otros temas.

const lanes = new Map<string, Promise<unknown>>();

/**
 * Ejecuta `call` cuando terminan (bien o con error) las llamadas anteriores de `lane`. Devuelve el
 * mismo resultado o error de `call`: el manejo sigue en quien llama.
 */
export function inOrder<T>(lane: string, call: () => Promise<T>): Promise<T> {
  const prev = lanes.get(lane) ?? Promise.resolve();
  const next = prev.then(call, call);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  lanes.set(lane, tail);
  // Sin llamadas pendientes, el tema no retiene nada.
  void tail.then(() => {
    if (lanes.get(lane) === tail) lanes.delete(lane);
  });
  return next;
}
