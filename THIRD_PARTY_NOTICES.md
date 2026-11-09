# Avisos de terceros

NetTerminal incluye las bibliotecas de terceros listadas abajo. Cada una se distribuye bajo su propia licencia, que no cambia por la licencia de NetTerminal ([LICENSE.md](LICENSE.md)).

Generado con `node scripts/licenses/generar-avisos.mjs` a partir de `package-lock.json` (dependencias de producción) y de `src-tauri/Cargo.lock` (crates enlazados en la app, todas las plataformas). 129 paquetes de npm y 607 crates de Rust.

## Resumen por licencia

| Licencia | Paquetes |
| --- | --- |
| MIT OR Apache-2.0 | 292 |
| MIT | 214 |
| Apache-2.0 OR MIT | 57 |
| ISC | 37 |
| Unicode-3.0 | 18 |
| Zlib OR Apache-2.0 OR MIT | 18 |
| MIT/Apache-2.0 | 15 |
| Apache-2.0 | 10 |
| Unlicense OR MIT | 10 |
| BSD-3-Clause | 9 |
| MPL-2.0 | 6 |
| Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | 5 |
| Apache-2.0/MIT | 4 |
| Apache-2.0 OR ISC OR MIT | 3 |
| MIT OR Apache-2.0 OR Zlib | 3 |
| Zlib | 3 |
| BSD-2-Clause OR Apache-2.0 OR MIT | 2 |
| BSD-3-Clause OR Apache-2.0 | 2 |
| BSD-3-Clause OR MIT OR Apache-2.0 | 2 |
| BSL-1.0 | 2 |
| MIT OR Apache-2.0 OR LGPL-2.1-or-later | 2 |
| MIT OR Zlib OR Apache-2.0 | 2 |
| Unlicense/MIT | 2 |
| (MIT OR Apache-2.0) AND Unicode-3.0 | 1 |
| (MPL-2.0 OR Apache-2.0) | 1 |
| 0BSD OR MIT OR Apache-2.0 | 1 |
| Apache-2.0 / MIT | 1 |
| Apache-2.0 AND ISC | 1 |
| Apache-2.0 AND MIT | 1 |
| BSD-2-Clause OR Apache-2.0 | 1 |
| BSD-2-Clause OR MIT OR Apache-2.0 | 1 |
| BSD-3-Clause AND MIT | 1 |
| BSD-3-Clause/MIT | 1 |
| CC0-1.0 OR MIT-0 OR Apache-2.0 | 1 |
| CDLA-Permissive-2.0 | 1 |
| EPL-2.0 OR GPL-3.0-or-later | 1 |
| MIT (según su archivo de licencia) | 1 |
| MIT / Apache-2.0 | 1 |
| MIT OR BSD-3-Clause | 1 |
| MIT OR GPL-3.0-only | 1 |
| Unlicense | 1 |

## Licencias con condiciones adicionales

- **MPL-2.0** (copyleft por archivo) y **EPL-2.0** (copyleft por módulo): NetTerminal usa estas bibliotecas sin modificarlas. Su código fuente está disponible en los repositorios indicados en las tablas y en crates.io o npm para la versión listada.
- **Licencias con alternativa** (por ejemplo "MIT OR GPL-3.0-only" o "MIT OR Apache-2.0 OR LGPL-2.1-or-later"): NetTerminal usa cada biblioteca bajo la alternativa permisiva (MIT o Apache-2.0).
- **Unicode-3.0**, **CDLA-Permissive-2.0** y **BSL-1.0**: licencias permisivas; su texto está en la última sección.

## Interfaz (npm)

| Paquete | Versión | Licencia | Repositorio |
| --- | --- | --- | --- |
| @antfu/install-pkg | 2.1.0 | MIT | https://github.com/antfu-collective/install-pkg |
| @braintree/sanitize-url | 7.1.2 | MIT | https://github.com/braintree/sanitize-url |
| @chevrotain/cst-dts-gen | 13.2.0 | Apache-2.0 | https://github.com/Chevrotain/chevrotain |
| @chevrotain/gast | 13.2.0 | Apache-2.0 | https://github.com/Chevrotain/chevrotain |
| @chevrotain/regexp-to-ast | 13.2.0 | Apache-2.0 | https://github.com/Chevrotain/chevrotain |
| @chevrotain/types | 13.2.0 | Apache-2.0 | https://github.com/Chevrotain/chevrotain |
| @chevrotain/utils | 13.2.0 | Apache-2.0 | https://github.com/Chevrotain/chevrotain |
| @iconify/types | 2.0.0 | MIT | https://github.com/iconify/iconify |
| @iconify/utils | 3.1.7 | MIT | https://github.com/iconify/iconify |
| @mermaid-js/parser | 2.0.1 | MIT | https://github.com/mermaid-js/mermaid |
| @tauri-apps/api | 2.12.4 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| @tauri-apps/plugin-clipboard-manager | 2.5.0 | MIT OR Apache-2.0 | https://github.com/tauri-apps/plugins-workspace |
| @tauri-apps/plugin-dialog | 2.8.4 | MIT OR Apache-2.0 | https://github.com/tauri-apps/plugins-workspace |
| @tauri-apps/plugin-opener | 2.7.2 | MIT OR Apache-2.0 | https://github.com/tauri-apps/plugins-workspace |
| @types/d3 | 7.4.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-array | 3.2.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-axis | 3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-brush | 3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-chord | 3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-color | 3.1.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-contour | 3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-delaunay | 6.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-dispatch | 3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-drag | 3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-dsv | 3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-ease | 3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-fetch | 3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-force | 3.0.10 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-format | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-geo | 3.1.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-hierarchy | 3.1.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-interpolate | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-path | 3.1.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-polygon | 3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-quadtree | 3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-random | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-scale | 4.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-scale-chromatic | 3.1.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-selection | 3.0.12 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-shape | 3.2.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-time | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-time-format | 4.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-timer | 3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-transition | 3.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-zoom | 3.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/geojson | 7946.0.16 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/trusted-types | 2.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @upsetjs/venn.js | 2.0.0 | MIT | https://github.com/upsetjs/venn.js |
| @xterm/addon-fit | 0.11.0 | MIT | https://github.com/xtermjs/xterm.js/tree/master/addons/addon-fit |
| @xterm/addon-search | 0.16.0 | MIT | https://github.com/xtermjs/xterm.js/tree/master/addons/addon-search |
| @xterm/addon-web-links | 0.12.0 | MIT | https://github.com/xtermjs/xterm.js/tree/master/addons/addon-web-links |
| @xterm/addon-webgl | 0.19.0 | MIT | https://github.com/xtermjs/xterm.js/tree/master/addons/addon-webgl |
| @xterm/xterm | 6.0.0 | MIT | https://github.com/xtermjs/xterm.js |
| chevrotain | 13.2.0 | Apache-2.0 | https://github.com/Chevrotain/chevrotain |
| commander | 15.0.0 | MIT | https://github.com/tj/commander.js |
| commander | 7.2.0 | MIT | https://github.com/tj/commander.js |
| cose-base | 1.0.3 | MIT | https://github.com/iVis-at-Bilkent/cose-base |
| cose-base | 2.2.0 | MIT | https://github.com/iVis-at-Bilkent/cose-base |
| cytoscape | 3.34.4 | MIT | https://github.com/cytoscape/cytoscape.js |
| cytoscape-cose-bilkent | 4.1.0 | MIT | https://github.com/cytoscape/cytoscape.js-cose-bilkent |
| cytoscape-fcose | 2.2.0 | MIT | https://github.com/iVis-at-Bilkent/cytoscape.js-fcose |
| d3 | 7.9.0 | ISC | https://github.com/d3/d3 |
| d3-array | 2.12.1 | BSD-3-Clause | https://github.com/d3/d3-array |
| d3-array | 3.2.4 | ISC | https://github.com/d3/d3-array |
| d3-axis | 3.0.0 | ISC | https://github.com/d3/d3-axis |
| d3-brush | 3.0.0 | ISC | https://github.com/d3/d3-brush |
| d3-chord | 3.0.1 | ISC | https://github.com/d3/d3-chord |
| d3-color | 3.1.0 | ISC | https://github.com/d3/d3-color |
| d3-contour | 4.0.2 | ISC | https://github.com/d3/d3-contour |
| d3-delaunay | 6.0.4 | ISC | https://github.com/d3/d3-delaunay |
| d3-dispatch | 3.0.1 | ISC | https://github.com/d3/d3-dispatch |
| d3-drag | 3.0.0 | ISC | https://github.com/d3/d3-drag |
| d3-dsv | 3.0.1 | ISC | https://github.com/d3/d3-dsv |
| d3-ease | 3.0.1 | BSD-3-Clause | https://github.com/d3/d3-ease |
| d3-fetch | 3.0.1 | ISC | https://github.com/d3/d3-fetch |
| d3-force | 3.0.0 | ISC | https://github.com/d3/d3-force |
| d3-format | 3.1.2 | ISC | https://github.com/d3/d3-format |
| d3-geo | 3.1.1 | ISC | https://github.com/d3/d3-geo |
| d3-hierarchy | 3.1.2 | ISC | https://github.com/d3/d3-hierarchy |
| d3-interpolate | 3.0.1 | ISC | https://github.com/d3/d3-interpolate |
| d3-path | 1.0.9 | BSD-3-Clause | https://github.com/d3/d3-path |
| d3-path | 3.1.0 | ISC | https://github.com/d3/d3-path |
| d3-polygon | 3.0.1 | ISC | https://github.com/d3/d3-polygon |
| d3-quadtree | 3.0.1 | ISC | https://github.com/d3/d3-quadtree |
| d3-random | 3.0.1 | ISC | https://github.com/d3/d3-random |
| d3-sankey | 0.12.3 | BSD-3-Clause | https://github.com/d3/d3-sankey |
| d3-scale | 4.0.2 | ISC | https://github.com/d3/d3-scale |
| d3-scale-chromatic | 3.1.0 | ISC | https://github.com/d3/d3-scale-chromatic |
| d3-selection | 3.0.0 | ISC | https://github.com/d3/d3-selection |
| d3-shape | 1.3.7 | BSD-3-Clause | https://github.com/d3/d3-shape |
| d3-shape | 3.2.0 | ISC | https://github.com/d3/d3-shape |
| d3-time | 3.1.0 | ISC | https://github.com/d3/d3-time |
| d3-time-format | 4.1.0 | ISC | https://github.com/d3/d3-time-format |
| d3-timer | 3.0.1 | ISC | https://github.com/d3/d3-timer |
| d3-transition | 3.0.1 | ISC | https://github.com/d3/d3-transition |
| d3-zoom | 3.0.0 | ISC | https://github.com/d3/d3-zoom |
| dagre-d3-es | 7.0.14 | MIT | https://github.com/tbo47/dagre-es |
| dayjs | 1.11.23 | MIT | https://github.com/iamkun/dayjs |
| delaunator | 5.1.0 | ISC | https://github.com/mapbox/delaunator |
| dompurify | 3.4.17 | (MPL-2.0 OR Apache-2.0) | https://github.com/cure53/DOMPurify |
| elkjs | 0.12.1 | EPL-2.0 OR GPL-3.0-or-later | https://github.com/kieler/elkjs |
| es-toolkit | 1.53.0 | MIT | https://github.com/toss/es-toolkit |
| hachure-fill | 0.5.2 | MIT | https://github.com/pshihn/hachure-fill |
| iconv-lite | 0.6.3 | MIT | https://github.com/ashtuchkin/iconv-lite |
| import-meta-resolve | 4.2.0 | MIT | https://github.com/wooorm/import-meta-resolve |
| internmap | 1.0.1 | ISC | https://github.com/mbostock/internmap |
| internmap | 2.0.3 | ISC | https://github.com/mbostock/internmap |
| katex | 0.18.10 | MIT | https://github.com/KaTeX/KaTeX |
| khroma | 2.1.0 | MIT (según su archivo de licencia) | https://github.com/fabiospampinato/khroma |
| layout-base | 1.0.2 | MIT | https://github.com/iVis-at-Bilkent/layout-base |
| layout-base | 2.0.1 | MIT | https://github.com/iVis-at-Bilkent/layout-base |
| lodash-es | 4.18.1 | MIT | https://github.com/lodash/lodash |
| lucide-react | 1.69.0 | ISC | https://github.com/lucide-icons/lucide |
| marked | 16.4.2 | MIT | https://github.com/markedjs/marked |
| mermaid | 12.3.0 | MIT | https://github.com/mermaid-js/mermaid |
| package-manager-detector | 1.9.0 | MIT | https://github.com/antfu-collective/package-manager-detector |
| path-data-parser | 0.1.0 | MIT | https://github.com/pshihn/path-data-parser |
| points-on-curve | 0.2.0 | MIT | https://github.com/pshihn/bezier-points |
| points-on-path | 0.2.1 | MIT | https://github.com/pshihn/points-on-path |
| react | 19.3.1 | MIT | https://github.com/react/react |
| react-dom | 19.3.1 | MIT | https://github.com/react/react |
| robust-predicates | 3.0.3 | Unlicense | https://github.com/mourner/robust-predicates |
| roughjs | 4.6.6 | MIT | https://github.com/pshihn/rough |
| rw | 1.3.3 | BSD-3-Clause | http://github.com/mbostock/rw |
| safer-buffer | 2.1.2 | MIT | https://github.com/ChALkeR/safer-buffer |
| scheduler | 0.28.0 | MIT | https://github.com/react/react |
| stylis | 4.4.0 | MIT | https://github.com/thysultan/stylis.js |
| tinyexec | 1.3.1 | MIT | https://github.com/tinylibs/tinyexec |
| ts-dedent | 2.3.0 | MIT | https://github.com/tamino-martinius/node-ts-dedent |

## Aplicación (Rust)

| Paquete | Versión | Licencia | Repositorio |
| --- | --- | --- | --- |
| adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 | https://github.com/oyvindln/adler2 |
| aead | 0.6.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| aes | 0.8.4 | MIT OR Apache-2.0 | https://github.com/RustCrypto/block-ciphers |
| aes | 0.9.4 | MIT OR Apache-2.0 | https://github.com/RustCrypto/block-ciphers |
| aho-corasick | 1.1.5 | Unlicense OR MIT | https://github.com/BurntSushi/aho-corasick |
| alloc-no-stdlib | 3.0.0 | BSD-3-Clause | https://github.com/dropbox/rust-alloc-no-stdlib |
| alloc-stdlib | 0.3.0 | BSD-3-Clause | https://github.com/dropbox/rust-alloc-no-stdlib |
| android_system_properties | 0.1.6 | MIT OR Apache-2.0 | https://github.com/nical/android_system_properties |
| anyhow | 1.0.104 | MIT OR Apache-2.0 | https://github.com/dtolnay/anyhow |
| arboard | 3.7.0 | MIT OR Apache-2.0 | https://github.com/1Password/arboard |
| argon2 | 0.6.0 | MIT OR Apache-2.0 | https://github.com/RustCrypto/password-hashes |
| ascii | 1.1.0 | Apache-2.0 OR MIT | https://github.com/tomprogrammer/rust-ascii |
| async-broadcast | 0.7.2 | MIT OR Apache-2.0 | https://github.com/smol-rs/async-broadcast |
| async-channel | 2.5.0 | Apache-2.0 OR MIT | https://github.com/smol-rs/async-channel |
| async-executor | 1.14.0 | Apache-2.0 OR MIT | https://github.com/smol-rs/async-executor |
| async-io | 2.6.0 | Apache-2.0 OR MIT | https://github.com/smol-rs/async-io |
| async-lock | 3.4.2 | Apache-2.0 OR MIT | https://github.com/smol-rs/async-lock |
| async-process | 2.5.0 | Apache-2.0 OR MIT | https://github.com/smol-rs/async-process |
| async-recursion | 1.2.0 | MIT OR Apache-2.0 | https://github.com/dcchut/async-recursion |
| async-signal | 0.2.14 | Apache-2.0 OR MIT | https://github.com/smol-rs/async-signal |
| async-task | 4.7.1 | Apache-2.0 OR MIT | https://github.com/smol-rs/async-task |
| async-trait | 0.1.92 | MIT OR Apache-2.0 | https://github.com/dtolnay/async-trait |
| atk | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| atk-sys | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| atomic-waker | 1.1.2 | Apache-2.0 OR MIT | https://github.com/smol-rs/atomic-waker |
| base64 | 0.21.7 | MIT OR Apache-2.0 | https://github.com/marshallpierce/rust-base64 |
| base64 | 0.23.1 | MIT OR Apache-2.0 | https://github.com/marshallpierce/rust-base64 |
| base64ct | 1.8.3 | Apache-2.0 OR MIT | https://github.com/RustCrypto/formats |
| bit-set | 0.8.0 | Apache-2.0 OR MIT | https://github.com/contain-rs/bit-set |
| bit-vec | 0.8.0 | Apache-2.0 OR MIT | https://github.com/contain-rs/bit-vec |
| bitflags | 1.3.2 | MIT/Apache-2.0 | https://github.com/bitflags/bitflags |
| bitflags | 2.13.2 | MIT OR Apache-2.0 | https://github.com/bitflags/bitflags |
| blake2 | 0.11.0 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hashes |
| block-buffer | 0.10.4 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| block-buffer | 0.12.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| block-padding | 0.3.3 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| block-padding | 0.4.2 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| block2 | 0.6.2 | MIT | https://github.com/madsmtm/objc2 |
| blocking | 1.7.0 | Apache-2.0 OR MIT | https://github.com/smol-rs/blocking |
| brotli | 9.1.0 | BSD-3-Clause AND MIT | https://github.com/dropbox/rust-brotli |
| brotli-decompressor | 6.2.0 | BSD-3-Clause/MIT | https://github.com/dropbox/rust-brotli-decompressor |
| bs58 | 0.5.1 | MIT/Apache-2.0 | https://github.com/Nullus157/bs58-rs |
| bumpalo | 3.20.3 | MIT OR Apache-2.0 | https://github.com/fitzgen/bumpalo |
| bytemuck | 1.25.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/Lokathor/bytemuck |
| byteorder | 1.5.0 | Unlicense OR MIT | https://github.com/BurntSushi/byteorder |
| byteorder-lite | 0.1.0 | Unlicense OR MIT | https://github.com/image-rs/byteorder-lite |
| bytes | 1.12.1 | MIT | https://github.com/tokio-rs/bytes |
| cairo-rs | 0.18.5 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| cairo-sys-rs | 0.18.2 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| camino | 1.2.6 | MIT OR Apache-2.0 | https://github.com/camino-rs/camino |
| cargo_metadata | 0.19.2 | MIT | https://github.com/oli-obk/cargo_metadata |
| cargo-platform | 0.1.9 | MIT OR Apache-2.0 | https://github.com/rust-lang/cargo |
| cbc | 0.1.2 | MIT OR Apache-2.0 | https://github.com/RustCrypto/block-modes |
| cbc | 0.2.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/block-modes |
| cesu8 | 1.1.0 | Apache-2.0/MIT | https://github.com/emk/cesu8-rs |
| cfb | 0.14.0 | MIT | https://github.com/mdsteele/rust-cfb |
| cfb-mode | 0.9.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/block-modes |
| cfg-if | 1.0.5 | MIT OR Apache-2.0 | https://github.com/rust-lang/cfg-if |
| chacha20 | 0.10.2 | MIT OR Apache-2.0 | https://github.com/RustCrypto/stream-ciphers |
| chacha20poly1305 | 0.11.0 | Apache-2.0 OR MIT | https://github.com/RustCrypto/AEADs |
| chrono | 0.4.45 | MIT OR Apache-2.0 | https://github.com/chronotope/chrono |
| chunked_transfer | 1.5.0 | MIT OR Apache-2.0 | https://github.com/frewsxcv/rust-chunked-transfer |
| cipher | 0.4.4 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| cipher | 0.5.2 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| clipboard-win | 5.4.3 | BSL-1.0 | https://github.com/DoumanAsh/clipboard-win |
| cmov | 0.5.4 | Apache-2.0 OR MIT | https://github.com/RustCrypto/utils |
| combine | 4.6.9 | MIT | https://github.com/Marwes/combine |
| concurrent-queue | 2.5.0 | Apache-2.0 OR MIT | https://github.com/smol-rs/concurrent-queue |
| const-oid | 0.10.2 | Apache-2.0 OR MIT | https://github.com/RustCrypto/formats |
| cookie | 0.18.2 | MIT OR Apache-2.0 | https://github.com/SergioBenitez/cookie-rs |
| core-foundation | 0.10.1 | MIT OR Apache-2.0 | https://github.com/servo/core-foundation-rs |
| core-foundation | 0.9.4 | MIT OR Apache-2.0 | https://github.com/servo/core-foundation-rs |
| core-foundation-sys | 0.8.7 | MIT OR Apache-2.0 | https://github.com/servo/core-foundation-rs |
| core-graphics | 0.25.0 | MIT OR Apache-2.0 | https://github.com/servo/core-foundation-rs |
| core-graphics-types | 0.2.0 | MIT OR Apache-2.0 | https://github.com/servo/core-foundation-rs |
| cpubits | 0.1.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| cpufeatures | 0.2.17 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| cpufeatures | 0.3.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| crc32fast | 1.5.3 | MIT OR Apache-2.0 | https://github.com/srijs/rust-crc32fast |
| crossbeam-channel | 0.5.17 | MIT OR Apache-2.0 | https://github.com/crossbeam-rs/crossbeam |
| crossbeam-utils | 0.8.23 | MIT OR Apache-2.0 | https://github.com/crossbeam-rs/crossbeam |
| crunchy | 0.2.4 | MIT | https://github.com/eira-fransham/crunchy |
| crypto-common | 0.1.7 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| crypto-common | 0.2.2 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| cssparser | 0.37.0 | MPL-2.0 | https://github.com/servo/rust-cssparser |
| cssparser-macros | 0.7.1 | MPL-2.0 | https://github.com/servo/rust-cssparser |
| ctor | 1.0.13 | Apache-2.0 OR MIT | https://github.com/mmastrac/linktime |
| ctutils | 0.4.6 | Apache-2.0 OR MIT | https://github.com/RustCrypto/utils |
| darling | 0.24.1 | MIT | https://github.com/TedDriggs/darling |
| darling_core | 0.24.1 | MIT | https://github.com/TedDriggs/darling |
| darling_macro | 0.24.1 | MIT | https://github.com/TedDriggs/darling |
| dbus | 0.9.12 | Apache-2.0/MIT | https://github.com/diwic/dbus-rs |
| dbus-secret-service | 4.1.0 | MIT OR Apache-2.0 | https://github.com/brotskydotcom/dbus-secret-service |
| defmt | 1.2.0 | MIT OR Apache-2.0 | https://github.com/knurling-rs/defmt |
| defmt-macros | 1.2.0 | MIT OR Apache-2.0 | https://github.com/knurling-rs/defmt |
| defmt-parser | 1.1.0 | MIT OR Apache-2.0 | https://github.com/knurling-rs/defmt |
| deranged | 0.5.9 | MIT OR Apache-2.0 | https://github.com/jhpratt/deranged |
| derive_more | 2.1.1 | MIT | https://github.com/JelteF/derive_more |
| derive_more-impl | 2.1.1 | MIT | https://github.com/JelteF/derive_more |
| des | 0.9.0 | MIT OR Apache-2.0 | https://github.com/RustCrypto/block-ciphers |
| digest | 0.10.7 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| digest | 0.11.3 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| dirs | 7.0.0 | MIT OR Apache-2.0 | https://codeberg.org/dirs/dirs-rs |
| dirs-sys | 0.5.0 | MIT OR Apache-2.0 | https://github.com/dirs-dev/dirs-sys-rs |
| dispatch2 | 0.3.1 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| displaydoc | 0.2.7 | MIT OR Apache-2.0 | https://github.com/yaahc/displaydoc |
| dlopen2 | 0.8.2 | MIT | https://github.com/OpenByteDev/dlopen2 |
| dlopen2_derive | 0.4.3 | MIT | https://github.com/OpenByteDev/dlopen2 |
| dom_query | 0.28.0 | MIT | https://github.com/niklak/dom_query |
| downcast-rs | 1.2.1 | MIT/Apache-2.0 | https://github.com/marcianx/downcast-rs |
| dpi | 0.1.2 | Apache-2.0 AND MIT | https://github.com/rust-windowing/winit |
| dtoa | 1.0.11 | MIT OR Apache-2.0 | https://github.com/dtolnay/dtoa |
| dtoa-short | 0.3.5 | MPL-2.0 | https://github.com/upsuper/dtoa-short |
| dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | https://gitlab.com/kornelski/dunce |
| dyn-clone | 1.0.20 | MIT OR Apache-2.0 | https://github.com/dtolnay/dyn-clone |
| embed_plist | 1.2.2 | MIT OR Apache-2.0 | https://github.com/nvzqz/embed-plist-rs |
| endi | 1.1.1 | MIT | https://github.com/zeenix/endi |
| enumflags2 | 0.7.12 | MIT OR Apache-2.0 | https://github.com/meithecatte/enumflags2 |
| enumflags2_derive | 0.7.12 | MIT OR Apache-2.0 | https://github.com/meithecatte/enumflags2 |
| equivalent | 1.0.3 | Apache-2.0 OR MIT | https://github.com/indexmap-rs/equivalent |
| erased-serde | 0.4.11 | MIT OR Apache-2.0 | https://github.com/dtolnay/erased-serde |
| errno | 0.3.14 | MIT OR Apache-2.0 | https://github.com/lambda-fairy/rust-errno |
| error-code | 3.4.0 | BSL-1.0 | https://github.com/DoumanAsh/error-code |
| event-listener | 5.4.2 | Apache-2.0 OR MIT | https://github.com/smol-rs/event-listener |
| event-listener-strategy | 0.5.4 | Apache-2.0 OR MIT | https://github.com/smol-rs/event-listener-strategy |
| fastrand | 2.5.0 | Apache-2.0 OR MIT | https://github.com/smol-rs/fastrand |
| fax | 0.2.7 | MIT | https://github.com/pdf-rs/fax |
| fdeflate | 0.3.7 | MIT OR Apache-2.0 | https://github.com/image-rs/fdeflate |
| field-offset | 0.3.6 | MIT OR Apache-2.0 | https://github.com/Diggsey/rust-field-offset |
| filedescriptor | 0.8.3 | MIT | https://github.com/wezterm/wezterm |
| filetime | 0.2.29 | MIT/Apache-2.0 | https://github.com/alexcrichton/filetime |
| fixedbitset | 0.5.7 | MIT OR Apache-2.0 | https://github.com/petgraph/fixedbitset |
| flate2 | 1.1.10 | MIT OR Apache-2.0 | https://github.com/rust-lang/flate2-rs |
| fnv | 1.0.7 | Apache-2.0 / MIT | https://github.com/servo/rust-fnv |
| foldhash | 0.1.5 | Zlib | https://github.com/orlp/foldhash |
| foldhash | 0.2.0 | Zlib | https://github.com/orlp/foldhash |
| foreign-types | 0.5.0 | MIT/Apache-2.0 | https://github.com/sfackler/foreign-types |
| foreign-types-macros | 0.2.4 | MIT/Apache-2.0 | https://github.com/sfackler/foreign-types |
| foreign-types-shared | 0.3.1 | MIT/Apache-2.0 | https://github.com/sfackler/foreign-types |
| form_urlencoded | 1.2.2 | MIT OR Apache-2.0 | https://github.com/servo/rust-url |
| futures-channel | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-core | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-executor | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-io | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-lite | 2.6.1 | Apache-2.0 OR MIT | https://github.com/smol-rs/futures-lite |
| futures-macro | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-sink | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-task | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-util | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| gdk | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gdk-pixbuf | 0.18.5 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| gdk-pixbuf-sys | 0.18.0 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| gdk-sys | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gdkwayland-sys | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gdkx11 | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gdkx11-sys | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| generic-array | 0.14.7 | MIT | https://github.com/fizyk20/generic-array |
| gethostname | 1.1.0 | Apache-2.0 | https://codeberg.org/swsnr/gethostname.rs |
| getrandom | 0.2.17 | MIT OR Apache-2.0 | https://github.com/rust-random/getrandom |
| getrandom | 0.3.4 | MIT OR Apache-2.0 | https://github.com/rust-random/getrandom |
| getrandom | 0.4.3 | MIT OR Apache-2.0 | https://github.com/rust-random/getrandom |
| gio | 0.18.4 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| gio-sys | 0.18.1 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| glib | 0.18.5 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| glib-macros | 0.18.5 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| glib-sys | 0.18.1 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| glob | 0.3.4 | MIT OR Apache-2.0 | https://github.com/rust-lang/glob |
| gobject-sys | 0.18.0 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| gtk | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gtk-sys | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gtk3-macros | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| half | 2.7.1 | MIT OR Apache-2.0 | https://github.com/VoidStarKat/half-rs |
| hashbrown | 0.12.3 | MIT OR Apache-2.0 | https://github.com/rust-lang/hashbrown |
| hashbrown | 0.15.5 | MIT OR Apache-2.0 | https://github.com/rust-lang/hashbrown |
| hashbrown | 0.17.1 | MIT OR Apache-2.0 | https://github.com/rust-lang/hashbrown |
| heck | 0.4.1 | MIT OR Apache-2.0 | https://github.com/withoutboats/heck |
| heck | 0.5.0 | MIT OR Apache-2.0 | https://github.com/withoutboats/heck |
| hermit-abi | 0.5.3 | MIT OR Apache-2.0 | https://github.com/hermit-os/hermit-rs |
| hex | 0.4.3 | MIT OR Apache-2.0 | https://github.com/KokaKiwi/rust-hex |
| hkdf | 0.12.4 | MIT OR Apache-2.0 | https://github.com/RustCrypto/KDFs/ |
| hmac | 0.12.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/MACs |
| hmac | 0.13.0 | MIT OR Apache-2.0 | https://github.com/RustCrypto/MACs |
| html5ever | 0.39.0 | MIT OR Apache-2.0 | https://github.com/servo/html5ever |
| http | 1.5.0 | MIT OR Apache-2.0 | https://github.com/hyperium/http |
| http-body | 1.1.0 | MIT | https://github.com/hyperium/http-body |
| http-body-util | 0.1.5 | MIT | https://github.com/hyperium/http-body |
| httparse | 1.10.1 | MIT OR Apache-2.0 | https://github.com/seanmonstar/httparse |
| httpdate | 1.0.3 | MIT OR Apache-2.0 | https://github.com/pyfisch/httpdate |
| hybrid-array | 0.4.15 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hybrid-array |
| hyper | 1.12.0 | MIT | https://github.com/hyperium/hyper |
| hyper-rustls | 0.27.10 | Apache-2.0 OR ISC OR MIT | https://github.com/rustls/hyper-rustls |
| hyper-util | 0.1.21 | MIT | https://github.com/hyperium/hyper-util |
| iana-time-zone | 0.1.65 | MIT OR Apache-2.0 | https://github.com/strawlab/iana-time-zone |
| iana-time-zone-haiku | 0.1.2 | MIT OR Apache-2.0 | https://github.com/strawlab/iana-time-zone |
| ico | 0.6.0 | MIT | https://github.com/mdsteele/rust-ico |
| icu_collections | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_locale_core | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_normalizer | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_normalizer_data | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_properties | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_properties_data | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_provider | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| ident_case | 1.0.1 | MIT/Apache-2.0 | https://github.com/TedDriggs/ident_case |
| idna | 1.1.0 | MIT OR Apache-2.0 | https://github.com/servo/rust-url/ |
| idna_adapter | 1.2.2 | Apache-2.0 OR MIT | https://github.com/hsivonen/idna_adapter |
| if-addrs | 0.15.0 | MIT OR BSD-3-Clause | https://github.com/messense/if-addrs |
| image | 0.25.10 | MIT OR Apache-2.0 | https://github.com/image-rs/image |
| indexmap | 1.9.3 | Apache-2.0 OR MIT | https://github.com/bluss/indexmap |
| indexmap | 2.14.2 | Apache-2.0 OR MIT | https://github.com/indexmap-rs/indexmap |
| infer | 0.22.0 | MIT | https://github.com/bojand/infer |
| inout | 0.1.4 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| inout | 0.2.5 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| io-kit-sys | 0.4.1 | MIT / Apache-2.0 | https://github.com/jtakakura/io-kit-rs |
| ipnet | 2.12.2 | MIT OR Apache-2.0 | https://github.com/krisprice/ipnet |
| is-docker | 0.2.0 | MIT | https://github.com/TheLarkInn/is-docker |
| is-wsl | 0.4.0 | MIT | https://github.com/TheLarkInn/is-wsl |
| itoa | 1.0.18 | MIT OR Apache-2.0 | https://github.com/dtolnay/itoa |
| javascriptcore-rs | 1.1.2 | MIT | https://github.com/tauri-apps/javascriptcore-rs |
| javascriptcore-rs-sys | 1.1.1 | MIT | https://github.com/tauri-apps/javascriptcore-rs |
| jiff | 0.2.38 | Unlicense OR MIT | https://github.com/BurntSushi/jiff |
| jiff-core | 0.1.1 | Unlicense OR MIT | https://github.com/BurntSushi/jiff |
| jiff-static | 0.2.38 | Unlicense OR MIT | https://github.com/BurntSushi/jiff |
| jiff-tzdb | 0.1.9 | Unlicense OR MIT | https://github.com/BurntSushi/jiff |
| jiff-tzdb-platform | 0.1.3 | Unlicense OR MIT | https://github.com/BurntSushi/jiff |
| jni | 0.21.1 | MIT/Apache-2.0 | https://github.com/jni-rs/jni-rs |
| jni | 0.22.4 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-rs |
| jni-macros | 0.22.4 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-rs |
| jni-sys | 0.3.1 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-sys |
| jni-sys | 0.4.1 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-sys |
| jni-sys-macros | 0.4.1 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-sys |
| js-sys | 0.3.106 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/js-sys |
| json-patch | 4.2.0 | MIT/Apache-2.0 | https://github.com/idubrov/json-patch |
| jsonptr | 0.7.1 | MIT OR Apache-2.0 | https://github.com/chanced/jsonptr |
| keyboard-types | 0.8.3 | MIT OR Apache-2.0 | https://github.com/rust-windowing/keyboard-types |
| keyring | 3.6.3 | MIT OR Apache-2.0 | https://github.com/hwchen/keyring-rs |
| lazy_static | 1.5.1 | MIT OR Apache-2.0 | https://github.com/rust-lang-nursery/lazy-static.rs |
| lazy-regex | 3.6.2 | MIT | https://github.com/Canop/lazy-regex |
| lazy-regex-proc_macros | 3.6.2 | MIT | https://github.com/Canop/lazy-regex/tree/main/src/proc_macros |
| libappindicator | 0.9.0 | Apache-2.0 OR MIT |  |
| libappindicator-sys | 0.9.0 | Apache-2.0 OR MIT |  |
| libc | 0.2.191 | MIT OR Apache-2.0 | https://github.com/rust-lang/libc |
| libdbus-sys | 0.2.7 | Apache-2.0/MIT | https://github.com/diwic/dbus-rs |
| libloading | 0.7.4 | ISC | https://github.com/nagisa/rust_libloading/ |
| libredox | 0.1.25 | MIT | https://gitlab.redox-os.org/redox-os/libredox |
| libudev | 0.3.0 | MIT | https://github.com/dcuddeback/libudev-rs |
| libudev-sys | 0.1.4 | MIT | https://github.com/dcuddeback/libudev-sys |
| linux-raw-sys | 0.12.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | https://github.com/sunfishcode/linux-raw-sys |
| litemap | 0.8.3 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| lock_api | 0.4.14 | MIT OR Apache-2.0 | https://github.com/Amanieu/parking_lot |
| log | 0.4.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/log |
| mach2 | 0.4.3 | BSD-2-Clause OR MIT OR Apache-2.0 | https://github.com/JohnTitor/mach2 |
| markup5ever | 0.39.0 | MIT OR Apache-2.0 | https://github.com/servo/html5ever |
| md-5 | 0.11.0 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hashes |
| memchr | 2.8.3 | Unlicense OR MIT | https://github.com/BurntSushi/memchr |
| memoffset | 0.9.1 | MIT | https://github.com/Gilnaa/memoffset |
| mime | 0.3.17 | MIT OR Apache-2.0 | https://github.com/hyperium/mime |
| minisign-verify | 0.3.0 | MIT | https://github.com/jedisct1/rust-minisign-verify |
| miniz_oxide | 0.8.9 | MIT OR Zlib OR Apache-2.0 | https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide |
| miniz_oxide | 0.9.1 | MIT OR Zlib OR Apache-2.0 | https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide |
| mio | 1.2.4 | MIT | https://github.com/tokio-rs/mio |
| moxcms | 0.8.1 | BSD-3-Clause OR Apache-2.0 | https://github.com/awxkee/moxcms |
| muda | 0.20.0 | Apache-2.0 OR MIT | https://github.com/tauri-apps/muda |
| ndk | 0.9.0 | MIT OR Apache-2.0 | https://github.com/rust-mobile/ndk |
| ndk-context | 0.1.1 | MIT OR Apache-2.0 | https://github.com/rust-windowing/android-ndk-rs |
| ndk-sys | 0.6.0+11769913 | MIT OR Apache-2.0 | https://github.com/rust-mobile/ndk |
| new_debug_unreachable | 1.0.6 | MIT | https://github.com/mbrubeck/rust-debug-unreachable |
| nix | 0.26.4 | MIT | https://github.com/nix-rust/nix |
| nix | 0.28.0 | MIT | https://github.com/nix-rust/nix |
| nix | 0.29.0 | MIT | https://github.com/nix-rust/nix |
| nix | 0.31.3 | MIT | https://github.com/nix-rust/nix |
| nom | 8.0.0 | MIT | https://github.com/rust-bakery/nom |
| num | 0.4.3 | MIT OR Apache-2.0 | https://github.com/rust-num/num |
| num_enum | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | https://github.com/illicitonion/num_enum |
| num_enum_derive | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | https://github.com/illicitonion/num_enum |
| num-bigint | 0.4.8 | MIT OR Apache-2.0 | https://github.com/rust-num/num-bigint |
| num-complex | 0.4.6 | MIT OR Apache-2.0 | https://github.com/rust-num/num-complex |
| num-conv | 0.2.2 | MIT OR Apache-2.0 | https://github.com/jhpratt/num-conv |
| num-integer | 0.1.47 | MIT OR Apache-2.0 | https://github.com/rust-num/num-integer |
| num-iter | 0.1.46 | MIT OR Apache-2.0 | https://github.com/rust-num/num-iter |
| num-rational | 0.4.2 | MIT OR Apache-2.0 | https://github.com/rust-num/num-rational |
| num-traits | 0.2.19 | MIT OR Apache-2.0 | https://github.com/rust-num/num-traits |
| objc2 | 0.6.5 | MIT | https://github.com/madsmtm/objc2 |
| objc2-app-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-cloud-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-data | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-foundation | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-graphics | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-image | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-location | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-text | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-encode | 4.1.0 | MIT | https://github.com/madsmtm/objc2 |
| objc2-exception-helper | 0.1.1 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-foundation | 0.3.2 | MIT | https://github.com/madsmtm/objc2 |
| objc2-io-surface | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-osa-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-quartz-core | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-ui-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-user-notifications | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-web-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| once_cell | 1.21.4 | MIT OR Apache-2.0 | https://github.com/matklad/once_cell |
| open | 5.4.5 | MIT | https://github.com/Byron/open-rs |
| openssl-probe | 0.2.2 | MIT OR Apache-2.0 | https://github.com/rustls/openssl-probe |
| option-ext | 0.2.0 | MPL-2.0 | https://github.com/soc/option-ext |
| ordered-stream | 0.2.0 | MIT OR Apache-2.0 | https://github.com/danieldg/ordered-stream |
| os_pipe | 1.2.3 | MIT | https://github.com/oconnor663/os_pipe.rs |
| osakit | 0.3.1 | MIT OR Apache-2.0 | https://github.com/mdevils/rust-osakit |
| pango | 0.18.3 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| pango-sys | 0.18.0 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| parking | 2.2.1 | Apache-2.0 OR MIT | https://github.com/smol-rs/parking |
| parking_lot | 0.12.5 | MIT OR Apache-2.0 | https://github.com/Amanieu/parking_lot |
| parking_lot_core | 0.9.12 | MIT OR Apache-2.0 | https://github.com/Amanieu/parking_lot |
| password-hash | 0.6.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| percent-encoding | 2.3.2 | MIT OR Apache-2.0 | https://github.com/servo/rust-url/ |
| petgraph | 0.8.3 | MIT OR Apache-2.0 | https://github.com/petgraph/petgraph |
| phc | 0.6.1 | Apache-2.0 OR MIT | https://github.com/RustCrypto/formats |
| phf | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf |
| phf_generator | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf |
| phf_macros | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf |
| phf_shared | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf |
| pin-project-lite | 0.2.17 | Apache-2.0 OR MIT | https://github.com/taiki-e/pin-project-lite |
| piper | 0.2.5 | MIT OR Apache-2.0 | https://github.com/smol-rs/piper |
| plist | 1.10.3 | MIT | https://github.com/ebarnard/rust-plist/ |
| png | 0.18.1 | MIT OR Apache-2.0 | https://github.com/image-rs/image-png |
| polling | 3.11.0 | Apache-2.0 OR MIT | https://github.com/smol-rs/polling |
| poly1305 | 0.9.1 | Apache-2.0 OR MIT | https://github.com/RustCrypto/universal-hashes |
| portable-atomic | 1.15.0 | Apache-2.0 OR MIT | https://github.com/taiki-e/portable-atomic |
| portable-atomic-util | 0.2.8 | Apache-2.0 OR MIT | https://github.com/taiki-e/portable-atomic-util |
| portable-pty | 0.9.0 | MIT | https://github.com/wezterm/wezterm |
| potential_utf | 0.1.6 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| powerfmt | 0.2.1 | MIT OR Apache-2.0 | https://github.com/jhpratt/powerfmt |
| ppv-lite86 | 0.2.21 | MIT OR Apache-2.0 | https://github.com/cryptocorrosion/cryptocorrosion |
| precomputed-hash | 0.1.1 | MIT | https://github.com/emilio/precomputed-hash |
| proc-macro-crate | 1.3.1 | MIT OR Apache-2.0 | https://github.com/bkchr/proc-macro-crate |
| proc-macro-crate | 2.0.2 | MIT OR Apache-2.0 | https://github.com/bkchr/proc-macro-crate |
| proc-macro-crate | 3.5.0 | MIT OR Apache-2.0 | https://github.com/bkchr/proc-macro-crate |
| proc-macro-error | 1.0.4 | MIT OR Apache-2.0 | https://gitlab.com/CreepySkeleton/proc-macro-error |
| proc-macro-error-attr | 1.0.4 | MIT OR Apache-2.0 | https://gitlab.com/CreepySkeleton/proc-macro-error |
| proc-macro2 | 1.0.107 | MIT OR Apache-2.0 | https://github.com/dtolnay/proc-macro2 |
| pxfm | 0.1.30 | BSD-3-Clause OR Apache-2.0 | https://github.com/awxkee/pxfm |
| quick-error | 2.0.1 | MIT/Apache-2.0 | http://github.com/tailhook/quick-error |
| quick-xml | 0.41.0 | MIT | https://github.com/tafia/quick-xml |
| quick-xml | 0.42.0 | MIT | https://github.com/tafia/quick-xml |
| quote | 1.0.47 | MIT OR Apache-2.0 | https://github.com/dtolnay/quote |
| r-efi | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later | https://github.com/r-efi/r-efi |
| r-efi | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later | https://github.com/r-efi/r-efi |
| rand | 0.8.8 | MIT OR Apache-2.0 | https://github.com/rust-random/rand |
| rand_chacha | 0.3.1 | MIT OR Apache-2.0 | https://github.com/rust-random/rand |
| rand_core | 0.6.4 | MIT OR Apache-2.0 | https://github.com/rust-random/rand |
| raw-window-handle | 0.6.2 | MIT OR Apache-2.0 OR Zlib | https://github.com/rust-windowing/raw-window-handle |
| redox_syscall | 0.5.18 | MIT | https://gitlab.redox-os.org/redox-os/syscall |
| redox_users | 0.5.3 | MIT | https://gitlab.redox-os.org/redox-os/users |
| ref-cast | 1.0.27 | MIT OR Apache-2.0 | https://github.com/dtolnay/ref-cast |
| ref-cast-impl | 1.0.27 | MIT OR Apache-2.0 | https://github.com/dtolnay/ref-cast |
| regex | 1.13.1 | MIT OR Apache-2.0 | https://github.com/rust-lang/regex |
| regex-automata | 0.4.18 | MIT OR Apache-2.0 | https://github.com/rust-lang/regex |
| regex-syntax | 0.8.11 | MIT OR Apache-2.0 | https://github.com/rust-lang/regex |
| reqwest | 0.13.5 | MIT OR Apache-2.0 | https://github.com/seanmonstar/reqwest |
| rfd | 0.17.2 | MIT | https://github.com/PolyMeilex/rfd |
| ring | 0.17.14 | Apache-2.0 AND ISC | https://github.com/briansmith/ring |
| rustc-hash | 2.1.3 | Apache-2.0 OR MIT | https://github.com/rust-lang/rustc-hash |
| rustix | 1.1.5 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | https://github.com/bytecodealliance/rustix |
| rustls | 0.23.46 | Apache-2.0 OR ISC OR MIT | https://github.com/rustls/rustls |
| rustls-native-certs | 0.8.5 | Apache-2.0 OR ISC OR MIT | https://github.com/rustls/rustls-native-certs |
| rustls-pki-types | 1.15.1 | MIT OR Apache-2.0 | https://github.com/rustls/pki-types |
| rustls-platform-verifier | 0.7.1 | MIT OR Apache-2.0 | https://github.com/rustls/rustls-platform-verifier |
| rustls-platform-verifier-android | 0.2.0 | MIT OR Apache-2.0 | https://github.com/rustls/rustls-platform-verifier |
| rustls-webpki | 0.103.16 | ISC | https://github.com/rustls/webpki |
| rustversion | 1.0.23 | MIT OR Apache-2.0 | https://github.com/dtolnay/rustversion |
| same-file | 1.0.6 | Unlicense/MIT | https://github.com/BurntSushi/same-file |
| schannel | 0.1.30 | MIT | https://github.com/steffengy/schannel-rs |
| schemars | 0.8.22 | MIT | https://github.com/GREsau/schemars |
| schemars | 0.9.0 | MIT | https://github.com/GREsau/schemars |
| schemars | 1.2.3 | MIT | https://github.com/GREsau/schemars |
| schemars_derive | 0.8.22 | MIT | https://github.com/GREsau/schemars |
| scopeguard | 1.2.0 | MIT OR Apache-2.0 | https://github.com/bluss/scopeguard |
| secret-service | 4.0.0 | MIT OR Apache-2.0 | https://github.com/hwchen/secret-service-rs |
| security-framework | 2.11.1 | MIT OR Apache-2.0 | https://github.com/kornelski/rust-security-framework |
| security-framework | 3.7.0 | MIT OR Apache-2.0 | https://github.com/kornelski/rust-security-framework |
| security-framework-sys | 2.17.0 | MIT OR Apache-2.0 | https://github.com/kornelski/rust-security-framework |
| selectors | 0.38.0 | MPL-2.0 | https://github.com/servo/stylo |
| semver | 1.0.28 | MIT OR Apache-2.0 | https://github.com/dtolnay/semver |
| serde | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_core | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_derive | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_derive_internals | 0.29.1 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_json | 1.0.154 | MIT OR Apache-2.0 | https://github.com/serde-rs/json |
| serde_repr | 0.1.21 | MIT OR Apache-2.0 | https://github.com/dtolnay/serde-repr |
| serde_spanned | 0.6.9 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| serde_spanned | 1.1.2 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| serde_with | 3.24.0 | MIT OR Apache-2.0 | https://github.com/jonasbb/serde_with/ |
| serde_with_macros | 3.24.0 | MIT OR Apache-2.0 | https://github.com/jonasbb/serde_with/ |
| serde-untagged | 0.1.9 | MIT OR Apache-2.0 | https://github.com/dtolnay/serde-untagged |
| serial2 | 0.2.38 | BSD-2-Clause OR Apache-2.0 | https://github.com/de-vri-es/serial2-rs |
| serialize-to-javascript | 0.1.2 | MIT OR Apache-2.0 | https://github.com/chippers/serialize-to-javascript |
| serialize-to-javascript-impl | 0.1.2 | MIT OR Apache-2.0 | https://github.com/chippers/serialize-to-javascript |
| serialport | 4.10.1 | MPL-2.0 | https://github.com/serialport/serialport-rs |
| servo_arc | 0.4.3 | MIT OR Apache-2.0 | https://github.com/servo/stylo |
| sha1 | 0.10.7 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hashes |
| sha1 | 0.11.0 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hashes |
| sha2 | 0.10.9 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hashes |
| sha2 | 0.11.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hashes |
| shared_library | 0.1.9 | Apache-2.0/MIT | https://github.com/tomaka/shared_library/ |
| shell-words | 1.1.1 | MIT/Apache-2.0 | https://github.com/tmiasko/shell-words |
| signal-hook-registry | 1.4.8 | MIT OR Apache-2.0 | https://github.com/vorner/signal-hook |
| simd_cesu8 | 1.2.0 | Apache-2.0 OR MIT | https://github.com/seancroach/simd_cesu8 |
| simd-adler32 | 0.3.10 | MIT | https://github.com/mcountryman/simd-adler32 |
| simdutf8 | 0.1.5 | MIT OR Apache-2.0 | https://github.com/rusticstuff/simdutf8 |
| siphasher | 1.0.4 | MIT OR Apache-2.0 | https://github.com/jedisct1/rust-siphash |
| slab | 0.4.12 | MIT | https://github.com/tokio-rs/slab |
| smallvec | 1.16.4 | MIT OR Apache-2.0 | https://github.com/servo/rust-smallvec |
| socket2 | 0.6.5 | MIT OR Apache-2.0 | https://github.com/rust-lang/socket2 |
| softbuffer | 0.4.8 | MIT OR Apache-2.0 | https://github.com/rust-windowing/softbuffer |
| soup3 | 0.5.0 | MIT | https://gitlab.gnome.org/World/Rust/soup3-rs |
| soup3-sys | 0.5.0 | MIT | https://gitlab.gnome.org/World/Rust/soup3-rs |
| stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 | https://github.com/storyyeller/stable_deref_trait |
| static_assertions | 1.1.0 | MIT OR Apache-2.0 | https://github.com/nvzqz/static-assertions-rs |
| string_cache | 0.9.0 | MIT OR Apache-2.0 | https://github.com/servo/string-cache |
| strsim | 0.11.1 | MIT | https://github.com/rapidfuzz/strsim-rs |
| subtle | 2.6.1 | BSD-3-Clause | https://github.com/dalek-cryptography/subtle |
| suppaftp | 12.2.1 | MIT OR Apache-2.0 | https://github.com/veeso/suppaftp |
| swift-rs | 1.0.9 | MIT OR Apache-2.0 | https://github.com/Brendonovich/swift-rs |
| syn | 1.0.109 | MIT OR Apache-2.0 | https://github.com/dtolnay/syn |
| syn | 2.0.119 | MIT OR Apache-2.0 | https://github.com/dtolnay/syn |
| syn | 3.0.9 | MIT OR Apache-2.0 | https://github.com/dtolnay/syn |
| sync_wrapper | 1.0.2 | Apache-2.0 | https://github.com/Actyx/sync_wrapper |
| synstructure | 0.14.0 | MIT | https://github.com/mystor/synstructure |
| system-configuration | 0.7.0 | MIT OR Apache-2.0 | https://github.com/mullvad/system-configuration-rs |
| system-configuration-sys | 0.6.0 | MIT OR Apache-2.0 | https://github.com/mullvad/system-configuration-rs |
| tao | 0.37.2 | Apache-2.0 | https://github.com/tauri-apps/tao |
| tao-macros | 0.1.4 | MIT OR Apache-2.0 | https://github.com/tauri-apps/tao |
| tar | 0.4.46 | MIT OR Apache-2.0 | https://github.com/composefs/tar-rs |
| tauri | 2.12.5 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tauri-codegen | 2.7.4 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tauri-macros | 2.7.4 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tauri-plugin-clipboard-manager | 2.5.0 | Apache-2.0 OR MIT | https://github.com/tauri-apps/plugins-workspace |
| tauri-plugin-dialog | 2.8.4 | Apache-2.0 OR MIT | https://github.com/tauri-apps/plugins-workspace |
| tauri-plugin-fs | 2.7.1 | Apache-2.0 OR MIT | https://github.com/tauri-apps/plugins-workspace |
| tauri-plugin-opener | 2.7.2 | Apache-2.0 OR MIT | https://github.com/tauri-apps/plugins-workspace |
| tauri-plugin-updater | 2.14.1 | Apache-2.0 OR MIT | https://github.com/tauri-apps/plugins-workspace |
| tauri-runtime | 2.12.2 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tauri-runtime-wry | 2.12.3 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tauri-utils | 2.10.2 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tempfile | 3.27.0 | MIT OR Apache-2.0 | https://github.com/Stebalien/tempfile |
| tendril | 0.5.1 | MIT OR Apache-2.0 | https://github.com/servo/html5ever |
| thiserror | 1.0.69 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| thiserror | 2.0.21 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| thiserror-impl | 1.0.69 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| thiserror-impl | 2.0.21 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| tiff | 0.11.3 | MIT | https://github.com/image-rs/image-tiff |
| time | 0.3.55 | MIT OR Apache-2.0 | https://github.com/time-rs/time |
| time-core | 0.1.9 | MIT OR Apache-2.0 | https://github.com/time-rs/time |
| time-macros | 0.2.32 | MIT OR Apache-2.0 | https://github.com/time-rs/time |
| tiny_http | 0.12.0 | MIT OR Apache-2.0 | https://github.com/tiny-http/tiny-http |
| tinystr | 0.8.5 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| tinyvec | 1.13.3 | Zlib OR Apache-2.0 OR MIT | https://github.com/Lokathor/tinyvec |
| tokio | 1.54.1 | MIT | https://github.com/tokio-rs/tokio |
| tokio-rustls | 0.26.6 | MIT OR Apache-2.0 | https://github.com/rustls/tokio-rustls |
| tokio-util | 0.7.20 | MIT | https://github.com/tokio-rs/tokio |
| toml | 1.1.8+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_datetime | 0.6.3 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_datetime | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_edit | 0.19.15 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_edit | 0.20.2 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_edit | 0.25.17+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_parser | 1.1.5+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_writer | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| tower | 0.5.3 | MIT | https://github.com/tower-rs/tower |
| tower-http | 0.6.11 | MIT | https://github.com/tower-rs/tower-http |
| tower-layer | 0.3.3 | MIT | https://github.com/tower-rs/tower |
| tower-service | 0.3.3 | MIT | https://github.com/tower-rs/tower |
| tracing | 0.1.44 | MIT | https://github.com/tokio-rs/tracing |
| tracing-attributes | 0.1.31 | MIT | https://github.com/tokio-rs/tracing |
| tracing-core | 0.1.36 | MIT | https://github.com/tokio-rs/tracing |
| tray-icon | 0.25.1 | MIT OR Apache-2.0 | https://github.com/tauri-apps/tray-icon |
| tree_magic_mini | 3.2.2 | MIT | https://github.com/mbrubeck/tree_magic/ |
| try-lock | 0.2.5 | MIT | https://github.com/seanmonstar/try-lock |
| typed-path | 0.13.0 | MIT OR Apache-2.0 | https://github.com/chipsenkbeil/typed-path |
| typeid | 1.0.3 | MIT OR Apache-2.0 | https://github.com/dtolnay/typeid |
| typenum | 1.20.1 | MIT OR Apache-2.0 | https://github.com/paholg/typenum |
| uds_windows | 1.2.1 | MIT | https://github.com/haraldh/rust_uds_windows |
| unescaper | 0.1.10 | MIT OR GPL-3.0-only | https://github.com/hack-ink/unescaper |
| unicode-ident | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 | https://github.com/dtolnay/unicode-ident |
| unicode-segmentation | 1.13.3 | MIT OR Apache-2.0 | https://github.com/unicode-rs/unicode-segmentation |
| universal-hash | 0.6.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| untrusted | 0.9.0 | ISC | https://github.com/briansmith/untrusted |
| url | 2.5.8 | MIT OR Apache-2.0 | https://github.com/servo/rust-url |
| urlpattern | 0.6.0 | MIT | https://github.com/denoland/rust-urlpattern |
| utf8_iter | 1.0.4 | Apache-2.0 OR MIT | https://github.com/hsivonen/utf8_iter |
| uuid | 1.29.0 | Apache-2.0 OR MIT | https://github.com/uuid-rs/uuid |
| walkdir | 2.5.0 | Unlicense/MIT | https://github.com/BurntSushi/walkdir |
| want | 0.3.2 | MIT | https://github.com/seanmonstar/want |
| wasi | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | https://github.com/bytecodealliance/wasi |
| wasip2 | 1.0.4+wasi-0.2.12 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | https://github.com/bytecodealliance/wasi-rs |
| wasm-bindgen | 0.2.129 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen |
| wasm-bindgen-futures | 0.4.79 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/futures |
| wasm-bindgen-macro | 0.2.129 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/macro |
| wasm-bindgen-macro-support | 0.2.129 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/main/crates/macro-support |
| wasm-bindgen-shared | 0.2.129 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/shared |
| wasm-streams | 0.5.0 | MIT OR Apache-2.0 | https://github.com/MattiasBuelens/wasm-streams/ |
| wayland-backend | 0.3.17 | MIT | https://github.com/smithay/wayland-rs |
| wayland-client | 0.31.15 | MIT | https://github.com/smithay/wayland-rs |
| wayland-protocols | 0.32.13 | MIT | https://github.com/smithay/wayland-rs |
| wayland-protocols-wlr | 0.3.12 | MIT | https://github.com/smithay/wayland-rs |
| wayland-scanner | 0.31.11 | MIT | https://github.com/smithay/wayland-rs |
| wayland-sys | 0.31.11 | MIT | https://github.com/smithay/wayland-rs |
| web_atoms | 0.2.6 | MIT OR Apache-2.0 | https://github.com/servo/html5ever |
| web-sys | 0.3.106 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/web-sys |
| web-time | 1.1.0 | MIT OR Apache-2.0 | https://github.com/daxpedda/web-time |
| webkit2gtk | 2.0.2 | MIT | https://github.com/tauri-apps/webkit2gtk-rs |
| webkit2gtk-sys | 2.0.2 | MIT | https://github.com/tauri-apps/webkit2gtk-rs |
| webpki-root-certs | 1.0.11 | CDLA-Permissive-2.0 | https://github.com/rustls/webpki-roots |
| webview2-com | 0.39.1 | MIT | https://github.com/wravery/webview2-rs |
| webview2-com-macros | 0.8.1 | MIT | https://github.com/wravery/webview2-rs |
| webview2-com-sys | 0.39.1 | MIT | https://github.com/wravery/webview2-rs |
| weezl | 0.1.12 | MIT OR Apache-2.0 | https://github.com/image-rs/weezl |
| winapi | 0.3.9 | MIT/Apache-2.0 | https://github.com/retep998/winapi-rs |
| winapi-i686-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 | https://github.com/retep998/winapi-rs |
| winapi-util | 0.1.11 | Unlicense OR MIT | https://github.com/BurntSushi/winapi-util |
| winapi-x86_64-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 | https://github.com/retep998/winapi-rs |
| window-vibrancy | 0.8.1 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri-plugin-vibrancy |
| windows | 0.62.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_aarch64_gnullvm | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_aarch64_gnullvm | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_aarch64_gnullvm | 0.53.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_aarch64_msvc | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_aarch64_msvc | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_aarch64_msvc | 0.53.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_gnu | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_gnu | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_gnu | 0.53.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_gnullvm | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_gnullvm | 0.53.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_msvc | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_msvc | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_msvc | 0.53.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_gnu | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_gnu | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_gnu | 0.53.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_gnullvm | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_gnullvm | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_gnullvm | 0.53.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_msvc | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_msvc | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_msvc | 0.53.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-collections | 0.3.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-core | 0.62.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-future | 0.3.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-implement | 0.60.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-interface | 0.59.3 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-link | 0.2.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-numerics | 0.3.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-registry | 0.6.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-result | 0.4.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-strings | 0.5.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-sys | 0.45.0 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-sys | 0.52.0 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-sys | 0.59.0 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-sys | 0.60.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-sys | 0.61.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-targets | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-targets | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-targets | 0.53.5 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-threading | 0.2.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-version | 0.1.7 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| winnow | 0.5.40 | MIT | https://github.com/winnow-rs/winnow |
| winnow | 1.0.4 | MIT | https://github.com/winnow-rs/winnow |
| winreg | 0.10.1 | MIT | https://github.com/gentoo90/winreg-rs |
| wit-bindgen | 0.57.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | https://github.com/bytecodealliance/wit-bindgen |
| wl-clipboard-rs | 0.9.5 | MIT OR Apache-2.0 | https://github.com/YaLTeR/wl-clipboard-rs |
| writeable | 0.6.4 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| wry | 0.57.1 | Apache-2.0 OR MIT | https://github.com/tauri-apps/wry |
| x11 | 2.21.0 | MIT | https://github.com/AltF02/x11-rs |
| x11-dl | 2.21.0 | MIT | https://github.com/AltF02/x11-rs |
| x11rb | 0.13.2 | MIT OR Apache-2.0 | https://github.com/psychon/x11rb |
| x11rb-protocol | 0.13.2 | MIT OR Apache-2.0 | https://github.com/psychon/x11rb |
| xattr | 1.6.1 | MIT OR Apache-2.0 | https://github.com/Stebalien/xattr |
| xdg-home | 1.3.0 | MIT | https://github.com/zeenix/xdg-home |
| yoke | 0.8.4 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| yoke-derive | 0.8.4 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zbus | 4.4.0 | MIT | https://github.com/dbus2/zbus/ |
| zbus | 5.19.0 | MIT | https://github.com/z-galaxy/zbus/ |
| zbus_macros | 4.4.0 | MIT | https://github.com/dbus2/zbus/ |
| zbus_macros | 5.19.0 | MIT | https://github.com/z-galaxy/zbus/ |
| zbus_names | 3.0.0 | MIT | https://github.com/dbus2/zbus/ |
| zbus_names | 4.3.5 | MIT | https://github.com/z-galaxy/zbus/ |
| zcheapstr | 1.1.0 | MIT | https://github.com/z-galaxy/zcheapstr/ |
| zerocopy | 0.8.63 | BSD-2-Clause OR Apache-2.0 OR MIT | https://github.com/google/zerocopy |
| zerocopy-derive | 0.8.63 | BSD-2-Clause OR Apache-2.0 OR MIT | https://github.com/google/zerocopy |
| zerofrom | 0.1.8 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerofrom-derive | 0.1.8 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zeroize | 1.9.1 | Apache-2.0 OR MIT | https://github.com/RustCrypto/utils |
| zeroize_derive | 1.5.0 | Apache-2.0 OR MIT | https://github.com/RustCrypto/utils |
| zerotrie | 0.2.5 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerovec | 0.11.9 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerovec-derive | 0.11.7 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zip | 9.4.0 | MIT | https://github.com/zip-rs/zip2 |
| zlib-rs | 0.6.8 | Zlib | https://github.com/trifectatechfoundation/zlib-rs |
| zmij | 1.0.23 | MIT | https://github.com/dtolnay/zmij |
| zopfli | 0.8.4 | Apache-2.0 | https://github.com/zopfli-rs/zopfli |
| zune-core | 0.5.3 | MIT OR Apache-2.0 OR Zlib | https://github.com/etemesi254/zune-image |
| zune-jpeg | 0.5.15 | MIT OR Apache-2.0 OR Zlib | https://github.com/etemesi254/zune-image/tree/dev/crates/zune-jpeg |
| zvariant | 4.2.0 | MIT | https://github.com/dbus2/zbus/ |
| zvariant | 5.15.1 | MIT | https://github.com/z-galaxy/zbus/ |
| zvariant_derive | 4.2.0 | MIT | https://github.com/dbus2/zbus/ |
| zvariant_derive | 5.15.1 | MIT | https://github.com/z-galaxy/zbus/ |
| zvariant_utils | 2.1.0 | MIT | https://github.com/dbus2/zbus/ |
| zvariant_utils | 4.2.0 | MIT | https://github.com/z-galaxy/zbus/ |

## Avisos de copyright

Líneas de copyright tomadas del archivo de licencia de cada paquete. Los paquetes sin línea de copyright en su archivo de licencia se rigen por el texto de la sección siguiente.

- **@antfu/install-pkg 2.1.0:** Copyright (c) 2021 Anthony Fu <https://github.com/antfu>
- **@braintree/sanitize-url 7.1.2:** Copyright (c) 2017 Braintree
- **@chevrotain/cst-dts-gen 13.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **@chevrotain/gast 13.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **@chevrotain/regexp-to-ast 13.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **@chevrotain/types 13.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **@chevrotain/utils 13.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **@iconify/types 2.0.0:** Copyright (c) 2021 - 2022 Vjacheslav Trushkin / Iconify OÜ
- **@iconify/utils 3.1.7:** Copyright (c) 2021-PRESENT Vjacheslav Trushkin
- **@mermaid-js/parser 2.0.1:** Copyright (c) 2023 Yokozuna59
- **@tauri-apps/api 2.12.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **@types/d3 7.4.3:** Copyright (c) Microsoft Corporation.
- **@types/d3-array 3.2.2:** Copyright (c) Microsoft Corporation.
- **@types/d3-axis 3.0.6:** Copyright (c) Microsoft Corporation.
- **@types/d3-brush 3.0.6:** Copyright (c) Microsoft Corporation.
- **@types/d3-chord 3.0.6:** Copyright (c) Microsoft Corporation.
- **@types/d3-color 3.1.3:** Copyright (c) Microsoft Corporation.
- **@types/d3-contour 3.0.6:** Copyright (c) Microsoft Corporation.
- **@types/d3-delaunay 6.0.4:** Copyright (c) Microsoft Corporation.
- **@types/d3-dispatch 3.0.7:** Copyright (c) Microsoft Corporation.
- **@types/d3-drag 3.0.7:** Copyright (c) Microsoft Corporation.
- **@types/d3-dsv 3.0.7:** Copyright (c) Microsoft Corporation.
- **@types/d3-ease 3.0.2:** Copyright (c) Microsoft Corporation.
- **@types/d3-fetch 3.0.7:** Copyright (c) Microsoft Corporation.
- **@types/d3-force 3.0.10:** Copyright (c) Microsoft Corporation.
- **@types/d3-format 3.0.4:** Copyright (c) Microsoft Corporation.
- **@types/d3-geo 3.1.1:** Copyright (c) Microsoft Corporation.
- **@types/d3-hierarchy 3.1.7:** Copyright (c) Microsoft Corporation.
- **@types/d3-interpolate 3.0.4:** Copyright (c) Microsoft Corporation.
- **@types/d3-path 3.1.1:** Copyright (c) Microsoft Corporation.
- **@types/d3-polygon 3.0.2:** Copyright (c) Microsoft Corporation.
- **@types/d3-quadtree 3.0.6:** Copyright (c) Microsoft Corporation.
- **@types/d3-random 3.0.4:** Copyright (c) Microsoft Corporation.
- **@types/d3-scale 4.0.9:** Copyright (c) Microsoft Corporation.
- **@types/d3-scale-chromatic 3.1.0:** Copyright (c) Microsoft Corporation.
- **@types/d3-selection 3.0.12:** Copyright (c) Microsoft Corporation.
- **@types/d3-shape 3.2.0:** Copyright (c) Microsoft Corporation.
- **@types/d3-time 3.0.4:** Copyright (c) Microsoft Corporation.
- **@types/d3-time-format 4.0.3:** Copyright (c) Microsoft Corporation.
- **@types/d3-timer 3.0.2:** Copyright (c) Microsoft Corporation.
- **@types/d3-transition 3.0.9:** Copyright (c) Microsoft Corporation.
- **@types/d3-zoom 3.0.9:** Copyright (c) Microsoft Corporation.
- **@types/geojson 7946.0.16:** Copyright (c) Microsoft Corporation.
- **@types/trusted-types 2.0.7:** Copyright (c) Microsoft Corporation.
- **@upsetjs/venn.js 2.0.0:** Copyright (c) 2013 Ben Frederickson; Copyright (c) 2021 Samuel Gratzl
- **@xterm/addon-fit 0.11.0:** Copyright (c) 2019, The xterm.js authors (https://github.com/xtermjs/xterm.js)
- **@xterm/addon-search 0.16.0:** Copyright (c) 2017, The xterm.js authors (https://github.com/xtermjs/xterm.js)
- **@xterm/addon-web-links 0.12.0:** Copyright (c) 2017, The xterm.js authors (https://github.com/xtermjs/xterm.js)
- **@xterm/addon-webgl 0.19.0:** Copyright (c) 2018, The xterm.js authors (https://github.com/xtermjs/xterm.js)
- **@xterm/xterm 6.0.0:** Copyright (c) 2017-2019, The xterm.js authors (https://github.com/xtermjs/xterm.js); Copyright (c) 2014-2016, SourceLair Private Company (https://www.sourcelair.com); Copyright (c) 2012-2013, Christopher Jeffrey (https://github.com/chjj/)
- **chevrotain 13.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **commander 15.0.0:** Copyright (c) 2011 TJ Holowaychuk <tj@vision-media.ca>
- **commander 7.2.0:** Copyright (c) 2011 TJ Holowaychuk <tj@vision-media.ca>
- **cose-base 1.0.3:** Copyright (c) 2019 - present, iVis@Bilkent.
- **cose-base 2.2.0:** Copyright (c) 2019 - present, iVis@Bilkent.
- **cytoscape 3.34.4:** Copyright (c) 2016-2026, The Cytoscape Consortium.
- **cytoscape-cose-bilkent 4.1.0:** Copyright (c) 2016-2018, The Cytoscape Consortium.
- **cytoscape-fcose 2.2.0:** Copyright (c) 2018 - present, iVis-at-Bilkent.
- **d3 7.9.0:** Copyright 2010-2023 Mike Bostock
- **d3-array 2.12.1:** Copyright 2010-2020 Mike Bostock
- **d3-array 3.2.4:** Copyright 2010-2023 Mike Bostock
- **d3-axis 3.0.0:** Copyright 2010-2021 Mike Bostock
- **d3-brush 3.0.0:** Copyright 2010-2021 Mike Bostock
- **d3-chord 3.0.1:** Copyright 2010-2021 Mike Bostock
- **d3-color 3.1.0:** Copyright 2010-2022 Mike Bostock
- **d3-contour 4.0.2:** Copyright 2012-2023 Mike Bostock
- **d3-delaunay 6.0.4:** Copyright 2018-2021 Observable, Inc.; Copyright 2021 Mapbox
- **d3-dispatch 3.0.1:** Copyright 2010-2021 Mike Bostock
- **d3-drag 3.0.0:** Copyright 2010-2021 Mike Bostock
- **d3-dsv 3.0.1:** Copyright 2013-2021 Mike Bostock
- **d3-ease 3.0.1:** Copyright 2010-2021 Mike Bostock; Copyright 2001 Robert Penner
- **d3-fetch 3.0.1:** Copyright 2016-2021 Mike Bostock
- **d3-force 3.0.0:** Copyright 2010-2021 Mike Bostock
- **d3-format 3.1.2:** Copyright 2010-2026 Mike Bostock
- **d3-geo 3.1.1:** Copyright 2010-2024 Mike Bostock; Copyright 2008-2012 Charles Karney; COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
- **d3-hierarchy 3.1.2:** Copyright 2010-2021 Mike Bostock
- **d3-interpolate 3.0.1:** Copyright 2010-2021 Mike Bostock
- **d3-path 1.0.9:** Copyright 2015-2016 Mike Bostock
- **d3-path 3.1.0:** Copyright 2015-2022 Mike Bostock
- **d3-polygon 3.0.1:** Copyright 2010-2021 Mike Bostock
- **d3-quadtree 3.0.1:** Copyright 2010-2021 Mike Bostock
- **d3-random 3.0.1:** Copyright 2010-2021 Mike Bostock
- **d3-sankey 0.12.3:** Copyright 2015, Mike Bostock
- **d3-scale 4.0.2:** Copyright 2010-2021 Mike Bostock
- **d3-scale-chromatic 3.1.0:** Copyright 2010-2024 Mike Bostock; Copyright 2002 Cynthia Brewer, Mark Harrower, and The Pennsylvania State University
- **d3-selection 3.0.0:** Copyright 2010-2021 Mike Bostock
- **d3-shape 1.3.7:** Copyright 2010-2015 Mike Bostock
- **d3-shape 3.2.0:** Copyright 2010-2022 Mike Bostock
- **d3-time 3.1.0:** Copyright 2010-2022 Mike Bostock
- **d3-time-format 4.1.0:** Copyright 2010-2021 Mike Bostock
- **d3-timer 3.0.1:** Copyright 2010-2021 Mike Bostock
- **d3-transition 3.0.1:** Copyright 2010-2021 Mike Bostock
- **d3-zoom 3.0.0:** Copyright 2010-2021 Mike Bostock
- **dagre-d3-es 7.0.14:** Copyright (c) 2022-2024 Thibaut Lassalle, David Newell, Alois Klink, Sidharth Vinod and dagre-es contributors
- **dayjs 1.11.23:** Copyright (c) 2018-present, iamkun
- **delaunator 5.1.0:** Copyright (c) 2026, Mapbox
- **dompurify 3.4.17:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; (c) under Patent Claims infringed by Covered Software in the absence of
- **elkjs 0.12.1:** copyright rights in its Contribution, if any, to grant the copyright
- **es-toolkit 1.53.0:** Copyright (c) 2024 Viva Republica, Inc.
- **hachure-fill 0.5.2:** Copyright (c) 2023 Preet Shihn
- **iconv-lite 0.6.3:** Copyright (c) 2011 Alexander Shtuchkin
- **import-meta-resolve 4.2.0:** Copyright (c) Titus Wormer <mailto:tituswormer@gmail.com>; Copyright Node.js contributors. All rights reserved.; Copyright Joyent, Inc. and other Node contributors. All rights reserved.
- **internmap 1.0.1:** Copyright 2021 Mike Bostock
- **internmap 2.0.3:** Copyright 2021 Mike Bostock
- **katex 0.18.10:** Copyright (c) 2013-2020 Khan Academy and other contributors
- **khroma 2.1.0:** Copyright (c) 2019-present Fabio Spampinato, Andrew Maney
- **layout-base 1.0.2:** Copyright (c) 2019 iVis@Bilkent
- **layout-base 2.0.1:** Copyright (c) 2019 iVis@Bilkent
- **lodash-es 4.18.1:** Copyright OpenJS Foundation and other contributors <https://openjsf.org/>; Copyright and related rights for sample code are waived via CC0. Sample
- **lucide-react 1.69.0:** Copyright (c) 2026 Lucide Icons and Contributors; copyright notice and this permission notice appear in all copies.; Copyright (c) 2013-present Cole Bemis
- **marked 16.4.2:** Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/); Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/); Copyright © 2004, John Gruber
- **mermaid 12.3.0:** Copyright (c) 2014 - 2022 Knut Sveidqvist
- **package-manager-detector 1.9.0:** Copyright (c) 2020-PRESENT Anthony Fu <https://github.com/antfu>
- **path-data-parser 0.1.0:** Copyright (c) 2020 Preet Shihn
- **points-on-curve 0.2.0:** Copyright (c) 2020 Preet Shihn
- **points-on-path 0.2.1:** Copyright (c) 2020 Preet
- **react 19.3.1:** Copyright (c) Meta Platforms, Inc. and affiliates.
- **react-dom 19.3.1:** Copyright (c) Meta Platforms, Inc. and affiliates.
- **roughjs 4.6.6:** Copyright (c) 2019 Preet Shihn
- **rw 1.3.3:** Copyright (c) 2014-2016, Michael Bostock
- **safer-buffer 2.1.2:** Copyright (c) 2018 Nikita Skovoroda <chalkerx@gmail.com>
- **scheduler 0.28.0:** Copyright (c) Meta Platforms, Inc. and affiliates.
- **stylis 4.4.0:** Copyright (c) 2016-present Sultan Tarimo
- **tinyexec 1.3.1:** Copyright (c) 2024 Tinylibs
- **ts-dedent 2.3.0:** Copyright (c) 2018 Tamino Martinius
- **adler2 2.0.1:** Copyright (C) Jonas Schievink <jonasschievink@gmail.com>; copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **aead 0.6.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019-2026 The RustCrypto Project Developers; Copyright (c) 2019 MobileCoin, LLC
- **aes 0.8.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018 Artyom Pavlov
- **aes 0.9.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2024 The RustCrypto Project Developers; Copyright (c) 2018 Artyom Pavlov
- **aho-corasick 1.1.5:** Copyright (c) 2015 Andrew Gallant
- **alloc-no-stdlib 3.0.0:** Copyright (c) 2016 Dropbox, Inc.
- **android_system_properties 0.1.6:** Copyright 2016 Nicolas Silva; Copyright (c) 2013 Nicolas Silva; COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
- **anyhow 1.0.104:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **arboard 3.7.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2022 The Arboard contributors
- **argon2 0.6.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2021-2026 The RustCrypto Project Developers
- **ascii 1.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 Thomas Bahn and contributors; Copyright (c) 2014 The Rust Project Developers
- **async-broadcast 0.7.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2020 Yoshua Wuyts; Copyright (c) 2020 Yoshua Wuyts
- **async-channel 2.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **async-executor 1.14.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **async-io 2.6.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **async-lock 3.4.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **async-process 2.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **async-recursion 1.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **async-signal 0.2.14:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **async-task 4.7.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **async-trait 0.1.92:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **atomic-waker 1.1.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Alex Crichton; Copyright (c) 2017 The Tokio Authors
- **base64 0.21.7:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 Alice Maz
- **base64 0.23.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2025 Alice Maz, Marshall Pierce
- **base64ct 1.8.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Steve "Sc00bz" Thomas (steve at tobtu dot com); Copyright (c) 2021-2025 The RustCrypto Project Developers
- **bit-set 0.8.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2023 The Rust Project Developers
- **bit-vec 0.8.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2023 The Rust Project Developers
- **bitflags 1.3.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **bitflags 2.13.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **blake2 0.11.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017-2026 The RustCrypto Project Developers; Copyright (c) 2017 Artyom Pavlov
- **block-buffer 0.10.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2019 The RustCrypto Project Developers
- **block-buffer 0.12.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2025 The RustCrypto Project Developers
- **block-padding 0.3.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2019 The RustCrypto Project Developers
- **block-padding 0.4.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2025 The RustCrypto Project Developers
- **blocking 1.7.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **brotli 9.1.0:** Copyright (c) 2016 Dropbox, Inc.; Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors.
- **brotli-decompressor 6.2.0:** Copyright (c) 2016 Dropbox, Inc.
- **bs58 0.5.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 The roaring-rs developers.
- **bumpalo 3.20.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019 Nick Fitzgerald
- **bytemuck 1.25.2:** (c) You must retain, in the Source form of any Derivative Works that You distribute, all copyright, patent, trademark, and attribution notices from the Source form of the Work, excluding those notices; Copyright (c) 2019 Daniel "Lokathor" Gee.
- **byteorder 1.5.0:** Copyright (c) 2015 Andrew Gallant
- **byteorder-lite 0.1.0:** Copyright (c) 2015 Andrew Gallant
- **bytes 1.12.1:** Copyright (c) 2018 Carl Lerche
- **camino 1.2.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **cargo-platform 0.1.9:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **cbc 0.1.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2022 RustCrypto Developers; Copyright (c) 2018 Artyom Pavlov
- **cbc 0.2.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2022 RustCrypto Developers; Copyright (c) 2018 Artyom Pavlov
- **cfb 0.14.0:** Copyright (c) 2017 Matthew D. Steele
- **cfb-mode 0.9.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2022 RustCrypto Developers; Copyright (c) 2018 Artyom Pavlov
- **cfg-if 1.0.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **chacha20 0.10.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019-2026 The RustCrypto Project Developers
- **chacha20poly1305 0.11.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019-2026 The RustCrypto Project Developers
- **chrono 0.4.45:** Copyright (c) 2014, Kang Seonghoon.; copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **chunked_transfer 1.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 The tiny-http Contributors; Copyright (c) 2015 The rust-chunked-transfer Contributors
- **cipher 0.4.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016-2020 RustCrypto Developers
- **cipher 0.5.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016-2025 RustCrypto Developers
- **cmov 0.5.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2022-2026 The RustCrypto Project Developers
- **combine 4.6.9:** Copyright (c) 2015 Markus Westerlind
- **concurrent-queue 2.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **const-oid 0.10.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2020-2026 The RustCrypto Project Developers
- **cookie 0.18.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2017 Sergio Benitez; Copyright 2014 Alex Chricton
- **core-foundation 0.10.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2012-2013 Mozilla Foundation
- **core-foundation 0.9.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2012-2013 Mozilla Foundation
- **core-foundation-sys 0.8.7:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2012-2013 Mozilla Foundation
- **core-graphics 0.25.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2012-2013 Mozilla Foundation
- **core-graphics-types 0.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2012-2013 Mozilla Foundation
- **cpubits 0.1.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2023-2026 The RustCrypto Project Developers
- **cpufeatures 0.2.17:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2020-2025 The RustCrypto Project Developers
- **cpufeatures 0.3.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2020-2026 The RustCrypto Project Developers
- **crc32fast 1.5.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018 Sam Rijs, Alex Crichton and contributors
- **crossbeam-channel 0.5.17:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019 The Crossbeam Project Developers; COPYRIGHT AND/OR OTHER APPLICABLE LAW. ANY USE OF THE WORK OTHER THAN AS
- **crossbeam-utils 0.8.23:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019 The Crossbeam Project Developers
- **crunchy 0.2.4:** Copyright 2017-2023 Eira Fransham.
- **crypto-common 0.1.7:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2021 RustCrypto Developers
- **crypto-common 0.2.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2021-2026 RustCrypto Developers
- **cssparser 0.37.0:** (c) under Patent Claims infringed by Covered Software in the absence of
- **cssparser-macros 0.7.1:** (c) under Patent Claims infringed by Covered Software in the absence of
- **ctor 1.0.13:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **ctutils 0.4.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2025-2026 The RustCrypto Project Developers
- **darling 0.24.1:** Copyright (c) 2017 Ted Driggs
- **darling_core 0.24.1:** Copyright (c) 2017 Ted Driggs
- **darling_macro 0.24.1:** Copyright (c) 2017 Ted Driggs
- **dbus 0.9.12:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2014-2018 David Henningsson <diwic@ubuntu.com> and other contributors; Copyright (c) 2014-2018 David Henningsson <diwic@ubuntu.com> and other contributors
- **dbus-secret-service 4.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 secret-service Developers
- **defmt 1.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Ferrous Systems
- **defmt-macros 1.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Ferrous Systems
- **defmt-parser 1.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Ferrous Systems
- **deranged 0.5.9:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2024 Jacob Pratt et al.; Copyright (c) 2024 Jacob Pratt et al.
- **derive_more 2.1.1:** Copyright (c) 2016 Jelte Fennema
- **derive_more-impl 2.1.1:** Copyright (c) 2016 Jelte Fennema
- **des 0.9.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2017 Gulshan Singh; Copyright (c) 2017-2024 The RustCrypto Project Developers
- **digest 0.10.7:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 Artyom Pavlov
- **digest 0.11.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017-2025 RustCrypto Developers; Copyright (c) 2017 Artyom Pavlov
- **dirs 7.0.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2019 dirs-rs contributors
- **dirs-sys 0.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2019 dirs-rs contributors
- **displaydoc 0.2.7:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **dom_query 0.28.0:** Copyright (c) 2023 Mykola Humanov
- **downcast-rs 1.2.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2020 Ashish Myles and contributors
- **dpi 0.1.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018 Jorge Aparicio; Copyright © 2005-2020 Rich Felker, et al.
- **dtoa 1.0.11:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **dtoa-short 0.3.5:** (c) under Patent Claims infringed by Covered Software in the absence of
- **dyn-clone 1.0.20:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **embed_plist 1.2.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2020 Nikolai Vazquez
- **enumflags2 0.7.12:** Copyright 2017-2023 Maik Klein, Maja Kądziołka; Copyright (c) 2017-2023 Maik Klein, Maja Kądziołka
- **enumflags2_derive 0.7.12:** Copyright [2017] [Maik Klein]; Copyright (c) 2017 Maik Klein
- **equivalent 1.0.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016--2023
- **erased-serde 0.4.11:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **errno 0.3.14:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Chris Wong
- **event-listener 5.4.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **event-listener-strategy 0.5.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **fastrand 2.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **fax 0.2.7:** Copyright © 2021 The pdf-rs contributers.
- **fdeflate 0.3.7:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **field-offset 0.3.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016-2021 Diggory Blake, and other contributors.
- **filedescriptor 0.8.3:** Copyright (c) 2018 Wez Furlong
- **filetime 0.2.29:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **fixedbitset 0.5.7:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015-2017
- **flate2 1.1.10:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014-2026 Alex Crichton
- **fnv 1.0.7:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 Contributors
- **foldhash 0.1.5:** Copyright (c) 2024 Orson Peters
- **foldhash 0.2.0:** Copyright (c) 2024 Orson Peters
- **foreign-types 0.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 The foreign-types Developers
- **foreign-types-macros 0.2.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 The foreign-types Developers
- **foreign-types-shared 0.3.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 The foreign-types Developers
- **form_urlencoded 1.2.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2013-2016 The rust-url developers
- **futures-channel 0.3.34:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Alex Crichton; Copyright (c) 2017 The Tokio Authors
- **futures-core 0.3.34:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Alex Crichton; Copyright (c) 2017 The Tokio Authors
- **futures-executor 0.3.34:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Alex Crichton; Copyright (c) 2017 The Tokio Authors
- **futures-io 0.3.34:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Alex Crichton; Copyright (c) 2017 The Tokio Authors
- **futures-lite 2.6.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Alex Crichton; Copyright (c) 2017 The Tokio Authors
- **futures-macro 0.3.34:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Alex Crichton; Copyright (c) 2017 The Tokio Authors
- **futures-sink 0.3.34:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Alex Crichton; Copyright (c) 2017 The Tokio Authors
- **futures-task 0.3.34:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Alex Crichton; Copyright (c) 2017 The Tokio Authors
- **futures-util 0.3.34:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Alex Crichton; Copyright (c) 2017 The Tokio Authors
- **generic-array 0.14.7:** Copyright (c) 2015 Bartłomiej Kamiński
- **gethostname 1.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **getrandom 0.2.17:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2024 The rust-random Project Developers; Copyright (c) 2014 The Rust Project Developers
- **getrandom 0.3.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2025 The rust-random Project Developers; Copyright (c) 2014 The Rust Project Developers
- **getrandom 0.4.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2026 The rust-random Project Developers; Copyright (c) 2014 The Rust Project Developers
- **glob 0.3.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **half 2.7.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **hashbrown 0.12.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Amanieu d'Antras
- **hashbrown 0.15.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Amanieu d'Antras
- **hashbrown 0.17.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Amanieu d'Antras
- **heck 0.4.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 The Rust Project Developers
- **heck 0.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 The Rust Project Developers
- **hermit-abi 0.5.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **hex 0.4.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2013-2014 The Rust Project Developers.; Copyright (c) 2015-2020 The rust-hex Developers
- **hkdf 0.12.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015-2018 Vlad Filippov; Copyright (c) 2018-2021 RustCrypto Developers
- **hmac 0.12.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 Artyom Pavlov
- **hmac 0.13.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 Artyom Pavlov
- **html5ever 0.39.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The html5ever Project Developers
- **http 1.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2017 http-rs authors; Copyright (c) 2017 http-rs authors
- **http-body 1.1.0:** Copyright (c) 2019-2026 Sean McArthur & Hyper Contributors
- **http-body-util 0.1.5:** Copyright (c) 2019-2026 Sean McArthur & Hyper Contributors
- **httparse 1.10.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015-2025 Sean McArthur
- **httpdate 1.0.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Pyfisch
- **hybrid-array 0.4.15:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2022-2026 The RustCrypto Project Developers
- **hyper 1.12.0:** Copyright (c) 2014-2026 Sean McArthur
- **hyper-rustls 0.27.10:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016, Joseph Birr-Pixton <jpixton@gmail.com>; Copyright (c) 2016 Joseph Birr-Pixton <jpixton@gmail.com>
- **hyper-util 0.1.21:** Copyright (c) 2023-2025 Sean McArthur
- **iana-time-zone 0.1.65:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2020 Andrew Straw; Copyright (c) 2020 Andrew D. Straw
- **iana-time-zone-haiku 0.1.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2020 Andrew Straw; Copyright (c) 2020 Andrew D. Straw
- **ico 0.6.0:** Copyright (c) 2018 Matthew D. Steele
- **icu_collections 2.4.0:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **icu_locale_core 2.4.0:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **icu_normalizer 2.4.0:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **icu_normalizer_data 2.4.0:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **icu_properties 2.4.0:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **icu_properties_data 2.4.0:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **icu_provider 2.4.0:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **idna 1.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2013-2025 The rust-url developers
- **idna_adapter 1.2.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) The rust-url developers
- **if-addrs 0.15.0:** Copyright 2018 MaidSafe.net limited.; Copyright 2020 messense
- **image 0.25.10:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **indexmap 1.9.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016--2017
- **indexmap 2.14.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016--2017
- **infer 0.22.0:** Copyright (c) 2019 Bojan
- **inout 0.1.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2022 The RustCrypto Project Developers; Copyright (c) 2022 Artyom Pavlov
- **inout 0.2.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2022-2025 The RustCrypto Project Developers; Copyright (c) 2022 Artyom Pavlov
- **io-kit-sys 0.4.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017-2018 Junji Takakura
- **ipnet 2.12.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2017 Juniper Networks, Inc.
- **is-docker 0.2.0:** Copyright (c) 2023 Sean Larkin
- **is-wsl 0.4.0:** Copyright (c) 2023 Sean Larkin
- **itoa 1.0.18:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **javascriptcore-rs 1.1.2:** Copyright (c) 2013-2021, The Gtk-rs Project Developers.; Copyright (c) 2021, Tauri Programme within The Commons Conservancy.
- **javascriptcore-rs-sys 1.1.1:** Copyright (c) 2013-2017, The Gtk-rs Project Developers.
- **jiff 0.2.38:** Copyright (c) 2015 Andrew Gallant
- **jiff-core 0.1.1:** Copyright (c) 2015 Andrew Gallant
- **jiff-static 0.2.38:** Copyright (c) 2015 Andrew Gallant
- **jiff-tzdb 0.1.9:** Copyright (c) 2015 Andrew Gallant
- **jiff-tzdb-platform 0.1.3:** Copyright (c) 2015 Andrew Gallant
- **jni 0.21.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Prevoty, Inc. and jni-rs contributors
- **jni-sys 0.3.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 The rust-jni-sys Developers
- **jni-sys 0.4.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 The rust-jni-sys Developers
- **js-sys 0.3.106:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **json-patch 4.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 Ivan Dubrov
- **jsonptr 0.7.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2024 Chance Dinkins; Copyright (c) 2022 Chance Dinkins
- **keyboard-types 0.8.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 Pyfisch
- **keyring 3.6.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright [2017] [keyring developers]; Copyright (c) 2016 keyring Developers
- **lazy_static 1.5.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **lazy-regex 3.6.2:** Copyright (c) 2018 Canop
- **libappindicator 0.9.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017-2021 qDot; Copyright (c) 2021 Tauri Apps Contributors
- **libc 0.2.191:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) The Rust Project Developers
- **libdbus-sys 0.2.7:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2014-2018 David Henningsson <diwic@ubuntu.com> and other contributors; Copyright (c) 2014-2018 David Henningsson <diwic@ubuntu.com> and other contributors
- **libloading 0.7.4:** Copyright © 2015, Simonas Kazlauskas
- **libredox 0.1.25:** Copyright (c) 2023 4lDO2
- **libudev 0.3.0:** Copyright (c) 2015 David Cuddeback
- **libudev-sys 0.1.4:** Copyright (c) 2015 David Cuddeback
- **linux-raw-sys 0.12.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **litemap 0.8.3:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **lock_api 0.4.14:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 The Rust Project Developers
- **log 0.4.34:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **mach2 0.4.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019 Nick Fitzgerald, 2021 Yuki Okushi
- **markup5ever 0.39.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The html5ever Project Developers
- **md-5 0.11.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016-2026 The RustCrypto Project Developers; Copyright (c) 2016 Artyom Pavlov
- **memchr 2.8.3:** Copyright (c) 2015 Andrew Gallant
- **memoffset 0.9.1:** Copyright (c) 2017 Gilad Naaman
- **mime 0.3.17:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Sean McArthur
- **minisign-verify 0.3.0:** Copyright (c) 2019-2025 Frank Denis; Copyright (c) 2006-2009 Graydon Hoare; Copyright (c) 2009-2013 Mozilla Foundation
- **miniz_oxide 0.8.9:** Copyright 2013-2014 RAD Game Tools and Valve Software; Copyright 2010-2014 Rich Geldreich and Tenacious Software LLC; Copyright (c) 2017 Frommi; Copyright (c) 2017-2024 oyvindln; copyright notice that is included in or attached to the work
- **miniz_oxide 0.9.1:** Copyright 2013-2014 RAD Game Tools and Valve Software; Copyright 2010-2014 Rich Geldreich and Tenacious Software LLC; Copyright (c) 2017 Frommi; Copyright (c) 2017-2024 oyvindln; copyright notice that is included in or attached to the work
- **mio 1.2.4:** Copyright (c) 2014 Carl Lerche and other MIO contributors
- **moxcms 0.8.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2024 Radzivon Bartoshyk; Copyright (c) Radzivon Bartoshyk. All rights reserved.
- **muda 0.20.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2022-2022 Tauri Programme within The Commons Conservancy
- **new_debug_unreachable 1.0.6:** Copyright (c) 2015 Jonathan Reem
- **nix 0.26.4:** Copyright (c) 2015 Carl Lerche + nix-rust Authors
- **nix 0.28.0:** Copyright (c) 2015 Carl Lerche + nix-rust Authors
- **nix 0.29.0:** Copyright (c) 2015 Carl Lerche + nix-rust Authors
- **nix 0.31.3:** Copyright (c) 2015 Carl Lerche + nix-rust Authors
- **nom 8.0.0:** Copyright (c) 2014-2019 Geoffroy Couprie
- **num 0.4.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **num_enum 0.7.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018, Daniel Wagner-Hall
- **num_enum_derive 0.7.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018, Daniel Wagner-Hall
- **num-bigint 0.4.8:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **num-complex 0.4.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **num-conv 0.2.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Jacob Pratt
- **num-integer 0.1.47:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **num-iter 0.1.46:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **num-rational 0.4.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **num-traits 0.2.19:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **once_cell 1.21.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **open 5.4.5:** Copyright © `2015` `Sebastian Thiel`
- **openssl-probe 0.2.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **option-ext 0.2.0:** (c) under Patent Claims infringed by Covered Software in the absence of
- **ordered-stream 0.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **osakit 0.3.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2024 Marat Dulin
- **parking 2.2.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2014-2020 The Rust Project Developers
- **parking_lot 0.12.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 The Rust Project Developers
- **parking_lot_core 0.9.12:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 The Rust Project Developers
- **password-hash 0.6.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2020-2026 RustCrypto Developers
- **percent-encoding 2.3.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2013-2025 The rust-url developers
- **petgraph 0.8.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015
- **phc 0.6.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2021-2026 The RustCrypto Project Developers
- **phf 0.13.1:** Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi; COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
- **phf_generator 0.13.1:** Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi; COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
- **phf_macros 0.13.1:** Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi; COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
- **phf_shared 0.13.1:** Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi; COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
- **pin-project-lite 0.2.17:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **piper 0.2.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **plist 1.10.3:** Copyright (c) 2015 Edward Barnard
- **png 0.18.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 nwin
- **polling 3.11.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **poly1305 0.9.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015-2026 The RustCrypto Project Developers
- **portable-atomic 1.15.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **portable-atomic-util 0.2.8:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **portable-pty 0.9.0:** Copyright (c) 2018 Wez Furlong
- **potential_utf 0.1.6:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **powerfmt 0.2.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2023 Jacob Pratt et al.; Copyright (c) 2023 Jacob Pratt et al.
- **ppv-lite86 0.2.21:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2019 The CryptoCorrosion Contributors; Copyright (c) 2019 The CryptoCorrosion Contributors
- **precomputed-hash 0.1.1:** Copyright (c) 2017 Emilio Cobos Álvarez
- **proc-macro-crate 1.3.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **proc-macro-crate 2.0.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **proc-macro-crate 3.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **proc-macro-error 1.0.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2019-2020 CreepySkeleton <creepy-skeleton@yandex.ru>; Copyright (c) 2019-2020 CreepySkeleton
- **proc-macro-error-attr 1.0.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2019-2020 CreepySkeleton <creepy-skeleton@yandex.ru>; Copyright (c) 2019-2020 CreepySkeleton
- **proc-macro2 1.0.107:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **pxfm 0.1.30:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2024 Radzivon Bartoshyk; Copyright (c) Radzivon Bartoshyk. All rights reserved.
- **quick-error 2.0.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 The quick-error Developers
- **quick-xml 0.41.0:** Copyright (c) 2016 Johann Tuffe
- **quick-xml 0.42.0:** Copyright (c) 2016 Johann Tuffe
- **quote 1.0.47:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **rand 0.8.8:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2018 Developers of the Rand project; Copyright (c) 2014 The Rust Project Developers
- **rand_chacha 0.3.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2018 Developers of the Rand project; Copyright (c) 2014 The Rust Project Developers
- **rand_core 0.6.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2018 Developers of the Rand project; Copyright (c) 2014 The Rust Project Developers
- **raw-window-handle 0.6.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019 Osspial; Copyright (c) 2020 Osspial
- **redox_syscall 0.5.18:** Copyright (c) 2017 Redox OS Developers
- **redox_users 0.5.3:** Copyright (c) 2017 Jose Narvaez
- **ref-cast 1.0.27:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **ref-cast-impl 1.0.27:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **regex 1.13.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **regex-automata 0.4.18:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **regex-syntax 0.8.11:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers
- **reqwest 0.13.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2016 Sean McArthur; Copyright (c) 2016-2026 Sean McArthur
- **rfd 0.17.2:** Copyright (c) 2022 Bartłomiej Maryńczak
- **ring 0.17.14:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2009 The Go Authors. All rights reserved.; copyright notice, this list of conditions and the following disclaimer
- **rustc-hash 2.1.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **rustix 1.1.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **rustls 0.23.46:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016, Joseph Birr-Pixton <jpixton@gmail.com>; Copyright (c) 2016 Joseph Birr-Pixton <jpixton@gmail.com>
- **rustls-native-certs 0.8.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016, Joseph Birr-Pixton <jpixton@gmail.com>; Copyright (c) 2016 Joseph Birr-Pixton <jpixton@gmail.com>
- **rustls-pki-types 1.15.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2023 Dirkjan Ochtman; Copyright (c) 2023 Dirkjan Ochtman <dirkjan@ochtman.nl>
- **rustls-platform-verifier 0.7.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2022 1Password
- **rustls-webpki 0.103.16:** Copyright 2015 Brian Smith.; copyright notice and this permission notice appear in all copies.
- **rustversion 1.0.23:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **same-file 1.0.6:** Copyright (c) 2017 Andrew Gallant
- **schannel 0.1.30:** Copyright (c) 2015 steffengy
- **schemars 0.8.22:** Copyright (c) 2019 Graham Esau
- **schemars 0.9.0:** Copyright (c) 2019 Graham Esau
- **schemars 1.2.3:** Copyright (c) 2019 Graham Esau
- **schemars_derive 0.8.22:** Copyright (c) 2019 Graham Esau
- **scopeguard 1.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016-2019 Ulrik Sverdrup "bluss" and scopeguard developers
- **secret-service 4.0.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 secret-service Developers
- **security-framework 2.11.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 Steven Fackler; COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
- **security-framework 3.7.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 Steven Fackler; COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
- **security-framework-sys 2.17.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 Steven Fackler; COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
- **semver 1.0.28:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **serde 1.0.229:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **serde_core 1.0.229:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **serde_derive 1.0.229:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **serde_derive_internals 0.29.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **serde_json 1.0.154:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **serde_repr 0.1.21:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **serde_spanned 0.6.9:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Individual contributors
- **serde_spanned 1.1.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright Individual contributors; Copyright (c) Individual contributors
- **serde_with 3.24.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015
- **serde_with_macros 3.24.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015
- **serde-untagged 0.1.9:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **serial2 0.2.38:** Copyright 2021, Maarten de Vries <maarten@de-vri.es>; Copyright (c) 2021, Maarten de Vries <maarten@de-vri.es>
- **serialize-to-javascript 0.1.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2021 Chip Reed
- **serialize-to-javascript-impl 0.1.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2021 Chip Reed
- **servo_arc 0.4.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **sha1 0.10.7:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2006-2009 Graydon Hoare; Copyright (c) 2009-2013 Mozilla Foundation
- **sha1 0.11.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016-2026 The RustCrypto Project Developers; Copyright (c) 2016 Artyom Pavlov
- **sha2 0.10.9:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2006-2009 Graydon Hoare; Copyright (c) 2009-2013 Mozilla Foundation
- **sha2 0.11.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016-2026 The RustCrypto Project Developers; Copyright (c) 2016 Artyom Pavlov
- **shared_library 0.1.9:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 Pierre Krieger
- **shell-words 1.1.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2016 Tomasz Miąsko
- **signal-hook-registry 1.4.8:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 tokio-jsonrpc developers
- **simd_cesu8 1.2.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **simd-adler32 0.3.10:** Copyright (c) [2021] [Marvin Countryman]
- **simdutf8 0.1.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **siphasher 1.0.4:** Copyright 2012-2016 The Rust Project Developers.; Copyright 2016-2026 Frank Denis.; copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **slab 0.4.12:** Copyright (c) 2019 Carl Lerche
- **smallvec 1.16.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018 The Servo Project Developers
- **socket2 0.6.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **softbuffer 0.4.8:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2022 Kirill Chibisov
- **soup3 0.5.0:** Copyright (c) 2013-2017, The Gtk-rs Project Developers.
- **soup3-sys 0.5.0:** Copyright (c) 2013-2017, The Gtk-rs Project Developers.
- **stable_deref_trait 1.2.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 Robert Grosse
- **static_assertions 1.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 Nikolai Vazquez
- **string_cache 0.9.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2012-2013 Mozilla Foundation
- **strsim 0.11.1:** Copyright (c) 2015 Danny Guo; Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com>; Copyright (c) 2018 Akash Kurdekar
- **subtle 2.6.1:** Copyright (c) 2016-2017 Isis Agora Lovecruft, Henry de Valence. All rights reserved.; Copyright (c) 2016-2024 Isis Agora Lovecruft. All rights reserved.
- **swift-rs 1.0.9:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2023 The swift-rs developers; Copyright (c) 2023 The swift-rs Developers
- **syn 1.0.109:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **syn 2.0.119:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **syn 3.0.9:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **sync_wrapper 1.0.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **synstructure 0.14.0:** Copyright 2016 Nika Layzell
- **system-configuration 0.7.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2024 Mullvad VPN AB
- **system-configuration-sys 0.6.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2024 Mullvad VPN AB
- **tao 0.37.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **tao-macros 0.1.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2022 - Present Tauri Apps Contributors
- **tar 0.4.46:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) The tar-rs Project Contributors
- **tauri 2.12.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-codegen 2.7.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-macros 2.7.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-plugin-clipboard-manager 2.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-plugin-dialog 2.8.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-plugin-fs 2.7.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-plugin-opener 2.7.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-plugin-updater 2.14.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-runtime 2.12.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-runtime-wry 2.12.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-utils 2.10.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2017 - Present Tauri Apps Contributors
- **tempfile 3.27.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 Steven Allen
- **tendril 0.5.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 Keegan McAllister
- **thiserror 1.0.69:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **thiserror 2.0.21:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **thiserror-impl 1.0.69:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **thiserror-impl 2.0.21:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **tiff 0.11.3:** Copyright (c) 2018 PistonDevelopers
- **time 0.3.55:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Jacob Pratt et al.
- **time-core 0.1.9:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Jacob Pratt et al.
- **time-macros 0.2.32:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Jacob Pratt et al.
- **tiny_http 0.12.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014-2019 The tiny-http contributors
- **tinystr 0.8.5:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **tinyvec 1.13.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019 Daniel "Lokathor" Gee.
- **tokio 1.54.1:** Copyright (c) Tokio Contributors
- **tokio-rustls 0.26.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2017 quininer kel; Copyright (c) 2017 quininer kel
- **tokio-util 0.7.20:** Copyright (c) Tokio Contributors
- **toml 1.1.8+spec-1.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright Individual contributors; Copyright (c) Individual contributors
- **toml_datetime 0.6.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **toml_datetime 1.1.2+spec-1.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright Individual contributors; Copyright (c) Individual contributors
- **toml_edit 0.19.15:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Individual contributors
- **toml_edit 0.20.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Individual contributors
- **toml_edit 0.25.17+spec-1.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright Individual contributors; Copyright (c) Individual contributors
- **toml_parser 1.1.5+spec-1.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright Individual contributors; Copyright (c) Individual contributors
- **toml_writer 1.1.3+spec-1.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright Individual contributors; Copyright (c) Individual contributors
- **tower 0.5.3:** Copyright (c) 2019 Tower Contributors
- **tower-http 0.6.11:** Copyright (c) 2019-2021 Tower Contributors
- **tower-layer 0.3.3:** Copyright (c) 2019 Tower Contributors
- **tower-service 0.3.3:** Copyright (c) 2019 Tower Contributors
- **tracing 0.1.44:** Copyright (c) 2019 Tokio Contributors
- **tracing-attributes 0.1.31:** Copyright (c) 2019 Tokio Contributors
- **tracing-core 0.1.36:** Copyright (c) 2019 Tokio Contributors
- **tray-icon 0.25.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2022-2022 Tauri Programme within The Commons Conservancy
- **tree_magic_mini 3.2.2:** Copyright (c) 2017 Aaron Hancock
- **try-lock 0.2.5:** Copyright (c) 2018-2023 Sean McArthur; Copyright (c) 2016 Alex Crichton
- **typed-path 0.13.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **typeid 1.0.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **typenum 1.20.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2014 Paho Lurie-Gregg; Copyright (c) 2014 Paho Lurie-Gregg
- **uds_windows 1.2.1:** Copyright (c) Microsoft Corporation. All rights reserved.
- **unescaper 0.1.10:** Copyright (C) 2007 Free Software Foundation, Inc. <http://fsf.org/>; copyright on the Program, and are irrevocable provided the stated; copyright holder, and you cure the violation prior to 30 days after; Copyright (C) {year}  {name of author}; Copyright (c) 2023 Hack Ink
- **unicode-ident 1.0.27:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; COPYRIGHT AND PERMISSION NOTICE; Copyright © 1991-2023 Unicode, Inc.
- **unicode-segmentation 1.13.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 The Rust Project Developers
- **universal-hash 0.6.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019-2025 RustCrypto Developers
- **url 2.5.8:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2013-2025 The rust-url developers
- **urlpattern 0.6.0:** Copyright (c) 2021 the Deno authors
- **utf8_iter 1.0.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright Mozilla Foundation
- **uuid 1.29.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The Rust Project Developers; Copyright (c) 2018 Ashley Mannix, Christopher Armstrong, Dylan DPC, Hunar Roop Kahlon
- **walkdir 2.5.0:** Copyright (c) 2015 Andrew Gallant
- **want 0.3.2:** Copyright (c) 2018-2019 Sean McArthur
- **wasi 0.11.1+wasi-snapshot-preview1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **wasip2 1.0.4+wasi-0.2.12:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **wasm-bindgen 0.2.129:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **wasm-bindgen-futures 0.4.79:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **wasm-bindgen-macro 0.2.129:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **wasm-bindgen-macro-support 0.2.129:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **wasm-bindgen-shared 0.2.129:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **wasm-streams 0.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **wayland-backend 0.3.17:** Copyright (c) 2015 Elinor Berger
- **wayland-client 0.31.15:** Copyright (c) 2015 Elinor Berger
- **wayland-protocols 0.32.13:** Copyright (c) 2015 Elinor Berger
- **wayland-protocols-wlr 0.3.12:** Copyright (c) 2015 Elinor Berger
- **wayland-scanner 0.31.11:** Copyright (c) 2015 Elinor Berger
- **wayland-sys 0.31.11:** Copyright (c) 2015 Elinor Berger
- **web_atoms 0.2.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 The html5ever Project Developers
- **web-sys 0.3.106:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2014 Alex Crichton
- **web-time 1.1.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2023 dAxpeDDa; Copyright (c) 2023 dAxpeDDa
- **webkit2gtk 2.0.2:** Copyright (c) 2016 Boucher, Antoni <bouanto@zoho.com>; Copyright (c) 2017-2021, The Gtk-rs Project Developers.; Copyright (c) 2021, Tauri Programme within The Commons Conservancy; COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
- **webkit2gtk-sys 2.0.2:** Copyright (c) 2016 Boucher, Antoni <bouanto@zoho.com>; COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
- **weezl 0.1.12:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) HeroicKatora 2020
- **winapi 0.3.9:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015-2018 The winapi-rs Developers
- **winapi-util 0.1.11:** Copyright (c) 2017 Andrew Gallant
- **window-vibrancy 0.8.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2020-2022 Tauri Programme within The Commons Conservancy
- **windows 0.62.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_aarch64_gnullvm 0.42.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_aarch64_gnullvm 0.52.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_aarch64_gnullvm 0.53.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_aarch64_msvc 0.42.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_aarch64_msvc 0.52.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_aarch64_msvc 0.53.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_i686_gnu 0.42.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_i686_gnu 0.52.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_i686_gnu 0.53.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_i686_gnullvm 0.52.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_i686_gnullvm 0.53.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_i686_msvc 0.42.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_i686_msvc 0.52.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_i686_msvc 0.53.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_x86_64_gnu 0.42.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_x86_64_gnu 0.52.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_x86_64_gnu 0.53.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_x86_64_gnullvm 0.42.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_x86_64_gnullvm 0.52.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_x86_64_gnullvm 0.53.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_x86_64_msvc 0.42.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_x86_64_msvc 0.52.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows_x86_64_msvc 0.53.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-collections 0.3.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-core 0.62.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-future 0.3.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-implement 0.60.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-interface 0.59.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-link 0.2.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-numerics 0.3.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-registry 0.6.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-result 0.4.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-strings 0.5.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-sys 0.45.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-sys 0.52.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-sys 0.59.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-sys 0.60.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-sys 0.61.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-targets 0.42.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-targets 0.52.6:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-targets 0.53.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-threading 0.2.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **windows-version 0.1.7:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) Microsoft Corporation.
- **winreg 0.10.1:** Copyright (c) 2015 Igor Shaula
- **wit-bindgen 0.57.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works
- **wl-clipboard-rs 0.9.5:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019 Ivan Molodetskikh
- **writeable 0.6.4:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **wry 0.57.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2020-2023 Ngo Iok Ui & Tauri Programme within The Commons Conservancy
- **x11rb 0.13.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2019 x11rb Contributers
- **x11rb-protocol 0.13.2:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2019 x11rb Contributers
- **xattr 1.6.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2015 Steven Allen
- **yoke 0.8.4:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **yoke-derive 0.8.4:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **zbus 4.4.0:** Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zbus 5.19.0:** Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zbus_macros 4.4.0:** Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zbus_macros 5.19.0:** Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zbus_names 4.3.5:** Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zcheapstr 1.1.0:** Copyright (c) 2026 Zeeshan Ali Khan & zcheapstr contributors
- **zerocopy 0.8.63:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2023 The Fuchsia Authors; Copyright 2019 The Fuchsia Authors.
- **zerocopy-derive 0.8.63:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2023 The Fuchsia Authors; Copyright 2019 The Fuchsia Authors.
- **zerofrom 0.1.8:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **zerofrom-derive 0.1.8:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **zeroize 1.9.1:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2018-2026 The RustCrypto Project Developers
- **zeroize_derive 1.5.0:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) 2019-2026 The RustCrypto Project Developers
- **zerotrie 0.2.5:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **zerovec 0.11.9:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **zerovec-derive 0.11.7:** COPYRIGHT AND PERMISSION NOTICE; Copyright © 2020-2024 Unicode, Inc.
- **zip 9.4.0:** Copyright (c) 2014 Mathijs van de Nes
- **zlib-rs 0.6.8:** (C) 2024 Trifecta Tech Foundation
- **zopfli 0.8.4:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright 2011 Google Inc.
- **zune-core 0.5.3:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) zune-image developers; (C) zune-image developers
- **zune-jpeg 0.5.15:** copyright notice that is included in or attached to the work; copyright license to reproduce, prepare Derivative Works of,; (c) You must retain, in the Source form of any Derivative Works; Copyright (c) zune-image developers; (C) zune-image developers
- **zvariant 4.2.0:** Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zvariant 5.15.1:** Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zvariant_derive 4.2.0:** Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zvariant_derive 5.15.1:** Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors

## Archivos NOTICE

Contenido de los archivos NOTICE que exige la licencia Apache 2.0.

### es-toolkit 1.53.0

```text
es-toolkit

Parts of the test suite and compatibility layer in es-toolkit/compat are
derived from Lodash (https://github.com/lodash/lodash).

Lodash copyright notice and MIT permission notice:

Copyright OpenJS Foundation and other contributors <https://openjsf.org/>

Based on Underscore.js, copyright Jeremy Ashkenas,
DocumentCloud and Investigative Reporters & Editors <http://underscorejs.org/>

This software consists of voluntary contributions made by many
individuals. For exact contribution history, see the revision history
available at https://github.com/lodash/lodash

The following license applies to all parts of this software except as
documented below:

====

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Textos de licencia

### (MIT OR Apache-2.0) AND Unicode-3.0

Texto tomado de unicode-ident 1.0.27 (LICENSE-APACHE).

```text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS
```

### (MPL-2.0 OR Apache-2.0)

Texto tomado de dompurify 3.4.17 (LICENSE).

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### 0BSD OR MIT OR Apache-2.0

Texto tomado de adler2 2.0.1 (LICENSE-0BSD).

```text
Copyright (C) Jonas Schievink <jonasschievink@gmail.com>

Permission to use, copy, modify, and/or distribute this software for
any purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN
AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT
OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### Apache-2.0

Texto tomado de @chevrotain/cst-dts-gen 13.2.0 (LICENSE.txt).

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### Apache-2.0 / MIT

Texto tomado de fnv 1.0.7 (LICENSE-APACHE).

```text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### Apache-2.0 AND ISC

Texto tomado de ring 0.17.14 (LICENSE).

```text
*ring* uses an "ISC" license, like BoringSSL used to use, for new code
files. See LICENSE-other-bits for the text of that license.

See LICENSE-BoringSSL for code that was sourced from BoringSSL under the
Apache 2.0 license. Some code that was sourced from BoringSSL under the ISC
license. In each case, the license info is at the top of the file.

See src/polyfill/once_cell/LICENSE-APACHE and src/polyfill/once_cell/LICENSE-MIT
for the license to code that was sourced from the once_cell project.
```

### Apache-2.0 AND MIT

Texto tomado de dpi 0.1.2 (LICENSE).

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright {yyyy} {name of copyright owner}

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### Apache-2.0 OR ISC OR MIT

Texto tomado de hyper-rustls 0.27.10 (LICENSE-APACHE).

```text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### Apache-2.0 OR MIT

Texto tomado de @tauri-apps/api 2.12.4 (LICENSE-APACHE-2.0).

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS
```

### Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT

Texto tomado de linux-raw-sys 0.12.1 (LICENSE-APACHE).

```text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### Apache-2.0/MIT

Texto tomado de dbus 0.9.12 (LICENSE-APACHE).

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2014-2018 David Henningsson <diwic@ubuntu.com> and other contributors

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### BSD-2-Clause OR Apache-2.0

Texto tomado de serial2 0.2.38 (LICENSE-APACHE).

```text
Copyright 2021, Maarten de Vries <maarten@de-vri.es>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### BSD-2-Clause OR Apache-2.0 OR MIT

Texto tomado de zerocopy 0.8.63 (LICENSE-APACHE).

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2023 The Fuchsia Authors

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### BSD-2-Clause OR MIT OR Apache-2.0

Texto tomado de mach2 0.4.3 (LICENSE-APACHE).

```text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS
```

### BSD-3-Clause

Texto tomado de d3-array 2.12.1 (LICENSE).

```text
Copyright 2010-2020 Mike Bostock
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the author nor the names of contributors may be used to
  endorse or promote products derived from this software without specific prior
  written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### BSD-3-Clause AND MIT

Texto tomado de brotli 9.1.0 (LICENSE.BSD-3-Clause).

```text
Copyright (c) 2016 Dropbox, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### BSD-3-Clause OR Apache-2.0

Texto tomado de moxcms 0.8.1 (LICENSE-APACHE.md).

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2024 Radzivon Bartoshyk

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### BSD-3-Clause OR MIT OR Apache-2.0

Texto tomado de num_enum 0.7.6 (LICENSE-APACHE).

```text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS
```

### BSD-3-Clause/MIT

Texto tomado de brotli-decompressor 6.2.0 (LICENSE).

```text
Copyright (c) 2016 Dropbox, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### BSL-1.0

Texto tomado de error-code 3.4.0 (LICENSE).

```text
Boost Software License - Version 1.0 - August 17th, 2003

Permission is hereby granted, free of charge, to any person or organization
obtaining a copy of the software and accompanying documentation covered by
this license (the "Software") to use, reproduce, display, distribute,
execute, and transmit the Software, and to prepare derivative works of the
Software, and to permit third-parties to whom the Software is furnished to
do so, all subject to the following:

The copyright notices in the Software and this entire statement, including
the above license grant, this restriction and the following disclaimer,
must be included in all copies of the Software, in whole or in part, and
all derivative works of the Software, unless such copies or derivative
works are solely in the form of machine-executable object code generated by
a source language processor.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. IN NO EVENT
SHALL THE COPYRIGHT HOLDERS OR ANYONE DISTRIBUTING THE SOFTWARE BE LIABLE
FOR ANY DAMAGES OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
```

### CC0-1.0 OR MIT-0 OR Apache-2.0

Texto tomado de dunce 1.0.5 (LICENSE).

```text
Creative Commons Legal Code

CC0 1.0 Universal

    CREATIVE COMMONS CORPORATION IS NOT A LAW FIRM AND DOES NOT PROVIDE
    LEGAL SERVICES. DISTRIBUTION OF THIS DOCUMENT DOES NOT CREATE AN
    ATTORNEY-CLIENT RELATIONSHIP. CREATIVE COMMONS PROVIDES THIS
    INFORMATION ON AN "AS-IS" BASIS. CREATIVE COMMONS MAKES NO WARRANTIES
    REGARDING THE USE OF THIS DOCUMENT OR THE INFORMATION OR WORKS
    PROVIDED HEREUNDER, AND DISCLAIMS LIABILITY FOR DAMAGES RESULTING FROM
    THE USE OF THIS DOCUMENT OR THE INFORMATION OR WORKS PROVIDED
    HEREUNDER.

Statement of Purpose

The laws of most jurisdictions throughout the world automatically confer
exclusive Copyright and Related Rights (defined below) upon the creator
and subsequent owner(s) (each and all, an "owner") of an original work of
authorship and/or a database (each, a "Work").

Certain owners wish to permanently relinquish those rights to a Work for
the purpose of contributing to a commons of creative, cultural and
scientific works ("Commons") that the public can reliably and without fear
of later claims of infringement build upon, modify, incorporate in other
works, reuse and redistribute as freely as possible in any form whatsoever
and for any purposes, including without limitation commercial purposes.
These owners may contribute to the Commons to promote the ideal of a free
culture and the further production of creative, cultural and scientific
works, or to gain reputation or greater distribution for their Work in
part through the use and efforts of others.

For these and/or other purposes and motivations, and without any
expectation of additional consideration or compensation, the person
associating CC0 with a Work (the "Affirmer"), to the extent that he or she
is an owner of Copyright and Related Rights in the Work, voluntarily
elects to apply CC0 to the Work and publicly distribute the Work under its
terms, with knowledge of his or her Copyright and Related Rights in the
Work and the meaning and intended legal effect of CC0 on those rights.

1. Copyright and Related Rights. A Work made available under CC0 may be
protected by copyright and related or neighboring rights ("Copyright and
Related Rights"). Copyright and Related Rights include, but are not
limited to, the following:

  i. the right to reproduce, adapt, distribute, perform, display,
     communicate, and translate a Work;
 ii. moral rights retained by the original author(s) and/or performer(s);
iii. publicity and privacy rights pertaining to a person's image or
     likeness depicted in a Work;
 iv. rights protecting against unfair competition in regards to a Work,
     subject to the limitations in paragraph 4(a), below;
  v. rights protecting the extraction, dissemination, use and reuse of data
     in a Work;
 vi. database rights (such as those arising under Directive 96/9/EC of the
     European Parliament and of the Council of 11 March 1996 on the legal
     protection of databases, and under any national implementation
     thereof, including any amended or successor version of such
     directive); and
vii. other similar, equivalent or corresponding rights throughout the
     world based on applicable law or treaty, and any national
     implementations thereof.

2. Waiver. To the greatest extent permitted by, but not in contravention
of, applicable law, Affirmer hereby overtly, fully, permanently,
irrevocably and unconditionally waives, abandons, and surrenders all of
Affirmer's Copyright and Related Rights and associated claims and causes
of action, whether now known or unknown (including existing as well as
future claims and causes of action), in the Work (i) in all territories
worldwide, (ii) for the maximum duration provided by applicable law or
treaty (including future time extensions), (iii) in any current or future
medium and for any number of copies, and (iv) for any purpose whatsoever,
including without limitation commercial, advertising or promotional
purposes (the "Waiver"). Affirmer makes the Waiver for the benefit of each
member of the public at large and to the detriment of Affirmer's heirs and
successors, fully intending that such Waiver shall not be subject to
revocation, rescission, cancellation, termination, or any other legal or
equitable action to disrupt the quiet enjoyment of the Work by the public
as contemplated by Affirmer's express Statement of Purpose.

3. Public License Fallback. Should any part of the Waiver for any reason
be judged legally invalid or ineffective under applicable law, then the
Waiver shall be preserved to the maximum extent permitted taking into
account Affirmer's express Statement of Purpose. In addition, to the
extent the Waiver is so judged Affirmer hereby grants to each affected
person a royalty-free, non transferable, non sublicensable, non exclusive,
irrevocable and unconditional license to exercise Affirmer's Copyright and
Related Rights in the Work (i) in all territories worldwide, (ii) for the
maximum duration provided by applicable law or treaty (including future
time extensions), (iii) in any current or future medium and for any number
of copies, and (iv) for any purpose whatsoever, including without
limitation commercial, advertising or promotional purposes (the
"License"). The License shall be deemed effective as of the date CC0 was
applied by Affirmer to the Work. Should any part of the License for any
reason be judged legally invalid or ineffective under applicable law, such
partial invalidity or ineffectiveness shall not invalidate the remainder
of the License, and in such case Affirmer hereby affirms that he or she
will not (i) exercise any of his or her remaining Copyright and Related
Rights in the Work or (ii) assert any associated claims and causes of
action with respect to the Work, in either case contrary to Affirmer's
express Statement of Purpose.

4. Limitations and Disclaimers.

 a. No trademark or patent rights held by Affirmer are waived, abandoned,
    surrendered, licensed or otherwise affected by this document.
 b. Affirmer offers the Work as-is and makes no representations or
    warranties of any kind concerning the Work, express, implied,
    statutory or otherwise, including without limitation warranties of
    title, merchantability, fitness for a particular purpose, non
    infringement, or the absence of latent or other defects, accuracy, or
    the present or absence of errors, whether or not discoverable, all to
    the greatest extent permissible under applicable law.
 c. Affirmer disclaims responsibility for clearing rights of other persons
    that may apply to the Work or any use thereof, including without
    limitation any person's Copyright and Related Rights in the Work.
    Further, Affirmer disclaims responsibility for obtaining any necessary
    consents, permissions or other rights required for any use of the
    Work.
 d. Affirmer understands and acknowledges that Creative Commons is not a
    party to this document and has no duty or obligation with respect to
    this CC0 or use of the Work.
```

### CDLA-Permissive-2.0

Texto tomado de webpki-root-certs 1.0.11 (LICENSE).

```text
# Community Data License Agreement - Permissive - Version 2.0

This is the Community Data License Agreement - Permissive, Version
2.0 (the "agreement"). Data Provider(s) and Data Recipient(s) agree
as follows:

## 1. Provision of the Data

1.1. A Data Recipient may use, modify, and share the Data made
available by Data Provider(s) under this agreement if that Data
Recipient follows the terms of this agreement.

1.2. This agreement does not impose any restriction on a Data
Recipient's use, modification, or sharing of any portions of the
Data that are in the public domain or that may be used, modified,
or shared under any other legal exception or limitation.

## 2. Conditions for Sharing Data

2.1. A Data Recipient may share Data, with or without modifications, so
long as the Data Recipient makes available the text of this agreement
with the shared Data.

## 3. No Restrictions on Results

3.1. This agreement does not impose any restriction or obligations
with respect to the use, modification, or sharing of Results.

## 4. No Warranty; Limitation of Liability

4.1. All Data Recipients receive the Data subject to the following
terms:

THE DATA IS PROVIDED ON AN "AS IS" BASIS, WITHOUT REPRESENTATIONS,
WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED
INCLUDING, WITHOUT LIMITATION, ANY WARRANTIES OR CONDITIONS OF TITLE,
NON-INFRINGEMENT, MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.

NO DATA PROVIDER SHALL HAVE ANY LIABILITY FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING
WITHOUT LIMITATION LOST PROFITS), HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE DATA OR RESULTS,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

## 5. Definitions

5.1. "Data" means the material received by a Data Recipient under
this agreement.

5.2. "Data Provider" means any person who is the source of Data
provided under this agreement and in reliance on a Data Recipient's
agreement to its terms.

5.3. "Data Recipient" means any person who receives Data directly
or indirectly from a Data Provider and agrees to the terms of this
agreement.

5.4. "Results" means any outcome obtained by computational analysis
of Data, including for example machine learning models and models'
insights.
```

### EPL-2.0 OR GPL-3.0-or-later

Texto tomado de elkjs 0.12.1 (LICENSE.md).

```text
# Eclipse Public License - v 2.0

THE ACCOMPANYING PROGRAM IS PROVIDED UNDER THE TERMS OF THIS ECLIPSE
PUBLIC LICENSE (“AGREEMENT”). ANY USE, REPRODUCTION OR DISTRIBUTION OF
THE PROGRAM CONSTITUTES RECIPIENT'S ACCEPTANCE OF THIS AGREEMENT.

## 1. DEFINITIONS

“Contribution” means:

-   a\) in the case of the initial Contributor, the initial content
    Distributed under this Agreement, and
-   b\) in the case of each subsequent Contributor:
    -   i\) changes to the Program, and
    -   ii\) additions to the Program;

    where such changes and/or additions to the Program originate from
    and are Distributed by that particular Contributor. A Contribution
    “originates” from a Contributor if it was added to the Program by
    such Contributor itself or anyone acting on such Contributor's
    behalf. Contributions do not include changes or additions to the
    Program that are not Modified Works.

“Contributor” means any person or entity that Distributes the Program.

“Licensed Patents” mean patent claims licensable by a Contributor which
are necessarily infringed by the use or sale of its Contribution alone
or when combined with the Program.

“Program” means the Contributions Distributed in accordance with this
Agreement.

“Recipient” means anyone who receives the Program under this Agreement
or any Secondary License (as applicable), including Contributors.

“Derivative Works” shall mean any work, whether in Source Code or other
form, that is based on (or derived from) the Program and for which the
editorial revisions, annotations, elaborations, or other modifications
represent, as a whole, an original work of authorship.

“Modified Works” shall mean any work in Source Code or other form that
results from an addition to, deletion from, or modification of the
contents of the Program, including, for purposes of clarity any new file
in Source Code form that contains any contents of the Program. Modified
Works shall not include works that contain only declarations,
interfaces, types, classes, structures, or files of the Program solely
in each case in order to link to, bind by name, or subclass the Program
or Modified Works thereof.

“Distribute” means the acts of a) distributing or b) making available in
any manner that enables the transfer of a copy.

“Source Code” means the form of a Program preferred for making
modifications, including but not limited to software source code,
documentation source, and configuration files.

“Secondary License” means either the GNU General Public License, Version
2.0, or any later versions of that license, including any exceptions or
additional permissions as identified by the initial Contributor.

## 2. GRANT OF RIGHTS

-   a\) Subject to the terms of this Agreement, each Contributor hereby
    grants Recipient a non-exclusive, worldwide, royalty-free copyright
    license to reproduce, prepare Derivative Works of, publicly display,
    publicly perform, Distribute and sublicense the Contribution of such
    Contributor, if any, and such Derivative Works.
-   b\) Subject to the terms of this Agreement, each Contributor hereby
    grants Recipient a non-exclusive, worldwide, royalty-free patent license
    under Licensed Patents to make, use, sell, offer to sell, import and
    otherwise transfer the Contribution of such Contributor, if any, in
    Source Code or other form. This patent license shall apply to the
    combination of the Contribution and the Program if, at the time the
    Contribution is added by the Contributor, such addition of the
    Contribution causes such combination to be covered by the
    Licensed Patents. The patent license shall not apply to any other
    combinations which include the Contribution. No hardware per se is
    licensed hereunder.
-   c\) Recipient understands that although each Contributor grants the
    licenses to its Contributions set forth herein, no assurances are
    provided by any Contributor that the Program does not infringe the
    patent or other intellectual property rights of any other entity. Each
    Contributor disclaims any liability to Recipient for claims brought by
    any other entity based on infringement of intellectual property rights
    or otherwise. As a condition to exercising the rights and licenses
    granted hereunder, each Recipient hereby assumes sole responsibility to
    secure any other intellectual property rights needed, if any. For
    example, if a third party patent license is required to allow Recipient
    to Distribute the Program, it is Recipient's responsibility to acquire
    that license before distributing the Program.
-   d\) Each Contributor represents that to its knowledge it has sufficient
    copyright rights in its Contribution, if any, to grant the copyright
    license set forth in this Agreement.
-   e\) Notwithstanding the terms of any Secondary License, no Contributor
    makes additional grants to any Recipient (other than those set forth in
    this Agreement) as a result of such Recipient's receipt of the Program
    under the terms of a Secondary License (if permitted under the terms of
    Section 3).

## 3. REQUIREMENTS

3.1 If a Contributor Distributes the Program in any form, then:

-   a\) the Program must also be made available as Source Code, in accordance
    with section 3.2, and the Contributor must accompany the Program with a
    statement that the Source Code for the Program is available under this
    Agreement, and informs Recipients how to obtain it in a reasonable
    manner on or through a medium customarily used for software exchange;
    and
-   b\) the Contributor may Distribute the Program under a license different
    than this Agreement, provided that such license:
    -   i\) effectively disclaims on behalf of all other Contributors all
        warranties and conditions, express and implied, including warranties or
        conditions of title and non-infringement, and implied warranties or
        conditions of merchantability and fitness for a particular purpose;
    -   ii\) effectively excludes on behalf of all other Contributors all
        liability for damages, including direct, indirect, special, incidental
        and consequential damages, such as lost profits;
    -   iii\) does not attempt to limit or alter the recipients' rights in the
        Source Code under section 3.2; and
    -   iv\) requires any subsequent distribution of the Program by any party to
        be under a license that satisfies the requirements of this section 3.

3.2 When the Program is Distributed as Source Code:

-   a\) it must be made available under this Agreement, or if the Program (i)
    is combined with other material in a separate file or files made
    available under a Secondary License, and (ii) the initial Contributor
    attached to the Source Code the notice described in Exhibit A of this
    Agreement, then the Program may be made available under the terms of
    such Secondary Licenses, and
-   b\) a copy of this Agreement must be included with each copy of
    the Program.

3.3 Contributors may not remove or alter any copyright, patent,
trademark, attribution notices, disclaimers of warranty, or limitations
of liability (‘notices’) contained within the Program from any copy of
the Program which they Distribute, provided that Contributors may add
their own appropriate notices.

## 4. COMMERCIAL DISTRIBUTION

Commercial distributors of software may accept certain responsibilities
with respect to end users, business partners and the like. While this
license is intended to facilitate the commercial use of the Program, the
Contributor who includes the Program in a commercial product offering
should do so in a manner which does not create potential liability for
other Contributors. Therefore, if a Contributor includes the Program in
a commercial product offering, such Contributor (“Commercial
Contributor”) hereby agrees to defend and indemnify every other
Contributor (“Indemnified Contributor”) against any losses, damages and
costs (collectively “Losses”) arising from claims, lawsuits and other
legal actions brought by a third party against the Indemnified
Contributor to the extent caused by the acts or omissions of such
Commercial Contributor in connection with its distribution of the
Program in a commercial product offering. The obligations in this
section do not apply to any claims or Losses relating to any actual or
alleged intellectual property infringement. In order to qualify, an
Indemnified Contributor must: a) promptly notify the Commercial
Contributor in writing of such claim, and b) allow the Commercial
Contributor to control, and cooperate with the Commercial Contributor
in, the defense and any related settlement negotiations. The Indemnified
Contributor may participate in any such claim at its own expense.

For example, a Contributor might include the Program in a commercial
product offering, Product X. That Contributor is then a Commercial
Contributor. If that Commercial Contributor then makes performance
claims, or offers warranties related to Product X, those performance
claims and warranties are such Commercial Contributor's responsibility
alone. Under this section, the Commercial Contributor would have to
defend claims against the other Contributors related to those
performance claims and warranties, and if a court requires any other
Contributor to pay any damages as a result, the Commercial Contributor
must pay those damages.

## 5. NO WARRANTY {#warranty}

EXCEPT AS EXPRESSLY SET FORTH IN THIS AGREEMENT, AND TO THE EXTENT
PERMITTED BY APPLICABLE LAW, THE PROGRAM IS PROVIDED ON AN “AS IS”
BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR
IMPLIED INCLUDING, WITHOUT LIMITATION, ANY WARRANTIES OR CONDITIONS OF
TITLE, NON-INFRINGEMENT, MERCHANTABILITY OR FITNESS FOR A PARTICULAR
PURPOSE. Each Recipient is solely responsible for determining the
appropriateness of using and distributing the Program and assumes all
risks associated with its exercise of rights under this Agreement,
including but not limited to the risks and costs of program errors,
compliance with applicable laws, damage to or loss of data, programs or
equipment, and unavailability or interruption of operations.

## 6. DISCLAIMER OF LIABILITY {#disclaimer}

EXCEPT AS EXPRESSLY SET FORTH IN THIS AGREEMENT, AND TO THE EXTENT
PERMITTED BY APPLICABLE LAW, NEITHER RECIPIENT NOR ANY CONTRIBUTORS
SHALL HAVE ANY LIABILITY FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING WITHOUT LIMITATION LOST
PROFITS), HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OR DISTRIBUTION OF THE PROGRAM OR THE
EXERCISE OF ANY RIGHTS GRANTED HEREUNDER, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGES.

## 7. GENERAL

If any provision of this Agreement is invalid or unenforceable under
applicable law, it shall not affect the validity or enforceability of
the remainder of the terms of this Agreement, and without further action
by the parties hereto, such provision shall be reformed to the minimum
extent necessary to make such provision valid and enforceable.

If Recipient institutes patent litigation against any entity (including
a cross-claim or counterclaim in a lawsuit) alleging that the Program
itself (excluding combinations of the Program with other software or
hardware) infringes such Recipient's patent(s), then such Recipient's
rights granted under Section 2(b) shall terminate as of the date such
litigation is filed.

All Recipient's rights under this Agreement shall terminate if it fails
to comply with any of the material terms or conditions of this Agreement
and does not cure such failure in a reasonable period of time after
becoming aware of such noncompliance. If all Recipient's rights under
this Agreement terminate, Recipient agrees to cease use and distribution
of the Program as soon as reasonably practicable. However, Recipient's
obligations under this Agreement and any licenses granted by Recipient
relating to the Program shall continue and survive.

Everyone is permitted to copy and distribute copies of this Agreement,
but in order to avoid inconsistency the Agreement is copyrighted and may
only be modified in the following manner. The Agreement Steward reserves
the right to publish new versions (including revisions) of this
Agreement from time to time. No one other than the Agreement Steward has
the right to modify this Agreement. The Eclipse Foundation is the
initial Agreement Steward. The Eclipse Foundation may assign the
responsibility to serve as the Agreement Steward to a suitable separate
entity. Each new version of the Agreement will be given a distinguishing
version number. The Program (including Contributions) may always be
Distributed subject to the version of the Agreement under which it was
received. In addition, after a new version of the Agreement is
published, Contributor may elect to Distribute the Program (including
its Contributions) under the new version.

Except as expressly stated in Sections 2(a) and 2(b) above, Recipient
receives no rights or licenses to the intellectual property of any
Contributor under this Agreement, whether expressly, by implication,
estoppel or otherwise. All rights in the Program not expressly granted
under this Agreement are reserved. Nothing in this Agreement is intended
to be enforceable by any entity that is not a Contributor or Recipient.
No third-party beneficiary rights are created under this Agreement.

## Exhibit A – Form of Secondary Licenses Notice {#exhibit-a}

“This Source Code may also be made available under the following
Secondary Licenses when the conditions for such availability set forth
in the Eclipse Public License, v. 2.0 are satisfied: GNU General Public License v3.0 or later”

> Simply including a copy of this Agreement, including this Exhibit A is
> not sufficient to license the Source Code under Secondary Licenses.
>
> If it is not possible or desirable to put the notice in a particular
> file, then You may include the notice in a location (such as a LICENSE
> file in a relevant directory) where a recipient would be likely to
> look for such a notice.
>
> You may add additional accurate notices of copyright ownership.
```

### ISC

Texto tomado de d3 7.9.0 (LICENSE).

```text
Copyright 2010-2023 Mike Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

### MIT

Texto tomado de @antfu/install-pkg 2.1.0 (LICENSE).

```text
MIT License

Copyright (c) 2021 Anthony Fu <https://github.com/antfu>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### MIT (según su archivo de licencia)

Texto tomado de khroma 2.1.0 (license).

```text
The MIT License (MIT)

Copyright (c) 2019-present Fabio Spampinato, Andrew Maney

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
```

### MIT / Apache-2.0

Texto tomado de io-kit-sys 0.4.1 (LICENSE-APACHE).

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

    
   Copyright (c) 2017-2018 Junji Takakura

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### MIT OR Apache-2.0

Texto tomado de @tauri-apps/plugin-clipboard-manager 2.5.0 (LICENSE.spdx).

```text
SPDXVersion: SPDX-2.1
DataLicense: CC0-1.0
PackageName: tauri
DataFormat: SPDXRef-1
PackageSupplier: Organization: The Tauri Programme in the Commons Conservancy
PackageHomePage: https://tauri.app
PackageLicenseDeclared: Apache-2.0
PackageLicenseDeclared: MIT
PackageCopyrightText: 2019-2022, The Tauri Programme in the Commons Conservancy
PackageSummary: <text>Tauri is a rust project that enables developers to make secure
and small desktop applications using a web frontend.
                </text>
PackageComment: <text>The package includes the following libraries; see
Relationship information.
                </text>
Created: 2019-05-20T09:00:00Z
PackageDownloadLocation: git://github.com/tauri-apps/tauri
PackageDownloadLocation: git+https://github.com/tauri-apps/tauri.git
PackageDownloadLocation: git+ssh://github.com/tauri-apps/tauri.git
Creator: Person: Daniel Thompson-Yvetot
```

### MIT OR Apache-2.0 OR Zlib

Texto tomado de raw-window-handle 0.6.2 (LICENSE-APACHE.md).

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS
```

### MIT OR BSD-3-Clause

Texto tomado de if-addrs 0.15.0 (LICENSE-BSD).

```text
Copyright 2018 MaidSafe.net limited.
Copyright 2020 messense

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### MIT OR GPL-3.0-only

Texto tomado de unescaper 0.1.10 (LICENSE-GPL3).

```text
GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <http://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

                            Preamble

  The GNU General Public License is a free, copyleft license for
software and other kinds of works.

  The licenses for most software and other practical works are designed
to take away your freedom to share and change the works.  By contrast,
the GNU General Public License is intended to guarantee your freedom to
share and change all versions of a program--to make sure it remains free
software for all its users.  We, the Free Software Foundation, use the
GNU General Public License for most of our software; it applies also to
any other work released this way by its authors.  You can apply it to
your programs, too.

  When we speak of free software, we are referring to freedom, not
price.  Our General Public Licenses are designed to make sure that you
have the freedom to distribute copies of free software (and charge for
them if you wish), that you receive source code or can get it if you
want it, that you can change the software or use pieces of it in new
free programs, and that you know you can do these things.

  To protect your rights, we need to prevent others from denying you
these rights or asking you to surrender the rights.  Therefore, you have
certain responsibilities if you distribute copies of the software, or if
you modify it: responsibilities to respect the freedom of others.

  For example, if you distribute copies of such a program, whether
gratis or for a fee, you must pass on to the recipients the same
freedoms that you received.  You must make sure that they, too, receive
or can get the source code.  And you must show them these terms so they
know their rights.

  Developers that use the GNU GPL protect your rights with two steps:
(1) assert copyright on the software, and (2) offer you this License
giving you legal permission to copy, distribute and/or modify it.

  For the developers' and authors' protection, the GPL clearly explains
that there is no warranty for this free software.  For both users' and
authors' sake, the GPL requires that modified versions be marked as
changed, so that their problems will not be attributed erroneously to
authors of previous versions.

  Some devices are designed to deny users access to install or run
modified versions of the software inside them, although the manufacturer
can do so.  This is fundamentally incompatible with the aim of
protecting users' freedom to change the software.  The systematic
pattern of such abuse occurs in the area of products for individuals to
use, which is precisely where it is most unacceptable.  Therefore, we
have designed this version of the GPL to prohibit the practice for those
products.  If such problems arise substantially in other domains, we
stand ready to extend this provision to those domains in future versions
of the GPL, as needed to protect the freedom of users.

  Finally, every program is threatened constantly by software patents.
States should not allow patents to restrict development and use of
software on general-purpose computers, but in those that do, we wish to
avoid the special danger that patents applied to a free program could
make it effectively proprietary.  To prevent this, the GPL assures that
patents cannot be used to render the program non-free.

  The precise terms and conditions for copying, distribution and
modification follow.

                       TERMS AND CONDITIONS

  0. Definitions.

  "This License" refers to version 3 of the GNU General Public License.

  "Copyright" also means copyright-like laws that apply to other kinds of
works, such as semiconductor masks.

  "The Program" refers to any copyrightable work licensed under this
License.  Each licensee is addressed as "you".  "Licensees" and
"recipients" may be individuals or organizations.

  To "modify" a work means to copy from or adapt all or part of the work
in a fashion requiring copyright permission, other than the making of an
exact copy.  The resulting work is called a "modified version" of the
earlier work or a work "based on" the earlier work.

  A "covered work" means either the unmodified Program or a work based
on the Program.

  To "propagate" a work means to do anything with it that, without
permission, would make you directly or secondarily liable for
infringement under applicable copyright law, except executing it on a
computer or modifying a private copy.  Propagation includes copying,
distribution (with or without modification), making available to the
public, and in some countries other activities as well.

  To "convey" a work means any kind of propagation that enables other
parties to make or receive copies.  Mere interaction with a user through
a computer network, with no transfer of a copy, is not conveying.

  An interactive user interface displays "Appropriate Legal Notices"
to the extent that it includes a convenient and prominently visible
feature that (1) displays an appropriate copyright notice, and (2)
tells the user that there is no warranty for the work (except to the
extent that warranties are provided), that licensees may convey the
work under this License, and how to view a copy of this License.  If
the interface presents a list of user commands or options, such as a
menu, a prominent item in the list meets this criterion.

  1. Source Code.

  The "source code" for a work means the preferred form of the work
for making modifications to it.  "Object code" means any non-source
form of a work.

  A "Standard Interface" means an interface that either is an official
standard defined by a recognized standards body, or, in the case of
interfaces specified for a particular programming language, one that
is widely used among developers working in that language.

  The "System Libraries" of an executable work include anything, other
than the work as a whole, that (a) is included in the normal form of
packaging a Major Component, but which is not part of that Major
Component, and (b) serves only to enable use of the work with that
Major Component, or to implement a Standard Interface for which an
implementation is available to the public in source code form.  A
"Major Component", in this context, means a major essential component
(kernel, window system, and so on) of the specific operating system
(if any) on which the executable work runs, or a compiler used to
produce the work, or an object code interpreter used to run it.

  The "Corresponding Source" for a work in object code form means all
the source code needed to generate, install, and (for an executable
work) run the object code and to modify the work, including scripts to
control those activities.  However, it does not include the work's
System Libraries, or general-purpose tools or generally available free
programs which are used unmodified in performing those activities but
which are not part of the work.  For example, Corresponding Source
includes interface definition files associated with source files for
the work, and the source code for shared libraries and dynamically
linked subprograms that the work is specifically designed to require,
such as by intimate data communication or control flow between those
subprograms and other parts of the work.

  The Corresponding Source need not include anything that users
can regenerate automatically from other parts of the Corresponding
Source.

  The Corresponding Source for a work in source code form is that
same work.

  2. Basic Permissions.

  All rights granted under this License are granted for the term of
copyright on the Program, and are irrevocable provided the stated
conditions are met.  This License explicitly affirms your unlimited
permission to run the unmodified Program.  The output from running a
covered work is covered by this License only if the output, given its
content, constitutes a covered work.  This License acknowledges your
rights of fair use or other equivalent, as provided by copyright law.

  You may make, run and propagate covered works that you do not
convey, without conditions so long as your license otherwise remains
in force.  You may convey covered works to others for the sole purpose
of having them make modifications exclusively for you, or provide you
with facilities for running those works, provided that you comply with
the terms of this License in conveying all material for which you do
not control copyright.  Those thus making or running the covered works
for you must do so exclusively on your behalf, under your direction
and control, on terms that prohibit them from making any copies of
your copyrighted material outside their relationship with you.

  Conveying under any other circumstances is permitted solely under
the conditions stated below.  Sublicensing is not allowed; section 10
makes it unnecessary.

  3. Protecting Users' Legal Rights From Anti-Circumvention Law.

  No covered work shall be deemed part of an effective technological
measure under any applicable law fulfilling obligations under article
11 of the WIPO copyright treaty adopted on 20 December 1996, or
similar laws prohibiting or restricting circumvention of such
measures.

  When you convey a covered work, you waive any legal power to forbid
circumvention of technological measures to the extent such circumvention
is effected by exercising rights under this License with respect to
the covered work, and you disclaim any intention to limit operation or
modification of the work as a means of enforcing, against the work's
users, your or third parties' legal rights to forbid circumvention of
technological measures.

  4. Conveying Verbatim Copies.

  You may convey verbatim copies of the Program's source code as you
receive it, in any medium, provided that you conspicuously and
appropriately publish on each copy an appropriate copyright notice;
keep intact all notices stating that this License and any
non-permissive terms added in accord with section 7 apply to the code;
keep intact all notices of the absence of any warranty; and give all
recipients a copy of this License along with the Program.

  You may charge any price or no price for each copy that you convey,
and you may offer support or warranty protection for a fee.

  5. Conveying Modified Source Versions.

  You may convey a work based on the Program, or the modifications to
produce it from the Program, in the form of source code under the
terms of section 4, provided that you also meet all of these conditions:

    a) The work must carry prominent notices stating that you modified
    it, and giving a relevant date.

    b) The work must carry prominent notices stating that it is
    released under this License and any conditions added under section
    7.  This requirement modifies the requirement in section 4 to
    "keep intact all notices".

    c) You must license the entire work, as a whole, under this
    License to anyone who comes into possession of a copy.  This
    License will therefore apply, along with any applicable section 7
    additional terms, to the whole of the work, and all its parts,
    regardless of how they are packaged.  This License gives no
    permission to license the work in any other way, but it does not
    invalidate such permission if you have separately received it.

    d) If the work has interactive user interfaces, each must display
    Appropriate Legal Notices; however, if the Program has interactive
    interfaces that do not display Appropriate Legal Notices, your
    work need not make them do so.

  A compilation of a covered work with other separate and independent
works, which are not by their nature extensions of the covered work,
and which are not combined with it such as to form a larger program,
in or on a volume of a storage or distribution medium, is called an
"aggregate" if the compilation and its resulting copyright are not
used to limit the access or legal rights of the compilation's users
beyond what the individual works permit.  Inclusion of a covered work
in an aggregate does not cause this License to apply to the other
parts of the aggregate.

  6. Conveying Non-Source Forms.

  You may convey a covered work in object code form under the terms
of sections 4 and 5, provided that you also convey the
machine-readable Corresponding Source under the terms of this License,
in one of these ways:

    a) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by the
    Corresponding Source fixed on a durable physical medium
    customarily used for software interchange.

    b) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by a
    written offer, valid for at least three years and valid for as
    long as you offer spare parts or customer support for that product
    model, to give anyone who possesses the object code either (1) a
    copy of the Corresponding Source for all the software in the
    product that is covered by this License, on a durable physical
    medium customarily used for software interchange, for a price no
    more than your reasonable cost of physically performing this
    conveying of source, or (2) access to copy the
    Corresponding Source from a network server at no charge.

    c) Convey individual copies of the object code with a copy of the
    written offer to provide the Corresponding Source.  This
    alternative is allowed only occasionally and noncommercially, and
    only if you received the object code with such an offer, in accord
    with subsection 6b.

    d) Convey the object code by offering access from a designated
    place (gratis or for a charge), and offer equivalent access to the
    Corresponding Source in the same way through the same place at no
    further charge.  You need not require recipients to copy the
    Corresponding Source along with the object code.  If the place to
    copy the object code is a network server, the Corresponding Source
    may be on a different server (operated by you or a third party)
    that supports equivalent copying facilities, provided you maintain
    clear directions next to the object code saying where to find the
    Corresponding Source.  Regardless of what server hosts the
    Corresponding Source, you remain obligated to ensure that it is
    available for as long as needed to satisfy these requirements.

    e) Convey the object code using peer-to-peer transmission, provided
    you inform other peers where the object code and Corresponding
    Source of the work are being offered to the general public at no
    charge under subsection 6d.

  A separable portion of the object code, whose source code is excluded
from the Corresponding Source as a System Library, need not be
included in conveying the object code work.

  A "User Product" is either (1) a "consumer product", which means any
tangible personal property which is normally used for personal, family,
or household purposes, or (2) anything designed or sold for incorporation
into a dwelling.  In determining whether a product is a consumer product,
doubtful cases shall be resolved in favor of coverage.  For a particular
product received by a particular user, "normally used" refers to a
typical or common use of that class of product, regardless of the status
of the particular user or of the way in which the particular user
actually uses, or expects or is expected to use, the product.  A product
is a consumer product regardless of whether the product has substantial
commercial, industrial or non-consumer uses, unless such uses represent
the only significant mode of use of the product.

  "Installation Information" for a User Product means any methods,
procedures, authorization keys, or other information required to install
and execute modified versions of a covered work in that User Product from
a modified version of its Corresponding Source.  The information must
suffice to ensure that the continued functioning of the modified object
code is in no case prevented or interfered with solely because
modification has been made.

  If you convey an object code work under this section in, or with, or
specifically for use in, a User Product, and the conveying occurs as
part of a transaction in which the right of possession and use of the
User Product is transferred to the recipient in perpetuity or for a
fixed term (regardless of how the transaction is characterized), the
Corresponding Source conveyed under this section must be accompanied
by the Installation Information.  But this requirement does not apply
if neither you nor any third party retains the ability to install
modified object code on the User Product (for example, the work has
been installed in ROM).

  The requirement to provide Installation Information does not include a
requirement to continue to provide support service, warranty, or updates
for a work that has been modified or installed by the recipient, or for
the User Product in which it has been modified or installed.  Access to a
network may be denied when the modification itself materially and
adversely affects the operation of the network or violates the rules and
protocols for communication across the network.

  Corresponding Source conveyed, and Installation Information provided,
in accord with this section must be in a format that is publicly
documented (and with an implementation available to the public in
source code form), and must require no special password or key for
unpacking, reading or copying.

  7. Additional Terms.

  "Additional permissions" are terms that supplement the terms of this
License by making exceptions from one or more of its conditions.
Additional permissions that are applicable to the entire Program shall
be treated as though they were included in this License, to the extent
that they are valid under applicable law.  If additional permissions
apply only to part of the Program, that part may be used separately
under those permissions, but the entire Program remains governed by
this License without regard to the additional permissions.

  When you convey a copy of a covered work, you may at your option
remove any additional permissions from that copy, or from any part of
it.  (Additional permissions may be written to require their own
removal in certain cases when you modify the work.)  You may place
additional permissions on material, added by you to a covered work,
for which you have or can give appropriate copyright permission.

  Notwithstanding any other provision of this License, for material you
add to a covered work, you may (if authorized by the copyright holders of
that material) supplement the terms of this License with terms:

    a) Disclaiming warranty or limiting liability differently from the
    terms of sections 15 and 16 of this License; or

    b) Requiring preservation of specified reasonable legal notices or
    author attributions in that material or in the Appropriate Legal
    Notices displayed by works containing it; or

    c) Prohibiting misrepresentation of the origin of that material, or
    requiring that modified versions of such material be marked in
    reasonable ways as different from the original version; or

    d) Limiting the use for publicity purposes of names of licensors or
    authors of the material; or

    e) Declining to grant rights under trademark law for use of some
    trade names, trademarks, or service marks; or

    f) Requiring indemnification of licensors and authors of that
    material by anyone who conveys the material (or modified versions of
    it) with contractual assumptions of liability to the recipient, for
    any liability that these contractual assumptions directly impose on
    those licensors and authors.

  All other non-permissive additional terms are considered "further
restrictions" within the meaning of section 10.  If the Program as you
received it, or any part of it, contains a notice stating that it is
governed by this License along with a term that is a further
restriction, you may remove that term.  If a license document contains
a further restriction but permits relicensing or conveying under this
License, you may add to a covered work material governed by the terms
of that license document, provided that the further restriction does
not survive such relicensing or conveying.

  If you add terms to a covered work in accord with this section, you
must place, in the relevant source files, a statement of the
additional terms that apply to those files, or a notice indicating
where to find the applicable terms.

  Additional terms, permissive or non-permissive, may be stated in the
form of a separately written license, or stated as exceptions;
the above requirements apply either way.

  8. Termination.

  You may not propagate or modify a covered work except as expressly
provided under this License.  Any attempt otherwise to propagate or
modify it is void, and will automatically terminate your rights under
this License (including any patent licenses granted under the third
paragraph of section 11).

  However, if you cease all violation of this License, then your
license from a particular copyright holder is reinstated (a)
provisionally, unless and until the copyright holder explicitly and
finally terminates your license, and (b) permanently, if the copyright
holder fails to notify you of the violation by some reasonable means
prior to 60 days after the cessation.

  Moreover, your license from a particular copyright holder is
reinstated permanently if the copyright holder notifies you of the
violation by some reasonable means, this is the first time you have
received notice of violation of this License (for any work) from that
copyright holder, and you cure the violation prior to 30 days after
your receipt of the notice.

  Termination of your rights under this section does not terminate the
licenses of parties who have received copies or rights from you under
this License.  If your rights have been terminated and not permanently
reinstated, you do not qualify to receive new licenses for the same
material under section 10.

  9. Acceptance Not Required for Having Copies.

  You are not required to accept this License in order to receive or
run a copy of the Program.  Ancillary propagation of a covered work
occurring solely as a consequence of using peer-to-peer transmission
to receive a copy likewise does not require acceptance.  However,
nothing other than this License grants you permission to propagate or
modify any covered work.  These actions infringe copyright if you do
not accept this License.  Therefore, by modifying or propagating a
covered work, you indicate your acceptance of this License to do so.

  10. Automatic Licensing of Downstream Recipients.

  Each time you convey a covered work, the recipient automatically
receives a license from the original licensors, to run, modify and
propagate that work, subject to this License.  You are not responsible
for enforcing compliance by third parties with this License.

  An "entity transaction" is a transaction transferring control of an
organization, or substantially all assets of one, or subdividing an
organization, or merging organizations.  If propagation of a covered
work results from an entity transaction, each party to that
transaction who receives a copy of the work also receives whatever
licenses to the work the party's predecessor in interest had or could
give under the previous paragraph, plus a right to possession of the
Corresponding Source of the work from the predecessor in interest, if
the predecessor has it or can get it with reasonable efforts.

  You may not impose any further restrictions on the exercise of the
rights granted or affirmed under this License.  For example, you may
not impose a license fee, royalty, or other charge for exercise of
rights granted under this License, and you may not initiate litigation
(including a cross-claim or counterclaim in a lawsuit) alleging that
any patent claim is infringed by making, using, selling, offering for
sale, or importing the Program or any portion of it.

  11. Patents.

  A "contributor" is a copyright holder who authorizes use under this
License of the Program or a work on which the Program is based.  The
work thus licensed is called the contributor's "contributor version".

  A contributor's "essential patent claims" are all patent claims
owned or controlled by the contributor, whether already acquired or
hereafter acquired, that would be infringed by some manner, permitted
by this License, of making, using, or selling its contributor version,
but do not include claims that would be infringed only as a
consequence of further modification of the contributor version.  For
purposes of this definition, "control" includes the right to grant
patent sublicenses in a manner consistent with the requirements of
this License.

  Each contributor grants you a non-exclusive, worldwide, royalty-free
patent license under the contributor's essential patent claims, to
make, use, sell, offer for sale, import and otherwise run, modify and
propagate the contents of its contributor version.

  In the following three paragraphs, a "patent license" is any express
agreement or commitment, however denominated, not to enforce a patent
(such as an express permission to practice a patent or covenant not to
sue for patent infringement).  To "grant" such a patent license to a
party means to make such an agreement or commitment not to enforce a
patent against the party.

  If you convey a covered work, knowingly relying on a patent license,
and the Corresponding Source of the work is not available for anyone
to copy, free of charge and under the terms of this License, through a
publicly available network server or other readily accessible means,
then you must either (1) cause the Corresponding Source to be so
available, or (2) arrange to deprive yourself of the benefit of the
patent license for this particular work, or (3) arrange, in a manner
consistent with the requirements of this License, to extend the patent
license to downstream recipients.  "Knowingly relying" means you have
actual knowledge that, but for the patent license, your conveying the
covered work in a country, or your recipient's use of the covered work
in a country, would infringe one or more identifiable patents in that
country that you have reason to believe are valid.

  If, pursuant to or in connection with a single transaction or
arrangement, you convey, or propagate by procuring conveyance of, a
covered work, and grant a patent license to some of the parties
receiving the covered work authorizing them to use, propagate, modify
or convey a specific copy of the covered work, then the patent license
you grant is automatically extended to all recipients of the covered
work and works based on it.

  A patent license is "discriminatory" if it does not include within
the scope of its coverage, prohibits the exercise of, or is
conditioned on the non-exercise of one or more of the rights that are
specifically granted under this License.  You may not convey a covered
work if you are a party to an arrangement with a third party that is
in the business of distributing software, under which you make payment
to the third party based on the extent of your activity of conveying
the work, and under which the third party grants, to any of the
parties who would receive the covered work from you, a discriminatory
patent license (a) in connection with copies of the covered work
conveyed by you (or copies made from those copies), or (b) primarily
for and in connection with specific products or compilations that
contain the covered work, unless you entered into that arrangement,
or that patent license was granted, prior to 28 March 2007.

  Nothing in this License shall be construed as excluding or limiting
any implied license or other defenses to infringement that may
otherwise be available to you under applicable patent law.

  12. No Surrender of Others' Freedom.

  If conditions are imposed on you (whether by court order, agreement or
otherwise) that contradict the conditions of this License, they do not
excuse you from the conditions of this License.  If you cannot convey a
covered work so as to satisfy simultaneously your obligations under this
License and any other pertinent obligations, then as a consequence you may
not convey it at all.  For example, if you agree to terms that obligate you
to collect a royalty for further conveying from those to whom you convey
the Program, the only way you could satisfy both those terms and this
License would be to refrain entirely from conveying the Program.

  13. Use with the GNU Affero General Public License.

  Notwithstanding any other provision of this License, you have
permission to link or combine any covered work with a work licensed
under version 3 of the GNU Affero General Public License into a single
combined work, and to convey the resulting work.  The terms of this
License will continue to apply to the part which is the covered work,
but the special requirements of the GNU Affero General Public License,
section 13, concerning interaction through a network will apply to the
combination as such.

  14. Revised Versions of this License.

  The Free Software Foundation may publish revised and/or new versions of
the GNU General Public License from time to time.  Such new versions will
be similar in spirit to the present version, but may differ in detail to
address new problems or concerns.

  Each version is given a distinguishing version number.  If the
Program specifies that a certain numbered version of the GNU General
Public License "or any later version" applies to it, you have the
option of following the terms and conditions either of that numbered
version or of any later version published by the Free Software
Foundation.  If the Program does not specify a version number of the
GNU General Public License, you may choose any version ever published
by the Free Software Foundation.

  If the Program specifies that a proxy can decide which future
versions of the GNU General Public License can be used, that proxy's
public statement of acceptance of a version permanently authorizes you
to choose that version for the Program.

  Later license versions may give you additional or different
permissions.  However, no additional obligations are imposed on any
author or copyright holder as a result of your choosing to follow a
later version.

  15. Disclaimer of Warranty.

  THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY
APPLICABLE LAW.  EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT
HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY
OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE.  THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM
IS WITH YOU.  SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF
ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

  16. Limitation of Liability.

  IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING
WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS
THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY
GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE
USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF
DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD
PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS),
EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF
SUCH DAMAGES.

  17. Interpretation of Sections 15 and 16.

  If the disclaimer of warranty and limitation of liability provided
above cannot be given local legal effect according to their terms,
reviewing courts shall apply local law that most closely approximates
an absolute waiver of all civil liability in connection with the
Program, unless a warranty or assumption of liability accompanies a
copy of the Program in return for a fee.

                     END OF TERMS AND CONDITIONS

            How to Apply These Terms to Your New Programs

  If you develop a new program, and you want it to be of the greatest
possible use to the public, the best way to achieve this is to make it
free software which everyone can redistribute and change under these terms.

  To do so, attach the following notices to the program.  It is safest
to attach them to the start of each source file to most effectively
state the exclusion of warranty; and each file should have at least
the "copyright" line and a pointer to where the full notice is found.

    {one line to give the program's name and a brief idea of what it does.}
    Copyright (C) {year}  {name of author}

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

Also add information on how to contact you by electronic and paper mail.

  If the program does terminal interaction, make it output a short
notice like this when it starts in an interactive mode:

    {project}  Copyright (C) {year}  {fullname}
    This program comes with ABSOLUTELY NO WARRANTY; for details type `show w'.
    This is free software, and you are welcome to redistribute it
    under certain conditions; type `show c' for details.

The hypothetical commands `show w' and `show c' should show the appropriate
parts of the General Public License.  Of course, your program's commands
might be different; for a GUI interface, you would use an "about box".

  You should also get your employer (if you work as a programmer) or school,
if any, to sign a "copyright disclaimer" for the program, if necessary.
For more information on this, and how to apply and follow the GNU GPL, see
<http://www.gnu.org/licenses/>.

  The GNU General Public License does not permit incorporating your program
into proprietary programs.  If your program is a subroutine library, you
may consider it more useful to permit linking proprietary applications with
the library.  If this is what you want to do, use the GNU Lesser General
Public License instead of this License.  But first, please read
<http://www.gnu.org/philosophy/why-not-lgpl.html>.
```

### MIT OR Zlib OR Apache-2.0

Texto tomado de miniz_oxide 0.8.9 (LICENSE).

```text
MIT License

Copyright 2013-2014 RAD Game Tools and Valve Software
Copyright 2010-2014 Rich Geldreich and Tenacious Software LLC
Copyright (c) 2017 Frommi
Copyright (c) 2017-2024 oyvindln

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### MIT/Apache-2.0

Texto tomado de bitflags 1.3.2 (LICENSE-APACHE).

```text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### MPL-2.0

Texto tomado de cssparser 0.37.0 (LICENSE).

```text
Mozilla Public License Version 2.0
==================================

1. Definitions
--------------

1.1. "Contributor"
    means each individual or legal entity that creates, contributes to
    the creation of, or owns Covered Software.

1.2. "Contributor Version"
    means the combination of the Contributions of others (if any) used
    by a Contributor and that particular Contributor's Contribution.

1.3. "Contribution"
    means Covered Software of a particular Contributor.

1.4. "Covered Software"
    means Source Code Form to which the initial Contributor has attached
    the notice in Exhibit A, the Executable Form of such Source Code
    Form, and Modifications of such Source Code Form, in each case
    including portions thereof.

1.5. "Incompatible With Secondary Licenses"
    means

    (a) that the initial Contributor has attached the notice described
        in Exhibit B to the Covered Software; or

    (b) that the Covered Software was made available under the terms of
        version 1.1 or earlier of the License, but not also under the
        terms of a Secondary License.

1.6. "Executable Form"
    means any form of the work other than Source Code Form.

1.7. "Larger Work"
    means a work that combines Covered Software with other material, in 
    a separate file or files, that is not Covered Software.

1.8. "License"
    means this document.

1.9. "Licensable"
    means having the right to grant, to the maximum extent possible,
    whether at the time of the initial grant or subsequently, any and
    all of the rights conveyed by this License.

1.10. "Modifications"
    means any of the following:

    (a) any file in Source Code Form that results from an addition to,
        deletion from, or modification of the contents of Covered
        Software; or

    (b) any new file in Source Code Form that contains any Covered
        Software.

1.11. "Patent Claims" of a Contributor
    means any patent claim(s), including without limitation, method,
    process, and apparatus claims, in any patent Licensable by such
    Contributor that would be infringed, but for the grant of the
    License, by the making, using, selling, offering for sale, having
    made, import, or transfer of either its Contributions or its
    Contributor Version.

1.12. "Secondary License"
    means either the GNU General Public License, Version 2.0, the GNU
    Lesser General Public License, Version 2.1, the GNU Affero General
    Public License, Version 3.0, or any later versions of those
    licenses.

1.13. "Source Code Form"
    means the form of the work preferred for making modifications.

1.14. "You" (or "Your")
    means an individual or a legal entity exercising rights under this
    License. For legal entities, "You" includes any entity that
    controls, is controlled by, or is under common control with You. For
    purposes of this definition, "control" means (a) the power, direct
    or indirect, to cause the direction or management of such entity,
    whether by contract or otherwise, or (b) ownership of more than
    fifty percent (50%) of the outstanding shares or beneficial
    ownership of such entity.

2. License Grants and Conditions
--------------------------------

2.1. Grants

Each Contributor hereby grants You a world-wide, royalty-free,
non-exclusive license:

(a) under intellectual property rights (other than patent or trademark)
    Licensable by such Contributor to use, reproduce, make available,
    modify, display, perform, distribute, and otherwise exploit its
    Contributions, either on an unmodified basis, with Modifications, or
    as part of a Larger Work; and

(b) under Patent Claims of such Contributor to make, use, sell, offer
    for sale, have made, import, and otherwise transfer either its
    Contributions or its Contributor Version.

2.2. Effective Date

The licenses granted in Section 2.1 with respect to any Contribution
become effective for each Contribution on the date the Contributor first
distributes such Contribution.

2.3. Limitations on Grant Scope

The licenses granted in this Section 2 are the only rights granted under
this License. No additional rights or licenses will be implied from the
distribution or licensing of Covered Software under this License.
Notwithstanding Section 2.1(b) above, no patent license is granted by a
Contributor:

(a) for any code that a Contributor has removed from Covered Software;
    or

(b) for infringements caused by: (i) Your and any other third party's
    modifications of Covered Software, or (ii) the combination of its
    Contributions with other software (except as part of its Contributor
    Version); or

(c) under Patent Claims infringed by Covered Software in the absence of
    its Contributions.

This License does not grant any rights in the trademarks, service marks,
or logos of any Contributor (except as may be necessary to comply with
the notice requirements in Section 3.4).

2.4. Subsequent Licenses

No Contributor makes additional grants as a result of Your choice to
distribute the Covered Software under a subsequent version of this
License (see Section 10.2) or under the terms of a Secondary License (if
permitted under the terms of Section 3.3).

2.5. Representation

Each Contributor represents that the Contributor believes its
Contributions are its original creation(s) or it has sufficient rights
to grant the rights to its Contributions conveyed by this License.

2.6. Fair Use

This License is not intended to limit any rights You have under
applicable copyright doctrines of fair use, fair dealing, or other
equivalents.

2.7. Conditions

Sections 3.1, 3.2, 3.3, and 3.4 are conditions of the licenses granted
in Section 2.1.

3. Responsibilities
-------------------

3.1. Distribution of Source Form

All distribution of Covered Software in Source Code Form, including any
Modifications that You create or to which You contribute, must be under
the terms of this License. You must inform recipients that the Source
Code Form of the Covered Software is governed by the terms of this
License, and how they can obtain a copy of this License. You may not
attempt to alter or restrict the recipients' rights in the Source Code
Form.

3.2. Distribution of Executable Form

If You distribute Covered Software in Executable Form then:

(a) such Covered Software must also be made available in Source Code
    Form, as described in Section 3.1, and You must inform recipients of
    the Executable Form how they can obtain a copy of such Source Code
    Form by reasonable means in a timely manner, at a charge no more
    than the cost of distribution to the recipient; and

(b) You may distribute such Executable Form under the terms of this
    License, or sublicense it under different terms, provided that the
    license for the Executable Form does not attempt to limit or alter
    the recipients' rights in the Source Code Form under this License.

3.3. Distribution of a Larger Work

You may create and distribute a Larger Work under terms of Your choice,
provided that You also comply with the requirements of this License for
the Covered Software. If the Larger Work is a combination of Covered
Software with a work governed by one or more Secondary Licenses, and the
Covered Software is not Incompatible With Secondary Licenses, this
License permits You to additionally distribute such Covered Software
under the terms of such Secondary License(s), so that the recipient of
the Larger Work may, at their option, further distribute the Covered
Software under the terms of either this License or such Secondary
License(s).

3.4. Notices

You may not remove or alter the substance of any license notices
(including copyright notices, patent notices, disclaimers of warranty,
or limitations of liability) contained within the Source Code Form of
the Covered Software, except that You may alter any license notices to
the extent required to remedy known factual inaccuracies.

3.5. Application of Additional Terms

You may choose to offer, and to charge a fee for, warranty, support,
indemnity or liability obligations to one or more recipients of Covered
Software. However, You may do so only on Your own behalf, and not on
behalf of any Contributor. You must make it absolutely clear that any
such warranty, support, indemnity, or liability obligation is offered by
You alone, and You hereby agree to indemnify every Contributor for any
liability incurred by such Contributor as a result of warranty, support,
indemnity or liability terms You offer. You may include additional
disclaimers of warranty and limitations of liability specific to any
jurisdiction.

4. Inability to Comply Due to Statute or Regulation
---------------------------------------------------

If it is impossible for You to comply with any of the terms of this
License with respect to some or all of the Covered Software due to
statute, judicial order, or regulation then You must: (a) comply with
the terms of this License to the maximum extent possible; and (b)
describe the limitations and the code they affect. Such description must
be placed in a text file included with all distributions of the Covered
Software under this License. Except to the extent prohibited by statute
or regulation, such description must be sufficiently detailed for a
recipient of ordinary skill to be able to understand it.

5. Termination
--------------

5.1. The rights granted under this License will terminate automatically
if You fail to comply with any of its terms. However, if You become
compliant, then the rights granted under this License from a particular
Contributor are reinstated (a) provisionally, unless and until such
Contributor explicitly and finally terminates Your grants, and (b) on an
ongoing basis, if such Contributor fails to notify You of the
non-compliance by some reasonable means prior to 60 days after You have
come back into compliance. Moreover, Your grants from a particular
Contributor are reinstated on an ongoing basis if such Contributor
notifies You of the non-compliance by some reasonable means, this is the
first time You have received notice of non-compliance with this License
from such Contributor, and You become compliant prior to 30 days after
Your receipt of the notice.

5.2. If You initiate litigation against any entity by asserting a patent
infringement claim (excluding declaratory judgment actions,
counter-claims, and cross-claims) alleging that a Contributor Version
directly or indirectly infringes any patent, then the rights granted to
You by any and all Contributors for the Covered Software under Section
2.1 of this License shall terminate.

5.3. In the event of termination under Sections 5.1 or 5.2 above, all
end user license agreements (excluding distributors and resellers) which
have been validly granted by You or Your distributors under this License
prior to termination shall survive termination.

************************************************************************
*                                                                      *
*  6. Disclaimer of Warranty                                           *
*  -------------------------                                           *
*                                                                      *
*  Covered Software is provided under this License on an "as is"       *
*  basis, without warranty of any kind, either expressed, implied, or  *
*  statutory, including, without limitation, warranties that the       *
*  Covered Software is free of defects, merchantable, fit for a        *
*  particular purpose or non-infringing. The entire risk as to the     *
*  quality and performance of the Covered Software is with You.        *
*  Should any Covered Software prove defective in any respect, You     *
*  (not any Contributor) assume the cost of any necessary servicing,   *
*  repair, or correction. This disclaimer of warranty constitutes an   *
*  essential part of this License. No use of any Covered Software is   *
*  authorized under this License except under this disclaimer.         *
*                                                                      *
************************************************************************

************************************************************************
*                                                                      *
*  7. Limitation of Liability                                          *
*  --------------------------                                          *
*                                                                      *
*  Under no circumstances and under no legal theory, whether tort      *
*  (including negligence), contract, or otherwise, shall any           *
*  Contributor, or anyone who distributes Covered Software as          *
*  permitted above, be liable to You for any direct, indirect,         *
*  special, incidental, or consequential damages of any character      *
*  including, without limitation, damages for lost profits, loss of    *
*  goodwill, work stoppage, computer failure or malfunction, or any    *
*  and all other commercial damages or losses, even if such party      *
*  shall have been informed of the possibility of such damages. This   *
*  limitation of liability shall not apply to liability for death or   *
*  personal injury resulting from such party's negligence to the       *
*  extent applicable law prohibits such limitation. Some               *
*  jurisdictions do not allow the exclusion or limitation of           *
*  incidental or consequential damages, so this exclusion and          *
*  limitation may not apply to You.                                    *
*                                                                      *
************************************************************************

8. Litigation
-------------

Any litigation relating to this License may be brought only in the
courts of a jurisdiction where the defendant maintains its principal
place of business and such litigation shall be governed by laws of that
jurisdiction, without reference to its conflict-of-law provisions.
Nothing in this Section shall prevent a party's ability to bring
cross-claims or counter-claims.

9. Miscellaneous
----------------

This License represents the complete agreement concerning the subject
matter hereof. If any provision of this License is held to be
unenforceable, such provision shall be reformed only to the extent
necessary to make it enforceable. Any law or regulation which provides
that the language of a contract shall be construed against the drafter
shall not be used to construe this License against a Contributor.

10. Versions of the License
---------------------------

10.1. New Versions

Mozilla Foundation is the license steward. Except as provided in Section
10.3, no one other than the license steward has the right to modify or
publish new versions of this License. Each version will be given a
distinguishing version number.

10.2. Effect of New Versions

You may distribute the Covered Software under the terms of the version
of the License under which You originally received the Covered Software,
or under the terms of any subsequent version published by the license
steward.

10.3. Modified Versions

If you create software not governed by this License, and you want to
create a new license for such software, you may create and use a
modified version of this License if you rename the license and remove
any references to the name of the license steward (except to note that
such modified license differs from this License).

10.4. Distributing Source Code Form that is Incompatible With Secondary
Licenses

If You choose to distribute Source Code Form that is Incompatible With
Secondary Licenses under the terms of this version of the License, the
notice described in Exhibit B of this License must be attached.

Exhibit A - Source Code Form License Notice
-------------------------------------------

  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at http://mozilla.org/MPL/2.0/.

If it is not possible or desirable to put the notice in a particular
file, then You may include the notice in a location (such as a LICENSE
file in a relevant directory) where a recipient would be likely to look
for such a notice.

You may add additional accurate notices of copyright ownership.

Exhibit B - "Incompatible With Secondary Licenses" Notice
---------------------------------------------------------

  This Source Code Form is "Incompatible With Secondary Licenses", as
  defined by the Mozilla Public License, v. 2.0.
```

### Unicode-3.0

Texto tomado de icu_collections 2.4.0 (LICENSE).

```text
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 2020-2024 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.

SPDX-License-Identifier: Unicode-3.0

—

Portions of ICU4X may have been adapted from ICU4C and/or ICU4J.
ICU 1.8.1 to ICU 57.1 © 1995-2016 International Business Machines Corporation and others.
```

### Unlicense

Texto tomado de robust-predicates 3.0.3 (LICENSE).

```text
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org>
```

### Unlicense OR MIT

Texto tomado de aho-corasick 1.1.5 (LICENSE-MIT).

```text
The MIT License (MIT)

Copyright (c) 2015 Andrew Gallant

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### Unlicense/MIT

Texto tomado de same-file 1.0.6 (LICENSE-MIT).

```text
The MIT License (MIT)

Copyright (c) 2017 Andrew Gallant

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### Zlib

Texto tomado de foldhash 0.1.5 (LICENSE).

```text
Copyright (c) 2024 Orson Peters

This software is provided 'as-is', without any express or implied warranty. In
no event will the authors be held liable for any damages arising from the use of
this software.

Permission is granted to anyone to use this software for any purpose, including
commercial applications, and to alter it and redistribute it freely, subject to
the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim
    that you wrote the original software. If you use this software in a product,
    an acknowledgment in the product documentation would be appreciated but is
    not required.

2. Altered source versions must be plainly marked as such, and must not be
    misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.
```

### Zlib OR Apache-2.0 OR MIT

Texto tomado de bytemuck 1.25.2 (LICENSE-APACHE).

```text
Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

    1. Definitions.

        "License" shall mean the terms and conditions for use, reproduction, and distribution as defined by Sections 1 through 9 of this document.

        "Licensor" shall mean the copyright owner or entity authorized by the copyright owner that is granting the License.

        "Legal Entity" shall mean the union of the acting entity and all other entities that control, are controlled by, or are under common control with that entity. For the purposes of this definition, "control" means (i) the power, direct or indirect, to cause the direction or management of such entity, whether by contract or otherwise, or (ii) ownership of fifty percent (50%) or more of the outstanding shares, or (iii) beneficial ownership of such entity.

        "You" (or "Your") shall mean an individual or Legal Entity exercising permissions granted by this License.

        "Source" form shall mean the preferred form for making modifications, including but not limited to software source code, documentation source, and configuration files.

        "Object" form shall mean any form resulting from mechanical transformation or translation of a Source form, including but not limited to compiled object code, generated documentation, and conversions to other media types.

        "Work" shall mean the work of authorship, whether in Source or Object form, made available under the License, as indicated by a copyright notice that is included in or attached to the work (an example is provided in the Appendix below).

        "Derivative Works" shall mean any work, whether in Source or Object form, that is based on (or derived from) the Work and for which the editorial revisions, annotations, elaborations, or other modifications represent, as a whole, an original work of authorship. For the purposes of this License, Derivative Works shall not include works that remain separable from, or merely link (or bind by name) to the interfaces of, the Work and Derivative Works thereof.

        "Contribution" shall mean any work of authorship, including the original version of the Work and any modifications or additions to that Work or Derivative Works thereof, that is intentionally submitted to Licensor for inclusion in the Work by the copyright owner or by an individual or Legal Entity authorized to submit on behalf of the copyright owner. For the purposes of this definition, "submitted" means any form of electronic, verbal, or written communication sent to the Licensor or its representatives, including but not limited to communication on electronic mailing lists, source code control systems, and issue tracking systems that are managed by, or on behalf of, the Licensor for the purpose of discussing and improving the Work, but excluding communication that is conspicuously marked or otherwise designated in writing by the copyright owner as "Not a Contribution."

        "Contributor" shall mean Licensor and any individual or Legal Entity on behalf of whom a Contribution has been received by Licensor and subsequently incorporated within the Work.
    2. Grant of Copyright License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display, publicly perform, sublicense, and distribute the Work and such Derivative Works in Source or Object form.
    3. Grant of Patent License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable (except as stated in this section) patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work, where such license applies only to those patent claims licensable by such Contributor that are necessarily infringed by their Contribution(s) alone or by combination of their Contribution(s) with the Work to which such Contribution(s) was submitted. If You institute patent litigation against any entity (including a cross-claim or counterclaim in a lawsuit) alleging that the Work or a Contribution incorporated within the Work constitutes direct or contributory patent infringement, then any patent licenses granted to You under this License for that Work shall terminate as of the date such litigation is filed.
    4. Redistribution. You may reproduce and distribute copies of the Work or Derivative Works thereof in any medium, with or without modifications, and in Source or Object form, provided that You meet the following conditions:
        (a) You must give any other recipients of the Work or Derivative Works a copy of this License; and
        (b) You must cause any modified files to carry prominent notices stating that You changed the files; and
        (c) You must retain, in the Source form of any Derivative Works that You distribute, all copyright, patent, trademark, and attribution notices from the Source form of the Work, excluding those notices that do not pertain to any part of the Derivative Works; and
        (d) If the Work includes a "NOTICE" text file as part of its distribution, then any Derivative Works that You distribute must include a readable copy of the attribution notices contained within such NOTICE file, excluding those notices that do not pertain to any part of the Derivative Works, in at least one of the following places: within a NOTICE text file distributed as part of the Derivative Works; within the Source form or documentation, if provided along with the Derivative Works; or, within a display generated by the Derivative Works, if and wherever such third-party notices normally appear. The contents of the NOTICE file are for informational purposes only and do not modify the License. You may add Your own attribution notices within Derivative Works that You distribute, alongside or as an addendum to the NOTICE text from the Work, provided that such additional attribution notices cannot be construed as modifying the License.

        You may add Your own copyright statement to Your modifications and may provide additional or different license terms and conditions for use, reproduction, or distribution of Your modifications, or for any such Derivative Works as a whole, provided Your use, reproduction, and distribution of the Work otherwise complies with the conditions stated in this License.
    5. Submission of Contributions. Unless You explicitly state otherwise, any Contribution intentionally submitted for inclusion in the Work by You to the Licensor shall be under the terms and conditions of this License, without any additional terms or conditions. Notwithstanding the above, nothing herein shall supersede or modify the terms of any separate license agreement you may have executed with Licensor regarding such Contributions.
    6. Trademarks. This License does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor, except as required for reasonable and customary use in describing the origin of the Work and reproducing the content of the NOTICE file.
    7. Disclaimer of Warranty. Unless required by applicable law or agreed to in writing, Licensor provides the Work (and each Contributor provides its Contributions) on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied, including, without limitation, any warranties or conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE. You are solely responsible for determining the appropriateness of using or redistributing the Work and assume any risks associated with Your exercise of permissions under this License.
    8. Limitation of Liability. In no event and under no legal theory, whether in tort (including negligence), contract, or otherwise, unless required by applicable law (such as deliberate and grossly negligent acts) or agreed to in writing, shall any Contributor be liable to You for damages, including any direct, indirect, special, incidental, or consequential damages of any character arising as a result of this License or out of the use or inability to use the Work (including but not limited to damages for loss of goodwill, work stoppage, computer failure or malfunction, or any and all other commercial damages or losses), even if such Contributor has been advised of the possibility of such damages.
    9. Accepting Warranty or Additional Liability. While redistributing the Work or Derivative Works thereof, You may choose to offer, and charge a fee for, acceptance of support, warranty, indemnity, or other liability obligations and/or rights consistent with this License. However, in accepting such obligations, You may act only on Your own behalf and on Your sole responsibility, not on behalf of any other Contributor, and only if You agree to indemnify, defend, and hold each Contributor harmless for any liability incurred by, or claims asserted against, such Contributor by reason of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

To apply the Apache License to your work, attach the following boilerplate notice, with the fields enclosed by brackets "[]" replaced with your own identifying information. (Don't include the brackets!) The text should be enclosed in the appropriate comment syntax for the file format. We also recommend that a file or class name and description of purpose be included on the same "printed page" as the copyright notice for easier identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
