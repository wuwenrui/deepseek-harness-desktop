# libvips 1.3.2 distribution evidence and release decisions

## Scope and verified identity

This evidence covers `@img/sharp-libvips-darwin-arm64@1.3.2` and
`@img/sharp-libvips-darwin-x64@1.3.2`, containing libvips **8.18.3**.
It is not approval of LawyerDesk as a whole, a complete binary SBOM, or a
blanket legal-compliance guarantee. No app build, signing, installation,
replacement, commit, or publication was performed for this evidence task.

Both installed manifests, READMEs, versions inventories and native dylibs
were compared byte-for-byte with their exact public npm 1.3.2 tarballs.
`evidence/npm-origin.json` records tarball URLs/hashes and binary hashes.
`../libvips-index.json` pins each installed manifest and every retained document.
The installed inventories match `upstream/versions.properties` and the release
body at https://github.com/lovell/sharp-libvips/releases/tag/v1.3.2.
The annotated tag resolves to commit
`4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6`; the saved GitHub API response reports
its signature as verified (not a separate local signature verification).

## What is preserved here

- Original **both-platform multiple-library READMEs** and the exact upstream
  `THIRD-PARTY-NOTICES.md`, unchanged. They enumerate 29 libraries and expressly
  elect LGPLv3 via earlier LGPL versions' later-version clauses. They are an
  inventory, not full license terms, and are not used as a substitute for them.
- Complete exact source archives for all 28 versioned direct recipe dependencies;
  libnsgif is inside `vips-vips-8.18.3.tar.xz`, with its own MIT `COPYING` retained
  under `texts/vips/libvips/foreign/libnsgif/`. No invented libnsgif version is used.
  Four upstream patch files and the pinned sharp-libvips recipe-source archive
  are also included. All direct URLs come from the pinned POSIX recipe with its
  exact version substitutions, not latest-version search results.
- All **348 registry crate sources** in released librsvg 2.62.90's `Cargo.lock`,
  individually checked against its SHA-256 checksums. The lock and relevant Cargo
  feature manifests are retained. This deliberately includes non-Darwin, optional,
  test and build dependencies: a conservative source/notice superset, not a claim
  that every crate occurs in the distributed dylib. Nested legal files from the
  crates are retained under `texts/rust/` and included in the document index,
  rather than hidden only inside compressed archives.
- Exact original source `LICENSE`, `COPYING`, `COPYRIGHT`, `NOTICE`, `PATENTS`,
  SPDX `LICENSES/` texts and special referenced terms (FreeType FTL, driver
  notices, mozjpeg IJG). This includes optional/test licenses without silently
  treating them as the shipped library's license. The source archives additionally
  preserve copyright/license comments in individual source files.
- Official full LGPLv3 **and GPLv3** texts, plus MPL2. LGPLv3 incorporates GPLv3;
  shipping only an LGPL summary would omit required terms. Earlier license
  versions and upstream grants are retained unchanged as evidence, not rewritten.

`sources.json` is the machine-readable attachment list: each entry has a path
relative to `licenses/`, SHA-256, exact URL and revision. It contains **381**
archives/patches totaling **199,638,447 bytes**. `source-inputs.json` adds exact
recipe line references and archive-member provenance; `rust-source-inputs.json`
adds Cargo.lock checksums. `../libvips-index.json` references **740 unique
retained documents** across the two package entries. All indexed hashes were
verified locally. Archival availability and attribution evidence are established;
actual recipient delivery remains a release operation.

## Attribution and license choices to retain

LawyerDesk uses libvips and the libraries listed in the original platform READMEs.
The LGPL-covered libraries and their use are covered by LGPLv3 as identified
there. Recipients must receive the full LGPLv3/GPLv3 texts and original notices.
This software is based in part on the work of the **FreeType Team**
(https://freetype.org); see `texts/freetype/docs/FTL.TXT` for its full disclaimer.
Retain AOM's patent license, mozjpeg's combined terms and all individual
copyright statements, not merely SPDX labels.

Cairo's original `COPYING` says LGPL2.1/MPL1.1, while the packaging notice elects
MPL2; preserve both the original grant (MPL1.1 section 6.2 permits subsequent
versions) and the full elected MPL2 text. MPL2 section 3.2 requires source access
and telling executable recipients how to obtain it. The exact cairo source is
included; it must also be made available alongside the release directions.

Some preserved source auxiliaries are GPL3 without LGPL's additional permissions.
Their presence in this source superset is **not evidence of GPL-only code linked
into the app**. For example, `upstream/lcms/meson_options.txt` disables GPL3
fastfloat/threaded plugins by default, and the pinned recipe does not enable them;
libheif disables examples and x265, while cairo's `COPYING` explicitly separates
`src/` implementation from GPL-capable auxiliary tools. A changed build that
includes GPL-only code requires its own review; LGPL's application-linking
permission must not be extended to an ordinary GPL library.

## Rebuild and source-availability mechanism

The complete original packaging source is in `sources/sharp-libvips-1.3.2.tar.gz`.
Extract it in a separate user-controlled directory: its original paths are intact.
The readable copy `upstream/recipes/posix.sh` corresponds byte-for-byte to original
`build/posix.sh` (renamed only to keep this evidence tree separate from build output).
Use that archive, **not the rearranged readable copy**, as the build tree.

The upstream entry points are `bash build.sh darwin-arm64v8` and
`bash build.sh darwin-x64` on macOS. `upstream/.github/workflows/ci.yml`,
`upstream/build.sh` and Darwin toolchain files document the runner/dependencies,
Clang/Xcode, Homebrew pkg-config, deployment targets and cross settings.
The POSIX recipe contains every configure/meson/cmake option and inline `sed`
change. It statically links component libraries into `libvips-cpp.8.18.3.dylib`.
The four saved patches affect GLib, mozjpeg, libultrahdr and libvips; the recipe
also modifies fontconfig, pango and librsvg. Do not call these upstream binaries
unmodified component sources without retaining those changes.

The recipe downloads Rust nightly and cargo-c without a version pin, and runs
`cargo update --workspace` after removing selected librsvg features. That command
is not proof every locked registry version changes. The released lock and all its
registry source archives are available here; bit-identical reproduction was not
attempted and is not asserted as the legal standard. For a production rebuild,
record the actual compiler/tool versions and final resolved Cargo.lock, compare
its required crates to this archive set, and add any missing exact source inputs.
Keep local patches and modification/date notices with any redistributed modified
source. Never replace these records with a claim of reproducibility from a
version number alone.

For downloadable releases, use the GPLv3 **section 6(d)** source-access route:
attach the complete `licenses/` directory (including `libvips/sources/`, its
indices, full texts and this review) as an accessible source/evidence archive at
the same release location as the app. Place clear download directions next to
the binary, at no further charge. If hosting sources elsewhere, maintain the
clear directions and equivalent access; the distributor remains responsible
for their availability. A local folder or an upstream GitHub hyperlink alone
is not proof that this release has delivered that access. This document does
not issue a section 6(b) written offer or substitute a generic three-year
promise for choosing and fulfilling the applicable distribution route.

## Concrete decisions and acceptance still required before release

1. **Recipient library replacement:** `evidence/native-linkage.txt` records both
   native binary hashes and `otool -L` output. The sharp 0.35.3 `.node` modules
   load `@rpath/libvips-cpp.8.18.3.dylib`; the dylib's listed dependencies are macOS
   system libraries/frameworks. This supports the intended LGPLv3 **4(d)(1)**
   shared-library route for the application, but is not an execution test.
   In a disposable copy of the final packaged app, replace the architecture's
   ASAR-unpacked dylib with a user-built, interface-compatible modified dylib;
   run an actual sharp operation and app startup. Publish the exact physical
   replacement path and any necessary local signing/launch instructions from
   that successful test. Verify no integrity check, managed policy, library
   validation or updater rejects/overwrites it merely because it was modified.
   Do not ask recipients to supply the distributor's signing private key.
2. **Fallback/relink and combined-library treatment:** if that shared-library
   mechanism cannot be made suitable, choose **4(d)(0)** and convey Minimal
   Corresponding Source plus Corresponding Application Code (source and/or
   linkable object code and required data/utilities) under terms permitting
   recombination/relinking. Review the statically combined library separately,
   including LGPL section 5's uncombined-form/notice requirements when applicable;
   the component sources and build recipes are retained, but rebuilt uncombined
   objects/libraries and a demonstrated relink kit were not produced here.
   Do not represent a single replaceable dylib as automatically satisfying every
   internal static-link obligation.
3. **Recipient terms and installation information:** ensure the product terms
   permit modification of LGPL portions and reverse engineering for debugging
   those modifications (LGPL4). Provide installation information where LGPL4(e)
   and GPL6's User Product conditions apply. This is a distribution-specific
   determination, not a reason to omit practical replacement instructions.
   Retain prominent library notices with each copy, and in displayed copyright
   notices if the combined work displays them (LGPL4(a)-(c)).
4. **Final source correspondence and delivery:** compare final shipped dylib hashes
   to `evidence/npm-origin.json`; changes require refreshing this evidence.
   Confirm final build inputs and Rust closure, retain any additional sources,
   and verify all 381 attachment hashes after packaging/upload. Confirm the
   aggregate notices carry the indexed texts, and the app and source attachment
   both retain the applicable notices. Publish source access directions at the
   actual release URL and test an unauthenticated recipient download. Neither
   this task nor a green hash checker has performed those release actions.

## Rechecking this evidence

`collect-evidence.py` downloads exact direct recipe inputs without executing them.
`collect-rust-sources.py` downloads and verifies the released lock's crate sources.
`index-evidence.py` compares the installed package/docs/dylib against exact npm
archives and regenerates indices, checking every document/source hash. These
scripts write only inside the owned license evidence paths; they are acquisition
and verification helpers, not app build recipes. They use public unauthenticated
network access. The parent release gate can verify `sources.json` and
`../libvips-index.json` offline without running acquisition scripts.
