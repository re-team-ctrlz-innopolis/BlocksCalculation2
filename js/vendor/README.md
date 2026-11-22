# Local PDF dependencies

These files are shipped with the app. PDF export makes no network requests and works when `BlocksCalculation2.html` is opened directly from disk. No build step or npm install is needed.

- [jsPDF 4.2.1](https://github.com/parallax/jsPDF/releases/tag/v4.2.1): `jspdf.umd.min.js`, MIT license in `jspdf.LICENSE.txt`. Original file: `https://raw.githubusercontent.com/parallax/jsPDF/v4.2.1/dist/jspdf.umd.min.js`. SHA-256: `e6551fcdc32f09d6853b2c5126d18d01d9447e0da618a41a11ebeee0f6c20d54`.
- [jsPDF-AutoTable 5.0.9](https://github.com/simonbengtsson/jsPDF-AutoTable/releases/tag/v5.0.9): `jspdf.plugin.autotable.min.js`, MIT license in `autotable.LICENSE.txt`. Original file: `https://raw.githubusercontent.com/simonbengtsson/jsPDF-AutoTable/v5.0.9/dist/jspdf.plugin.autotable.min.js`. SHA-256: `83dd8e5ae29436bd3d3ef4f4a915125b3951264994c25de0359d3fbd105abe15`.
- [Noto Sans Regular](https://github.com/notofonts/noto-fonts): `notosans-regular.js` contains the unmodified TTF encoded as base64, under the SIL Open Font License in `notosans.LICENSE.txt`. Original font: `https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf`. TTF SHA-256: `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`.

Sources downloaded on 2026-11-22. The font is embedded in reports so text remains selectable and Unicode model notes, including Cyrillic, render without relying on installed fonts.
