# Third-Party Notices

VelocePDF bundles and depends on the following open-source components. Each retains its original license. This file is informational and does not change the MIT license of VelocePDF itself.

## Runtime Dependencies

| Package | Version | License | Source |
|---|---|---|---|
| pdfjs-dist (Mozilla PDF.js) | ^5.4.449 | Apache-2.0 | https://github.com/mozilla/pdf.js |
| pdf-lib | ^1.17.1 | MIT | https://github.com/Hopding/pdf-lib |
| React | ^18.3.1 | MIT | https://github.com/facebook/react |
| React DOM | ^18.3.1 | MIT | https://github.com/facebook/react |
| @tauri-apps/api | ^2.3.0 | MIT / Apache-2.0 | https://github.com/tauri-apps/tauri |

## Tooling (dev, not shipped)

- Vite, TypeScript, Vitest, ESLint, Prettier — MIT
- @tauri-apps/cli — MIT / Apache-2.0

## Fonts and Assets

- System UI fonts only (Inter where available, fallback to system). No bundled proprietary fonts.
- Icons are custom SVG, MIT.

## PDF.js Notes

PDF.js is licensed Apache-2.0. Redistribution must retain its LICENSE and NOTICE. VelocePDF does not modify PDF.js; it configures it with `isEvalSupported: false` and disables JavaScript / launch actions.

## pdf-lib Notes

MIT licensed; used for annotation embedding and page operations (extract, rotate, delete). No modification.

## Tauri Notes

MIT / Apache-2.0 dual license. Tauri's WebView uses OS-native components:
- Windows: WebView2 (Edge)
- macOS: WKWebView
- Linux: WebKitGTK

No additional runtime licensing obligations for end users.

## Obligations

If you distribute a binary that includes these dependencies, include this file and the MIT LICENSE alongside the binary (e.g., in the installer or About dialog). Source distributions must retain this file.

For full license texts, see the respective repositories.
