# Third-party notices

Ghost Studio's original code and documentation are licensed under the MIT
License in the repository root. Third-party works below retain their own
licenses and are not relicensed by that file.

Ghost Studio includes an adapted SVG eye and its geometry constants from
[Chengzhibense/Fairy-DSH](https://github.com/Chengzhibense/Fairy-DSH), commit
`d639887a386b0de6fef2e61c97dc268631854591`.

Copyright 2026 Chengzhibense. Licensed under Apache License 2.0.
The original license and NOTICE are in `licenses/`. The two adapted files are
`src/renderer/src/components/ghost/mascot-eye-svg.js` and `mascot-geometry.js`.
Changes: CommonJS-to-ES-module conversion, attribution headers, monochrome
silver material gradients and concentric rim details for the C3 appearance.
The adapted SVG also supplies the Windows and tray icon artwork. It is styled
and animated by Ghost Studio's own React component and stylesheet.

The default persona in `src/shared/persona/default.json` adapts the public
`persona.config.text` section of `.agent-presets/fairy/agent.cordis.yml` from
the same commit and license. Changes: rename the speaking assistant to Ghost,
adapt identity and world references to Studio, and retain the original voice,
relationship cues, humor and behavior with truthful host-capability boundaries.
The original copyright, license and NOTICE remain in `licenses/`.

The original project's names and internal SVG selectors remain in those source
files for attribution and compatibility. The product-facing assistant is Ghost.
No game voice recordings, game text corpora, TTS models, or user credentials are
included. This project is not affiliated with OpenAI, DeepSeek, or HoYoverse.

Other dependencies retain their own licenses in their npm packages. Versions are
pinned by `package-lock.json`; an inventory is generated before packaging.

The public distribution contains no game boot footage or previews derived
from it. Startup uses code-based animation of the attributed eye artwork.
The game's names are used as references and are not granted by the MIT or
Apache licenses. No rights to HoYoverse game assets or trademarks are granted.

The renderer explicitly redirects Monaco Editor's embedded DOMPurify import
to the pinned DOMPurify 3.4.17 ESM distribution. DOMPurify is dual-licensed
under Apache-2.0 OR MPL-2.0; its notices are included in the generated
dependency inventory. Unused editor source packages are excluded from the
application archive; browser workers and editor code are bundled locally.
