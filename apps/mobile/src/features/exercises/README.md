# Exercises Feature

Owns exercise library data, muscle groups, equipment metadata, and exercise selection screens.

- `ExerciseBrowser.tsx` is shared by the Exercises library, Session picker, and program exercise picker. It virtualizes all 400 bundled exercises and supports text search plus muscle-group/equipment filters. Filters are expanded by default on each new browser/picker mount; users can still collapse them without clearing their selections.
- `exerciseSearch.ts` normalizes catalog metadata, common muscle names, punctuation, and DB/BB/RDL abbreviations without platform or account dependencies.
- `repdbImages.ts` contains Metro-compatible static requires for the licensed local free-tier stills. Preserve IDs, the bundled license, and visible RepDB attribution when updating the catalog; do not use paid preview animations.
- Library detail pages show instructions and can open an exercise in Session. The Session screen waits for local restoration before handling this request, preserving existing logged exercises.
