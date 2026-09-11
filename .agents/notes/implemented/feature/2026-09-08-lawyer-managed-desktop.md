# Agent Note: Managed LawyerCopilot desktop variant

Status: implemented

English | [中文](2026-09-08-lawyer-managed-desktop.zh.md)

## Problem

The legal product requires a native shell without regaining the ordinary Desktop's arbitrary profile, marketplace, package-manager and recovery authority. Its fixed model service, reviewed plugin catalog and brand already exist as a managed Harness composition. A page in a BrowserWindow alone would not validate the native runtime or packaged installation paths.

## Decision

A separate `lawyer-desktop` workspace derives from beta while leaving stable/beta source intact. The managed bootstrap reuses ElectronDesktopRuntime, native shell generation, renderer authentication, window policy and brand-compatible chrome, but does not mount the unrestricted providers. It boots the verified lawyer runtime and platform/market/brand bundles, with the product policy enabled before Loader entries.

The original ten alpha Desktop compatibility patches are rebased onto the managed Harness artifacts. Their emitted chunk filenames differ from the source release, so the rebased patches and artifact hashes are recorded independently. The pinned upstream submodule remains reference-only.

Electron Node-mode package installation uses a private, standalone managed CLI carrier. This preserves profile module resolution and the normal dsh profile-policy checks. The packaged helper and Node dependency closure have physical ASAR-unpacked paths. Preset discovery needs filesystem presence rather than only import hooks, so managed fallback links point at verified physical packages instead of paths inside virtual ASAR directories.

## Alternatives considered

**Shipping the unmodified Desktop runtime** drops our process-owned model and installation checks. The product seals its own verified runtime instead.

**Mounting both community markets** creates alternate installation authorities. The managed composition includes only our signed-catalog market, and native controls do not expose other package managers or profile selectors.

**Copying a Web page into a new Electron shell** discards the upstream window, authentication and lifecycle work. The native implementation is reused with a narrow product-specific bootstrap and chrome.

**Only testing source startup** misses ASAR path and native ABI failures. Actual current-host packaged Electron testing exercises the same legal-plugin installation and persisted model conversation as source testing.

## Consequences

This is a separate managed product branch/variant, not a transparent change to the original stable distribution. It has an independent application ID, home and theme. Generic profile switching, community self-updates, native raw-terminal access and recovery imports are not supported. Public notarized releases, Windows/universal acceptance and production catalog/model verification are separate from local macOS ARM64 acceptance. First-run dependency materialization may require network access; secrets are never embedded in the seeds.
