/**
 * Validador estructural de expresiones regulares contra retroceso catastrófico (ReDoS).
 *
 * El motor de JavaScript (irregexp) resuelve por retroceso: si un mismo texto puede recorrerse por
 * muchos caminos distintos del patrón y al final la coincidencia falla, prueba todos. El análisis
 * sigue el criterio de ambigüedad de autómatas (Weideman, van der Merwe, Berglund y Watson, "Analyzing
 * Matching Time Behavior of Backtracking Regular Expression Matchers by Using Ambiguity of NFA", CIAA
 * 2016; Allauzen, Mohri y Rastogi, 2008):
 *
 * - EDA (exponencial): un estado con dos caminos distintos que vuelven a él con el mismo texto, como
 *   (a+)+, (a|a)*, (\w+\s?)+ o (.*a)+.
 * - IDA (polinomial): dos repeticiones sin tope, una después de la otra, que pueden tomar el mismo
 *   texto y el camino entre ellas también, como a*a*b, .*a.*b, \w+\d+x o (.*a){3}b.
 *
 * El patrón se traduce a un autómata de posiciones (Glushkov) que además cuenta cuántos caminos sin
 * consumir texto unen dos posiciones: así (a*)* queda con dos caminos de "a" a "a" aunque el autómata
 * clásico los funda en uno. Las clases de caracteres se comparan sobre un alfabeto de representantes
 * (todos los caracteres del patrón, sus vecinos y un juego fijo de dígitos, letras, espacios y
 * símbolos), y la pertenencia la decide el propio motor de JavaScript, así [^...], \w o la opción
 * "sin distinguir mayúsculas" se evalúan igual que al resaltar.
 *
 * Límites conocidos (por eso el resaltado además mide el tiempo de cada regla y apaga la que se pone
 * lenta, ver highlight.ts): las referencias (\1) se tratan como vacías salvo dentro de una repetición
 * (ahí se rechazan); las cuentas grandes ({0,80}) se modelan como repetición sin tope; un estado al que
 * llegar ya es coincidencia segura (fin del patrón, o `.*`/`.+` seguido solo de `$`) no cuenta como
 * trampa, porque el motor termina ahí en vez de seguir probando.
 */

type Node =
  | { k: "chr"; src: string; lit: string | null }
  | { k: "seq"; xs: Node[] }
  | { k: "alt"; xs: Node[] }
  | { k: "rep"; x: Node; min: number; max: number }
  | { k: "look"; x: Node }
  | { k: "asr"; dollar: boolean }
  | { k: "ref" };

export const MSG_EXPONENTIAL =
  "Cuantificadores anidados o alternativas que se solapan dentro de un grupo repetido, como (a+)+ o (a|aa)+, pueden congelar la app. Simplifica el patrón.";
export const MSG_POLYNOMIAL =
  "Dos repeticiones sin tope que pueden tomar el mismo texto, como a*a*b o .*x.*y, pueden congelar la app con una línea larga. Usa clases que no se solapen (\\S+, [^,]*) o deja una sola repetición.";
export const MSG_BACKREF = "Una referencia a un grupo (\\1, \\k<n>) dentro de una repetición puede congelar la app. Quítala de la repetición.";
export const MSG_COMPLEX = "Patrón demasiado complejo para comprobar que no congele la app. Simplifícalo.";

class TooComplex extends Error {}

/** Posiciones máximas del autómata (cada copia de una cuenta {n,m} suma las suyas). */
const MAX_POSITIONS = 3000;
/** Pasos máximos de los productos de autómatas: sobre esto el patrón se rechaza por complejo. */
const MAX_STEPS = 400_000;
/** Cuentas {n,m} hasta este tope se expanden exactas; sobre él se modelan como repetición sin tope. */
const MAX_EXPAND = 10;

// ---------- Análisis sintáctico (sintaxis de JavaScript sin la opción u, con el anexo B) ----------

function countCaptures(s: string): { caps: number; named: boolean } {
  let caps = 0;
  let named = false;
  let inClass = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "(") {
      if (s[i + 1] !== "?") caps++;
      else if (s[i + 2] === "<" && s[i + 3] !== "=" && s[i + 3] !== "!") {
        caps++;
        named = true;
      }
    }
  }
  return { caps, named };
}

class Parser {
  i = 0;
  private s: string;
  private caps: number;
  private named: boolean;
  constructor(s: string, caps: number, named: boolean) {
    this.s = s;
    this.caps = caps;
    this.named = named;
  }

  parse(): Node {
    const n = this.alt();
    // Un ")" sobrante no puede pasar new RegExp; por si acaso, se sigue con el resto.
    while (this.i < this.s.length) {
      this.i++;
      this.alt();
    }
    return n;
  }

  private alt(): Node {
    const xs = [this.seq()];
    while (this.s[this.i] === "|") {
      this.i++;
      xs.push(this.seq());
    }
    return xs.length === 1 ? xs[0] : { k: "alt", xs };
  }

  private seq(): Node {
    const xs: Node[] = [];
    while (this.i < this.s.length && this.s[this.i] !== "|" && this.s[this.i] !== ")") xs.push(this.term());
    return { k: "seq", xs };
  }

  private term(): Node {
    const atom = this.atom();
    const s = this.s;
    let min: number;
    let max: number;
    const c = s[this.i];
    if (c === "*") [min, max] = [0, Infinity];
    else if (c === "+") [min, max] = [1, Infinity];
    else if (c === "?") [min, max] = [0, 1];
    else if (c === "{") {
      const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(s.slice(this.i));
      if (!m) return atom;
      min = Number(m[1]);
      max = m[2] ? (m[3] ? Number(m[3]) : Infinity) : min;
      this.i += m[0].length - 1;
    } else return atom;
    this.i++;
    if (s[this.i] === "?") this.i++;
    return { k: "rep", x: atom, min, max };
  }

  private group(): Node {
    const x = this.alt();
    if (this.s[this.i] === ")") this.i++;
    return x;
  }

  private atom(): Node {
    const s = this.s;
    const c = s[this.i];
    if (c === "(") {
      this.i++;
      if (s[this.i] !== "?") return this.group();
      const rest = s.slice(this.i);
      if (rest.startsWith("?:")) {
        this.i += 2;
        return this.group();
      }
      if (rest.startsWith("?=") || rest.startsWith("?!")) {
        this.i += 2;
        return { k: "look", x: this.group() };
      }
      if (rest.startsWith("?<=") || rest.startsWith("?<!")) {
        this.i += 3;
        return { k: "look", x: this.group() };
      }
      const named = /^\?<[^>]*>/.exec(rest) ?? /^\?[imsx]*(?:-[imsx]*)?:/.exec(rest);
      if (named) {
        this.i += named[0].length;
        return this.group();
      }
      return this.group();
    }
    if (c === "[") {
      let j = this.i + 1;
      if (s[j] === "^") j++;
      while (j < s.length && s[j] !== "]") j += s[j] === "\\" ? 2 : 1;
      const src = s.slice(this.i, j + 1);
      this.i = j + 1;
      return { k: "chr", src, lit: null };
    }
    if (c === ".") {
      this.i++;
      return { k: "chr", src: ".", lit: null };
    }
    if (c === "^" || c === "$") {
      this.i++;
      return { k: "asr", dollar: c === "$" };
    }
    if (c === "\\") {
      const d = s[this.i + 1] ?? "";
      if (d === "b" || d === "B") {
        this.i += 2;
        return { k: "asr", dollar: false };
      }
      if (/[1-9]/.test(d)) {
        const digits = /^\d+/.exec(s.slice(this.i + 1))![0];
        if (Number(digits) <= this.caps) {
          this.i += 1 + digits.length;
          return { k: "ref" };
        }
        // Escape octal o identidad (anexo B): \8 es "8", \12 sin grupos es el carácter 0o12.
        const oct = /^[0-7]{1,3}/.exec(digits)?.[0] ?? d;
        this.i += 1 + oct.length;
        return { k: "chr", src: "\\" + oct, lit: null };
      }
      if (d === "k" && this.named && s[this.i + 2] === "<") {
        const end = s.indexOf(">", this.i);
        this.i = end < 0 ? s.length : end + 1;
        return { k: "ref" };
      }
      let len = 2;
      if (d === "x" && /^[0-9a-f]{2}/i.test(s.slice(this.i + 2))) len = 4;
      else if (d === "u" && /^[0-9a-f]{4}/i.test(s.slice(this.i + 2))) len = 6;
      else if (d === "c" && /^[a-z]/i.test(s.slice(this.i + 2))) len = 3;
      else if (d === "0" && /^[0-7]{1,2}/.test(s.slice(this.i + 2))) len = 2 + /^[0-7]{1,2}/.exec(s.slice(this.i + 2))![0].length;
      const src = s.slice(this.i, this.i + len);
      this.i += len;
      return { k: "chr", src, lit: null };
    }
    // Carácter literal (también "{", "}" o "]" sueltos, permitidos por el anexo B).
    this.i++;
    return { k: "chr", src: c, lit: c };
  }
}

// ---------- Alfabeto de representantes ----------

const FIXED_REPS = "0159abfzABFZ_-./:,;!#%@=()[]{}<>\"'*+?|$^&~ \t\r\n\v\f éÉñ  \u0000\u007fÿ￿";

function representatives(pattern: string, ci: boolean): string[] {
  const set = new Set<string>(FIXED_REPS);
  const addCode = (code: number) => {
    for (const k of [code - 1, code, code + 1]) {
      if (k < 0 || k > 0xffff || (k >= 0xd800 && k <= 0xdfff)) continue;
      set.add(String.fromCharCode(k));
    }
  };
  for (let i = 0; i < pattern.length; i++) addCode(pattern.charCodeAt(i));
  for (const m of pattern.matchAll(/\\x([0-9a-f]{2})|\\u([0-9a-f]{4})/gi)) addCode(parseInt(m[1] ?? m[2], 16));
  if (ci) for (const c of [...set]) set.add(c.toLowerCase()).add(c.toUpperCase());
  return [...set].filter((c) => c.length === 1);
}

type Bits = Uint32Array;

function intersects(a: Bits, b: Bits, c?: Bits): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] & b[i] & (c ? c[i] : 0xffffffff)) return true;
  return false;
}

// ---------- Autómata de posiciones con cuenta de caminos ----------

type Cnt = Map<number, number>;
interface Info {
  /** Formas de coincidir con texto vacío (0, 1 o 2 = "más de una"). */
  n: number;
  /** Coincide vacío sin pasar por ninguna aserción. */
  nA: boolean;
  /** Coincide vacío pasando a lo más por `$`. */
  nB: boolean;
  first: Cnt;
  last: Cnt;
  lastA: Set<number>;
  lastB: Set<number>;
}

const cap2 = (n: number) => (n > 2 ? 2 : n);
function addTo(m: Cnt, from: Cnt, k = 1) {
  if (!k) return;
  for (const [p, c] of from) m.set(p, cap2((m.get(p) ?? 0) + c * k));
}
const EMPTY = (): Info => ({ n: 1, nA: true, nB: true, first: new Map(), last: new Map(), lastA: new Set(), lastB: new Set() });
const NONE = (dollar = false): Info => ({ n: 1, nA: false, nB: dollar, first: new Map(), last: new Map(), lastA: new Set(), lastB: new Set() });

class Automaton {
  bits: Bits[] = [];
  follow: Cnt[] = [];
  looks = new Set<Node>();
  private member: (n: Extract<Node, { k: "chr" }>) => Bits;
  constructor(member: (n: Extract<Node, { k: "chr" }>) => Bits) {
    this.member = member;
  }

  private link(last: Cnt, first: Cnt) {
    for (const [p, cp] of last) {
      const f = this.follow[p];
      for (const [q, cq] of first) f.set(q, cap2((f.get(q) ?? 0) + cp * cq));
    }
  }

  build(node: Node): Info {
    switch (node.k) {
      case "chr": {
        const p = this.bits.length;
        if (p >= MAX_POSITIONS) throw new TooComplex();
        this.bits.push(this.member(node));
        this.follow.push(new Map());
        return { n: 0, nA: false, nB: false, first: new Map([[p, 1]]), last: new Map([[p, 1]]), lastA: new Set([p]), lastB: new Set([p]) };
      }
      case "asr":
        return NONE(node.dollar);
      case "look":
        this.looks.add(node.x);
        return NONE();
      case "ref":
        return NONE();
      case "seq": {
        let acc = EMPTY();
        for (const x of node.xs) {
          const b = this.build(x);
          this.link(acc.last, b.first);
          const first = new Map(acc.first);
          addTo(first, b.first, acc.n);
          const last = new Map(b.last);
          addTo(last, acc.last, b.n);
          acc = {
            n: cap2(acc.n * b.n),
            nA: acc.nA && b.nA,
            nB: acc.nB && b.nB,
            first,
            last,
            lastA: b.nA ? new Set([...b.lastA, ...acc.lastA]) : b.lastA,
            lastB: b.nB ? new Set([...b.lastB, ...acc.lastB]) : b.lastB,
          };
        }
        return acc;
      }
      case "alt": {
        const out: Info = { n: 0, nA: false, nB: false, first: new Map(), last: new Map(), lastA: new Set(), lastB: new Set() };
        for (const x of node.xs) {
          const b = this.build(x);
          out.n = cap2(out.n + b.n);
          out.nA ||= b.nA;
          out.nB ||= b.nB;
          addTo(out.first, b.first);
          addTo(out.last, b.last);
          for (const p of b.lastA) out.lastA.add(p);
          for (const p of b.lastB) out.lastB.add(p);
        }
        return out;
      }
      case "rep":
        return this.rep(node.x, node.min, node.max);
    }
  }

  private rep(x: Node, min: number, max: number): Info {
    if (max === 0) return EMPTY();
    if (min > MAX_EXPAND || (max !== Infinity && max > MAX_EXPAND)) return this.rep(x, min ? 1 : 0, Infinity);
    if (min === 0 && max === 1) {
      const i = this.build(x);
      return { ...i, n: cap2(1 + i.n), nA: true, nB: true };
    }
    if (max === Infinity && min <= 1) {
      const i = this.build(x);
      this.link(i.last, i.first);
      // Una vuelta que no consume texto la descarta el motor: el bucle no suma formas de quedar vacío.
      return min === 0 ? { ...i, n: 1, nA: true, nB: true } : i;
    }
    const xs: Node[] = [];
    if (max === Infinity) {
      for (let k = 0; k < min - 1; k++) xs.push(x);
      xs.push({ k: "rep", x, min: 1, max: Infinity });
    } else {
      for (let k = 0; k < min; k++) xs.push(x);
      let tail: Node | null = null;
      for (let k = 0; k < max - min; k++) tail = { k: "rep", x: tail ? { k: "seq", xs: [x, tail] } : x, min: 0, max: 1 };
      if (tail) xs.push(tail);
    }
    return this.build({ k: "seq", xs });
  }
}

// ---------- Componentes fuertemente conexas (Tarjan iterativo) ----------

function tarjan(starts: Iterable<number>, next: (v: number) => number[], budget: { left: number }): Map<number, number> {
  const index = new Map<number, number>();
  const low = new Map<number, number>();
  const comp = new Map<number, number>();
  const stack: number[] = [];
  const onStack = new Set<number>();
  let idx = 0;
  let compId = 0;
  for (const s of starts) {
    if (index.has(s)) continue;
    const work: { v: number; nb: number[]; i: number }[] = [];
    const open = (v: number) => {
      index.set(v, idx);
      low.set(v, idx++);
      stack.push(v);
      onStack.add(v);
      work.push({ v, nb: next(v), i: 0 });
    };
    open(s);
    while (work.length) {
      if (--budget.left < 0) throw new TooComplex();
      const top = work[work.length - 1];
      if (top.i < top.nb.length) {
        const w = top.nb[top.i++];
        if (!index.has(w)) open(w);
        else if (onStack.has(w)) low.set(top.v, Math.min(low.get(top.v)!, index.get(w)!));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].v;
        low.set(parent, Math.min(low.get(parent)!, low.get(top.v)!));
      }
      if (low.get(top.v) === index.get(top.v)) {
        let w: number;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          comp.set(w, compId);
        } while (w !== top.v);
        compId++;
      }
    }
  }
  return comp;
}

// ---------- Análisis ----------

function analyze(root: Node, member: (n: Extract<Node, { k: "chr" }>) => Bits, dot: Bits, budget: { left: number }, seen: Set<Node>): string | null {
  const a = new Automaton(member);
  const top = a.build(root);
  const N = a.bits.length;
  const nonEmpty = (p: number) => a.bits[p].some((w) => w !== 0);
  const isDot = (p: number) => a.bits[p].every((w, i) => ((w & dot[i]) >>> 0) === dot[i]);
  // Llegar a un estado "libre" ya es coincidencia: el motor termina ahí, no hay retroceso que explotar.
  const free = (p: number) => top.lastA.has(p) || (top.lastB.has(p) && isDot(p) && (a.follow[p].get(p) ?? 0) > 0);
  const alive: boolean[] = [];
  for (let p = 0; p < N; p++) alive.push(nonEmpty(p) && !free(p));
  const succ: number[][] = [];
  for (let p = 0; p < N; p++) succ.push(alive[p] ? [...a.follow[p].keys()].filter((q) => alive[q]) : []);

  const comp = tarjan(
    Array.from({ length: N }, (_, p) => p).filter((p) => alive[p]),
    (v) => succ[v],
    budget,
  );
  const members = new Map<number, number[]>();
  for (const [v, c] of comp) members.set(c, [...(members.get(c) ?? []), v]);
  const cyclic = [...members.values()].filter((ms) => ms.length > 1 || succ[ms[0]].includes(ms[0]));

  // EDA: dos caminos distintos de un estado a sí mismo con el mismo texto.
  for (const C of cyclic) {
    const inC = new Set(C);
    for (const p of C) for (const [q, k] of a.follow[p]) if (k >= 2 && inC.has(q)) return MSG_EXPONENTIAL;
    const m = C.length;
    const local = new Map(C.map((p, i) => [p, i]));
    const succC = C.map((p) => succ[p].filter((q) => inC.has(q)).map((q) => local.get(q)!));
    const next = (v: number) => {
      const x = Math.floor(v / m);
      const y = v % m;
      const out: number[] = [];
      for (const x2 of succC[x])
        for (const y2 of succC[y]) {
          if (--budget.left < 0) throw new TooComplex();
          if (intersects(a.bits[C[x2]], a.bits[C[y2]])) out.push(x2 * m + y2);
        }
      return out;
    };
    const pc = tarjan(
      C.map((_, i) => i * m + i),
      next,
      budget,
    );
    const diag = new Set<number>();
    const off = new Set<number>();
    for (const [v, c] of pc) (Math.floor(v / m) === v % m ? diag : off).add(c);
    for (const c of off) if (diag.has(c)) return MSG_EXPONENTIAL;
  }

  // IDA: p se repite con w, de p se llega a q con w y q se repite con w.
  if (cyclic.length > 1) {
    const reach = (from: number[], adj: number[][]) => {
      const seen = new Set(from);
      const queue = [...from];
      while (queue.length) for (const q of adj[queue.pop()!]) if (!seen.has(q)) seen.add(q), queue.push(q);
      return seen;
    };
    const pred: number[][] = Array.from({ length: N }, () => []);
    for (let p = 0; p < N; p++) for (const q of succ[p]) pred[q].push(p);
    for (const Si of cyclic) {
      const fromI = reach(Si, succ);
      for (const Sj of cyclic) {
        if (Si === Sj || !fromI.has(Sj[0])) continue;
        const toJ = reach(Sj, pred);
        const inI = new Set(Si);
        const inJ = new Set(Sj);
        for (const p of Si)
          for (const q of Sj) {
            const key = (x: number, y: number, z: number) => (x * N + y) * N + z;
            const visited = new Set<number>();
            const queue: [number, number, number][] = [[p, p, q]];
            while (queue.length) {
              const [x, y, z] = queue.pop()!;
              for (const x2 of succ[x]) {
                if (!inI.has(x2)) continue;
                for (const y2 of succ[y]) {
                  if (!fromI.has(y2) || !toJ.has(y2)) continue;
                  for (const z2 of succ[z]) {
                    if (--budget.left < 0) throw new TooComplex();
                    if (!inJ.has(z2) || !intersects(a.bits[x2], a.bits[y2], a.bits[z2])) continue;
                    if (x2 === p && y2 === q && z2 === q) return MSG_POLYNOMIAL;
                    const k = key(x2, y2, z2);
                    if (!visited.has(k)) visited.add(k), queue.push([x2, y2, z2]);
                  }
                }
              }
            }
          }
      }
    }
  }

  // Lo que va dentro de (?=...), (?!...), (?<=...) y (?<!...) se evalúa aparte, como su propio patrón.
  for (const look of a.looks) {
    if (seen.has(look)) continue;
    seen.add(look);
    const bad = analyze(look, member, dot, budget, seen);
    if (bad) return bad;
  }
  return null;
}

function refUnderRepeat(n: Node, under = false): boolean {
  switch (n.k) {
    case "ref":
      return under;
    case "seq":
    case "alt":
      return n.xs.some((x) => refUnderRepeat(x, under));
    case "rep":
      return refUnderRepeat(n.x, under || n.max > 1);
    case "look":
      return refUnderRepeat(n.x, under);
    default:
      return false;
  }
}

const cache = new Map<string, string | null>();

/**
 * Riesgo de retroceso catastrófico de un patrón (sintaxis de JavaScript, sin la opción u). Devuelve el
 * mensaje para el usuario o null si es seguro. `ignoreCase`: la regla no distingue mayúsculas (cambia qué
 * clases se solapan; ante la duda, true es lo conservador). Supone que el patrón ya compila.
 */
export function redosRisk(pattern: string, ignoreCase = true): string | null {
  const key = (ignoreCase ? "i" : "-") + pattern;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let out: string | null;
  try {
    const { caps, named } = countCaptures(pattern);
    const root = new Parser(pattern, caps, named).parse();
    if (refUnderRepeat(root)) out = MSG_BACKREF;
    else {
      const reps = representatives(pattern, ignoreCase);
      const W = Math.ceil(reps.length / 32);
      const flags = ignoreCase ? "i" : "";
      const memo = new Map<string, Bits>();
      const member = (n: Extract<Node, { k: "chr" }>): Bits => {
        const k = n.lit !== null ? "L" + n.lit : "S" + n.src;
        const got = memo.get(k);
        if (got) return got;
        const bits = new Uint32Array(W);
        let test: (c: string) => boolean;
        if (n.lit !== null) {
          const l = n.lit;
          test = ignoreCase ? (c) => c === l || c.toLowerCase() === l.toLowerCase() || c.toUpperCase() === l.toUpperCase() : (c) => c === l;
        } else {
          try {
            const re = new RegExp(`^(?:${n.src})$`, flags);
            test = (c) => re.test(c);
          } catch {
            test = () => true;
          }
        }
        reps.forEach((c, i) => {
          if (test(c)) bits[i >> 5] |= 1 << (i & 31);
        });
        memo.set(k, bits);
        return bits;
      };
      const dot = member({ k: "chr", src: ".", lit: null });
      out = analyze(root, member, dot, { left: MAX_STEPS }, new Set());
    }
  } catch (e) {
    if (!(e instanceof TooComplex)) throw e;
    out = MSG_COMPLEX;
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, out);
  return out;
}
