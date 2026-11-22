# Local interface assets

The application loads these files locally, including when `draft.html` is opened directly from disk. There are no CDN or Google Fonts requests. Keep `assets/`, `js/`, `styles.css` and `draft.html` together when copying the application.

- **Tailwind CSS 3.4.17**: `vendor/tailwind.css` is compiled from `tailwind.input.css` using `../tailwind.config.cjs`. The config scans both `draft.html` and the application JavaScript so classes in dynamically created cards, buttons and validation messages are included. [Official release](https://github.com/tailwindlabs/tailwindcss/releases/tag/v3.4.17), MIT license in `vendor/tailwind.LICENSE.txt`.
- **Inter 4.1**: `fonts/InterVariable.woff2` is the unmodified variable font for normal styles and weights 100–900. [Official release](https://github.com/rsms/inter/releases/tag/v4.1), [original font](https://raw.githubusercontent.com/rsms/inter/v4.1/docs/font-files/InterVariable.woff2), SIL Open Font License in `fonts/Inter.LICENSE.txt`. SHA-256: `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`.

PDF libraries and the report font are documented separately in [`../js/vendor/README.md`](../js/vendor/README.md). Sources downloaded on 2026-11-22.

## Rebuilding utility styles (development only)

The generated CSS is committed to the project. Users do not need to run these commands. Rebuild it after adding or changing Tailwind class names in HTML or JavaScript; keep complete class names in the source, rather than constructing them from string fragments.

From the application directory, using Node.js/npm:

```powershell
npx --yes tailwindcss@3.4.17 -c ./tailwind.config.cjs -i ./assets/tailwind.input.css -o ./assets/vendor/tailwind.css --minify
```

Alternatively, download the standalone CLI from the pinned official release above and run the same arguments with that executable, without Node.js. Downloading development tools requires internet; using an already downloaded CLI and running the application do not.
