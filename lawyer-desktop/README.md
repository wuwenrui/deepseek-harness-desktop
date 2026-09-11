# LawyerCopilot managed Desktop

English | [中文](README.zh.md)

This is the legal-product variant derived from [Anywhere Labs DSH Desktop](https://github.com/anywhere-labs/dsh-desktop), baseline `8368da47c4a32e813dc6e0190b8d07447e55251b`. Anywhere Labs and DeepSeek MIT notices are retained. The variant is an independent product, not an official or endorsed DeepSeek application.

## What runs

The package reuses the Electron native shell generation, authenticated loopback WebContentsView, window/tray lifecycle, native chrome and renderer isolation. `managed-main.ts` owns the fixed `lawyer` profile and activates our product policy before loading any plugins. The runtime comes from our verified Harness build, not an unmodified npm runtime; the original ten Desktop compatibility patches are rebased onto those tarballs.

The private data home defaults to `~/.lawyercopilot-managed-desktop`, separate from both `~/.dsh` and the earlier Web product at `~/.lawyer-harness`. Existing user data is not overwritten or silently imported. The first run installs the built-in, content-addressed product packages using the bundled pnpm under Electron Node mode. That first-run dependency materialization may need network access; it does not need a system Node.js installation.

All five Agent presets remain: Lawyer (default), Standard, PTC, Minimal and Creation. This is distinct from native **presentation mode**, which this product fixes to compatibility presentation. Ad-hoc dynamic plugin activation remains restricted to the reviewed market path.

## Managed functionality

- Only `https://model.codingrui.work/v1` supplies model requests. Token entry and model discovery use the same protected platform services as the Web product.
- **One signed catalog is the single distribution point** for owned and opened community releases; clients read only that address, and the community catalog is consulted at publish time only. Opening or closing a community capability is a catalog publish users pick up on refresh, with no desktop upgrade. The market does not mount community-market selection, source switching, self-removal, arbitrary restoration or build-approval endpoints.
- The actual installer runs offline staging with a private Node-mode CLI, verifies startup with real DSH and rechecks catalog authorization before switching. Restart then activates the new package. Failed changes preserve the active profile.
- The shell does not publish generic `desktopPnpm`, profile switching, raw terminal, community updater or recovery-import services. A native restart remains a managed restart, not a way to change the runtime.
- The WebContentsView has `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`. The loopback carrier additionally requires a native renderer capability, so ordinary browser requests cannot use its private endpoints.

## Brand

The independent `@lawyer-dsh/lawyer-brand` bundle owns the seal mark, sidebar/hero name and theme tokens. Model routing does not live in the theme. Paper `#f6f1e6`, vermilion `#a63a2a`, navy `#26436e` and ink `#1d2530` are shared with the native chrome, dialogs and app icon. Dark mode uses `#db8d78` for an accessible accent. Light, dark and system preferences remain available.

## Build and acceptance

From the outer repository:

```sh
corepack yarn install --immutable
node scripts/verify-lawyer-runtime.mjs
corepack yarn build:lawyer
corepack yarn workspace lawyer-dsh-desktop prepare:electron-native
```

This workspace requires Corepack/Yarn 4.18.0. If Corepack is not on PATH, `npm exec --yes --package=corepack@0.34.6 -- corepack yarn ...` invokes the same pinned toolchain without a global installation.

From `lawyer-desktop/`:

```sh
node lib/bin.js                              # explicitly launch the native application
node scripts/test-managed-desktop.mjs       # actual Electron, remote HTTP fixtures
node scripts/package-dir.mjs                # current-host, unsigned, publish=never
node scripts/test-managed-desktop.mjs --packaged
```

The macOS ARM64 directory artifact is `dist/mac-arm64/LawyerCopilot.app`. Product artifact checks verify the managed entry, exact seed bytes, physical Node files and final executable fuses. The test script checks the real native light/dark UI, five presets, token/model controls, rejected native/HTTP bypasses, actual legal-plugin installation, restart, model streaming and compressed Session persistence. Reports and screenshots are in `dist/e2e-source` and `dist/e2e-packaged`.

`productionModelCall: false` in a report means remote model and catalog HTTP were test fixtures, not production. The actual central endpoint and an authorized user token require separate live verification. No test performs court filing or another legal-system submission.

## Shipping boundary

The current local acceptance target is macOS ARM64. This is not a notarized public release, Windows acceptance or universal-binary acceptance. Do not run inherited release commands as a shortcut: signing, update endpoints, platform native artifacts and public release approvals need their own product release lane. The inherited unrestricted bootstrap source is retained for reference but is not the `lib/main.js` entry built by this variant.
