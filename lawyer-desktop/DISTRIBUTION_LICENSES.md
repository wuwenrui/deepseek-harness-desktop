# LawyerDesk distribution license review

## First-party private component

The product owner has authorized inclusion of its own private component
`@lawyer-dsh/lawyer-platform@0.1.6` in the LawyerDesk unsigned macOS ARM64
GitHub prerelease. Its manifest remains `private: true`, `license: UNLICENSED`.
This is a first-party distribution decision, **not an open-source license grant**
and not a change to that manifest. It does not authorize independent redistribution
of the component by recipients or apply to other packages, versions, or names in
`@lawyer-dsh`. The license gate matches the exact name, version and private flag;
all third-party dependencies are checked separately. Future versions require review.

### Owned brand package (different manifest declaration)

The same product-owner authorization expressly includes
`@lawyer-dsh/lawyer-brand@0.1.1`. Its actual installed manifest declares `MIT`
and has **no `private` field**. We do not change it or manufacture a copyright
holder / MIT template to fill the missing upstream text. The exact owned-package
distribution statement is retained in `licenses/first-party/` and the aggregate.
The gate pins the entire manifest identity, original manifest SHA-256 and statement
SHA-256. This is a narrowly scoped first-party release authorization, not an
exemption for other MIT packages or any additional UNLICENSED components.
Existing rights, if any, are not withdrawn by this statement.

## Reviewed Blue Oak Model License 1.0.0

The installed LICENSE.md files were read in full for tar@7.5.22,
minipass@7.1.3, chownr@3.0.0 and yallist@5.0.0. Their Copyright and Patent sections
grant the corresponding permissions; Notices requires that recipients receive
the license text or https://blueoakcouncil.org/license/1.0.0. Acceptance, Excuse,
Reliability and No Liability are retained, not abbreviated in the generated notices.
The gate pins the exact package versions and the SHA-256 of their reviewed text.

- tar and minipass LICENSE.md SHA-256:
  `8a1af140fdfbf5afd3df27f7e662f989c5b963a300020dfafce42033cae9e004`
- chownr and yallist LICENSE.md SHA-256:
  `a49c9ba464796f65b59fca3f1e6ca40912df1e859f575383223f7ec6c5baae09`

The latter two documents say packages under src/ have their own licenses. These
installed distributions contain LICENSE.md, README.md, dist/ and package.json,
not src/. The collector retains nested legal documents too; adding src/ or changing
contents requires review of applicable subcomponent terms. A matching SPDX label
alone does not approve an unknown BlueOak text or version.

## Reproducible evidence and release gate

Run from lawyer-desktop (no build or network access):

```sh
node --test scripts/license-audit.spec.mjs scripts/license-sidecar.spec.mjs scripts/license-manifest.spec.mjs
node scripts/verify-licenses.mjs --notices THIRD_PARTY_NOTICES.md
node scripts/verify-licenses.mjs --check-notices THIRD_PARTY_NOTICES.md
node scripts/verify-licenses.mjs --check-notices THIRD_PARTY_NOTICES.md --asar dist/mac-arm64/LawyerDesk.app/Contents/Resources/app.asar
```

Generation includes the installed production graph, distinct package versions,
and the actual LICENSE/NOTICE/COPYING/COPYRIGHT texts with hashes. Missing or
unreviewed terms fail even if generation succeeds in writing an evidence report.
There are no timestamps or absolute installation paths in the output. Regenerate
with the target's locked installation; other OS/architecture optional packages
may change the inventory. Do not describe this inventory as a complete binary SBOM.

The release lead has added THIRD_PARTY_NOTICES.md and this document to
electron-builder **build.files** (npm's top-level files is not sufficient).
After regenerating notices the lead must rebuild the app and rerun the archive check. The check follows the actual archived
dependency graph, verifies bytes by reading ASAR entries or their physical
app.asar.unpacked sidecars, and checks exact copies of both aggregate documents.
If electron-builder removes individual legal files, the full-text aggregate is
the retention carrier; missing original paths are still reported. Changed original
legal text is a failure, not silently replaced by an aggregate.

## Limits and remaining release review

This gate does not infer licenses from a filename or waive arbitrary UNLICENSED,
unknown, SEE LICENSE IN, or compound expressions. Newly encountered terms need
review rather than an allowlist shortcut. Existing LGPL and MPL policy is preserved
as conditional: retaining notices alone does not satisfy source availability,
modification notices, relinking/replacement, or other applicable requirements.
The release lead must verify those requirements for the binaries actually shipped,
especially sharp/libvips; a green script is not proof of full LGPL compliance.

The dependency graph does not fully describe bundled code inside pnpm, native
binaries, Electron/Chromium, fonts, renderer devDependencies in compiled bundles,
or extraResources seed archives. Their original nested legal documents are retained
where discoverable within graph packages, but embedded node_modules without graph
edges and opaque artifacts require separate inventory/source review. The archive
report exposes untraversed package manifests for this reason. Electron's external
framework license/Chromium notices and extraResources are outside app.asar and
must also accompany the final deliverable as required. Do not equate absence of
an SPDX failure with authorization to release those unchecked components.

## Exact supplemental evidence

The former missing-text cases are addressed in `licenses/first-party-index.json`,
`licenses/upstream-index.json` and `licenses/libvips-index.json`. Each entry binds
name, version, declared license, exact installed package.json SHA-256, retained
original document bytes and source URL/revision. The collector reads these
reviewed sidecars first, then retains installed originals as well. Changed or
missing sidecar bytes/manifest identity fail the gate; no node_modules was edited. The archive accepts either those exact manifest bytes or electron-builder 26.15.7's observed, exact removal of `scripts` and `keywords` plus its JSON serialization. The original remains SHA-pinned; changes to license, author, version, dependencies or other fields are not normalized away. Tests reject those mutations.
The full-text aggregate carries the sidecar texts into the app. Source metadata
and raw documents remain available in the release materials for independent review.

For xterm, pi and standardwebhooks, npm gitHead binds the source license to the
published version. standardwebhooks uses the MIT text in `libraries/LICENSE`, not
the different repository-root license. Koffi's exact parent npm release binds both
native optional packages and supplies original Koffi and Node-API legal texts.
AWS package versions are checked against source manifests at the resolved release
commit; the evidence records the actual nested-clients source directory rather
than trusting stale repository metadata. These are version-specific reviews, not
new generic license policy exceptions.

`data-uri-to-buffer@4.0.1` retains its complete README MIT text only for SHA-256
`a7cc4332acfa1f9b6530e01aac77fefe74f2efa32579215fddaa473013f9a25c`.
The aggregate renders collected documents as indented text, expanding tabs and
trimming trailing whitespace; hashes and original-file comparisons use source bytes.

## libvips corresponding source and replacement

**Library notice:** LawyerDesk uses libvips and the libraries listed in the
retained platform READMEs. The LGPL-covered libraries and their use are covered
by LGPLv3 as identified there; full LGPLv3/GPLv3 terms accompany the aggregate.
This software is based in part on the work of the **FreeType Team**
(https://freetype.org); its full FTL disclaimer is retained. Cairo's elected MPL2
source is provided with the same source-materials download described below.

Read `licenses/libvips/RELEASE.md` before release. Both sharp-libvips Darwin
packages are exactly 1.3.2, associated with sharp-libvips commit
`4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6` and libvips 8.18.3. The installed
README's multi-library inventory is retained, not treated as complete terms.
Original license/notice/patent texts have been extracted from the corresponding
source archives, including bundled libnsgif and conservative Cargo.lock coverage
(which also includes build/dev/other-target components, not a binary SBOM).

The source-materials set includes exact direct upstream source releases, upstream
patches, the pinned sharp-libvips build recipe and the Rust crates named by the
librsvg release Cargo.lock. `licenses/libvips/sources.json` records URLs, versions
and SHA-256 for each; verify-licenses checks all archived bytes offline. Retain and
publish these copies alongside the binary rather than relying solely on third-party
links or making an unsupported future written offer. LGPL-3.0 and its incorporated
GPL-3.0 terms are retained with the upstream library texts.

The inspected ARM64 sharp native module dynamically references
`@rpath/libvips-cpp.8.18.3.dylib`; dependencies inside that dylib are statically
combined by the upstream recipe. The intended LGPL combined-work approach is
recipient replacement with an interface-compatible rebuilt dylib, accompanied
by the source/build inputs, rather than a claim that proprietary application
source must be licensed under LGPL. The product owner permits modification of
these LGPL components and reverse engineering for debugging such modifications;
no product condition or first-party notice may prohibit these LGPL rights.

**Concrete release gate not executed in this license-only task:** the release
lead must test the final app using a recipient-modified, same-ABI ARM64 dylib,
record its actual app.asar.unpacked replacement location and installation steps,
and verify loading/image processing without distributor-only signing keys or
integrity-policy barriers. If the shared-library mechanism is unsuitable, provide
a working relink/install mechanism and any required Corresponding Application
Code, or change packaging before distributing. Unsigned status alone proves none
of this. The upstream recipe's Rust toolchain/cargo-update behavior and source
correspondence limitations are documented in RELEASE.md; matching top-level
versions is not represented as bit-for-bit reproduction or universal legal clearance.

## Beta.2 release integration

The release process additionally preserves the exact Electron distribution's LICENSE and LICENSES.chromium.html in `Contents/Resources/licenses/`, with byte comparison in the package gate. The legal GenUI seed includes its own output-module-based notices and nested embedded-library provenance; its host/client/engine tar members are checked against the reviewed stage. This supplements, rather than expands the claimed scope of, the installed-package graph.

**Source access and uncombined form:** obtain `LawyerDesk-license-source-materials.tar.gz` at no additional charge from the same [beta.2 download page](https://github.com/wuwenrui/deepseek-harness-desktop/releases/tag/lawyerdesk-v0.1.0-beta.2) as the binary. Inside it, `licenses/libvips/sources/` contains separate complete component source archives; `source-inputs.json`, the patches and the pinned recipe supply the corresponding modifications, inline edits and build configuration. These independently supplied source forms, under their original terms, are the designated uncombined form for internal library facilities—not merely a pointer to the combined dylib. See the accompanying [recipient source/replacement instructions](https://github.com/wuwenrui/deepseek-harness-desktop/blob/lawyerdesk-v0.1.0-beta.2/lawyer-desktop/licenses/libvips/RECIPIENT.md), also in that archive.

The application boundary uses LGPL 4(d)(1)'s runtime shared-library mechanism. The beta.2 gate checks a disposable copy with a byte-modified, ad-hoc-signed compatible dylib: real sharp PNG processing, actual loaded-library path and ordinary managed desktop startup, without reverting the replacement. It confirms the original release library matches the reviewed upstream binary. This is not a full source rebuild or bit-identical reproduction claim. The separate complete component sources/patches/configuration address internal source-form delivery; no additional object-archive format or actual relink test is asserted to be mandatory by the retained license text. If concrete correspondence differences arise, update the affected sources rather than treating this evidence as a blanket waiver.

In a fresh Git checkout, the large source inputs are intentionally excluded from Git. `node scripts/fetch-license-sources.mjs` explicitly retrieves the reviewed public URLs, checks every SHA-256 and never installs or runs downloaded code; alternatively use the complete release source attachment. Once inputs exist, audit and material packaging remain offline. Public availability is verified after release publication and is not inferred from local archive creation.

## Release companion files

After generating and checking the notices, run (license material packaging only):

```sh
node scripts/package-license-materials.mjs
```

Publish these together on the same release download page at no additional charge:

- The application artifact (built and checked separately by the release lead).
- `licenses/release/LawyerDesk-license-source-materials.tar.gz` and
  `licenses/release/SHA256SUMS.txt`. The archive contains both aggregate documents,
  the complete `licenses/` evidence/source tree, and the offline audit scripts;
  it excludes its own output directory. Do not omit source tarballs/patches/crates.
- Accessible copies of `THIRD_PARTY_NOTICES.md` and `DISTRIBUTION_LICENSES.md`
  (also inside the app and source-materials archive), and the verified replacement
  instructions described above, linked prominently from the release notes.

Publishing the companion is a required future release action, not something this
local task has performed. The old app predates these documents; only a fresh
`--asar` check proves their retention in the actual new release. No app build,
commit, push or publication is performed by these license-only scripts.
