# LawyerCopilot managed Desktop variant

This package is the managed legal-product variant derived from `dsh-plugin-desktop-beta` at outer commit `8368da47c4a32e813dc6e0190b8d07447e55251b`. It intentionally replaces the unrestricted bootstrap with `src/managed-main.ts` while reusing the native shell, renderer isolation, window/tray lifecycle and client carrier.

- Runtime inputs are the verified `vendor/lawyer-runtime` tarballs and rebased `patches/lawyer-*` adapters. The upstream submodule is reference-only; never edit it to make a desktop test pass.
- The `lawyer` profile is fixed; only the five Agent presets vary per conversation. Do not confuse Agent modes with Desktop presentation modes: this product supports compatibility presentation only.
- Product model routing, approved-market policy and brand are mandatory. Do not restore unrestricted profile/market/terminal/recovery/update providers from the inherited reference source.
- The standalone `managed-cli` build must have no relative JS-chunk imports: Electron Node-mode health checks run its physical ASAR-unpacked file.
- Use the root Yarn toolchain. `yarn build:lawyer` builds; `node scripts/test-managed-desktop.mjs` and `--packaged` under this package are real Electron acceptance tests. The latter requires the current-host unsigned directory build.
- Public release, code signing, Windows/universal packaging and central-directory deployment are separate operations, never side effects of local validation.
- Keep inherited code/tests as reference, but the managed entry, product-specific package checks and actual Electron tests define this variant's acceptance. Run the upstream variant-synchronization gate only for changes that are actually shared with stable/beta.
