# LawyerDesk beta.3: LGPL component sources and recipient replacement

## Obtain the independent component sources

The application uses libvips 8.18.3 and its associated libraries. The FreeType portions are based in part on the work of the FreeType Team. Full original notices and LGPLv3/GPLv3 terms are provided with the application and source materials.

Download **LawyerDesk-license-source-materials.tar.gz**, at no additional charge, from the same [LawyerDesk 0.1.0-beta.3 release](https://github.com/wuwenrui/deepseek-harness-desktop/releases/tag/lawyerdesk-v0.1.0-beta.3) as the application. Check the release's SHA256SUMS.txt before extraction.

**Uncombined source form:** individual libraries are supplied separately under `licenses/libvips/sources/`, rather than only as the combined dylib. `licenses/libvips/source-inputs.json` and `sources.json` locate each exact component archive and the four patches. The pinned recipe-source archive and readable `upstream/recipes/posix.sh` contain the actual configure options, inline edits and combination commands. Apply those component-specific changes when reconstructing the corresponding work; an untouched upstream archive alone is not the whole build description. LGPL components remain available under their original LGPL grants. The released librsvg lock and its registry/workspace source closure are included; this is not a claim of reproducing the upstream binary's final Cargo lock or bit-identical build.

This uses independent complete source form for the internal-library obligations, not a promise to supply prebuilt uncombined object archives. For the application-to-library boundary, the package uses the runtime shared-library mechanism. These are distinct obligations; replaceability does not dispense with the accompanying sources, modifications or notices.

## Replace the library in your own application copy

Quit LawyerDesk. Keep the original application and real case data untouched. Copy the app to a new, user-owned location. Build an ARM64, interface-compatible replacement using the supplied component sources, patches and recipe, preserving the public ABI and dependency loading conventions.

The library path inside that copy is:

```text
Contents/Resources/app.asar.unpacked/node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips-cpp.8.18.3.dylib
```

Replace that file; do not modify `app.asar` or its integrity metadata. If the rebuilt dylib requires a local Mach-O signature, you may use `codesign --force --sign - <your-copy-library-path>` to apply an ad-hoc signature to **your file**. This does not require the distributor's Developer ID/private key and is not Apple notarization. Do not disable Gatekeeper globally. OS-managed devices may impose separate administrative restrictions.

Launch the copied app with an empty, separate `LAWYER_DESKTOP_HOME` for testing. Library modification and reverse engineering to debug such modifications are permitted; no first-party product restriction overrides these LGPL rights. This release has no automatic updater that restores the original library. Retain your modified copy separately when manually installing a later release.

## Representative verification supplied by the release process

From a prepared source checkout, `node scripts/test-modified-libvips.mjs --product-root <lawyerDesk-directory>` creates its own disposable application copy. It checks the original dylib against the exact reviewed npm binary, changes its Mach-O identity while retaining ABI, applies an ad-hoc signature, actually loads it with sharp and performs PNG image conversion. It then launches the copy through the ordinary managed desktop bootstrap and verifies healthy startup without restoring the changed library. The original app is checked unchanged and the copy is removed afterwards.

The verification is evidence of byte-modified compatible-library loading, image processing and normal startup—not a full native source rebuild, an assertion about every possible library modification, or a downloaded/quarantined Finder installation test. Its machine-readable result is retained in the release verification record. Source availability and archive retention are separately checked.
