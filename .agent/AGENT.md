# TextAnalysisToolPro — Agent Context

## What this project is

A **VS Code extension** inspired by [TextAnalysisTool.NET](https://textanalysistool.github.io/).  
It lets users open any file (log, trace, CSV, etc.) in a non-destructive **Filtered View** and apply include/exclude filters with colour highlighting, regex support, and keyboard navigation.

- Publisher: `RohitHill`
- Repo: https://github.com/rohithill/TextAnalysisToolPro
- Language: **TypeScript** (compiled to `out/`)
- VS Code engine: `^1.80.0`
- Current version in `package.json`: check before tagging — always bump to match the new tag

---

## Architecture overview

```
src/
  extension.ts                  # Entry point — registers all commands, providers, keybindings
  Decorator.ts                  # Applies VS Code editor decorations (faded lines, colours)
  models/
    Filter.ts                   # Filter data model (id, text, isEnabled, isRegex, isMatchCase,
                                #   isExclude, foregroundColor, backgroundColor, letter,
                                #   description, groupId)
  managers/
    FilterManager.ts            # Core state — filters, groups, active URI, events
  providers/
    FiltersWebviewProvider.ts   # "Filters" sidebar panel (webview, group bar, filter table)
    FilterEditorProvider.ts     # "Filter Editor" sidebar panel (add/edit filter form)
    FilteredDocumentProvider.ts # Virtual document provider (scheme: textanalysistoolpro)
```

### Key concepts

| Concept | Detail |
|---|---|
| **Filtered View** | A virtual `TextDocument` with scheme `textanalysistoolpro`. URI path = `"/[Filtered] <filename>"`, URI query = source file URI string. |
| **Active document URI** | `FilterManager.getActiveDocumentUri()` returns the virtual URI string currently shown. `undefined` when a regular (non-filtered) file is focused. |
| **Filter groups** | Each virtual document has one or more named groups. Only one group is active at a time. Filters belong to a group. |
| **Filter panel state** | When `activeDocumentUri` is `undefined`, the Filters webview shows an "Analyse Current File" placeholder button (centred where the group bar normally lives). |
| **Decorator** | Applied to the full-document (unfiltered toggle) view; fades non-matching lines using `textanalysistoolpro.unmatchedLinesOpacity` setting. |
| **`.tat` format** | XML filter files compatible with TextAnalysisTool.NET. Import/export via `FilterManager`. |

---

## Build & workflow

```bash
# Compile TypeScript
npm run compile

# Watch mode (dev)
npm run watch

# Lint
npm run lint

# Run tests (requires VS Code, run in Extension Development Host)
npm test
```

After any source change, the VS Code **Extension Development Host** must be reloaded:  
`Ctrl+Shift+P` → **Developer: Reload Window**

---

## Versioning & release

- Tags follow **semver**: `v0.1.x` patch, `v0.x.0` minor, `vX.0.0` major.
- Latest tag as of writing: `v0.3.1`
- To release:
  1. Update `"version"` in `package.json` to match the new tag.
  2. Update `README.md` version badge if present.
  3. Commit, tag, push:
     ```bash
     git add -A
     git commit -m "chore: bump version to vX.Y.Z"
     git tag vX.Y.Z
     git push origin main --tags
     ```
  4. GitHub Actions (`.github/workflows/`) automatically builds and publishes the VSIX as a GitHub Release when a new tag is pushed.

> **Note:** `package.json` version and the git tag should always be kept in sync.

---

## Coding conventions

- **TypeScript strict mode** — `tsconfig.json` enforces it.
- **ESLint** — config in `.eslintrc.json`. Run `npm run lint` before committing.
- **No external runtime dependencies** — only `devDependencies` (types, eslint, mocha, vscode test).
- **Webview HTML** is inlined as template literals inside the provider classes (no separate HTML files).
  - Use VS Code CSS variables (`--vscode-*`) for all colours/fonts so the UI respects the user's theme.
  - All inter-webview communication goes through `vscode.postMessage` / `webview.onDidReceiveMessage`.
- **Events** — `FilterManager` exposes `onDidChangeFilters(uri)` and `onDidChangeActiveDocument()`. Providers subscribe to these to re-render.
- **Webview state** — both sidebar panels use `retainContextWhenHidden: true` to avoid losing state on tab switch.

---

## Important constraints

- **Never modify the source file.** All filtering is done on the virtual document; the original file is read-only.
- **Filtered View URI scheme** is `textanalysistoolpro`. Keybindings that should only fire inside the Filtered View use `when: "resourceScheme == 'textanalysistoolpro'"`.
- **The last filter group cannot be deleted** — always guard with `groups.length <= 1`.
- **`.tat` files** in the repo root (`mmode_new.tat`, `mmode filter.tat`) are **sample/test data**, not source code. Do not delete them.
- **`out/`** is the compiled output — never edit files there directly.

---

## Tests

- Framework: **Mocha** via `@vscode/test-electron`
- Test entry: `src/test/runTest.ts` → `src/test/suite/extension.test.ts`
- Tests run inside a real VS Code Extension Development Host.
- Add a test case for any non-trivial new behaviour, especially around filter matching logic and cursor sync.

---

## Settings contributed by the extension

| Setting ID | Default | Purpose |
|---|---|---|
| `textanalysistoolpro.defaultForegroundColor` | `#ffffff` | Default text colour for new filters |
| `textanalysistoolpro.defaultBackgroundColor` | `#44475a` | Default background colour for new filters |
| `textanalysistoolpro.unmatchedLinesOpacity` | `0.4` | Opacity for faded lines in full-document view |
| `textanalysistoolpro.activeLineHighlightColor` | `#6996ff` | Background color for the active cursor line |
| `textanalysistoolpro.autoLoadFilters` | `{}` | JSON map of group names to `.tat` file paths applied on open |

---

## Commands reference

| Command ID | Title | Notes |
|---|---|---|
| `textanalysistoolpro.showFiltered` | Open File for Analysis | Shows file picker |
| `textanalysistoolpro.analyzeCurrentFile` | Analyze Current File | Uses active editor |
| `textanalysistoolpro.addFilter` | Add Filter | Focuses Filter Editor panel |
| `textanalysistoolpro.editFilter` | Edit Filter | Takes `{ filter }` node arg |
| `textanalysistoolpro.removeFilter` | Remove Filter | Takes `{ filter }` node arg |
| `textanalysistoolpro.toggleFilter` | Toggle Filter Enable | Takes `{ filter }` node arg |
| `textanalysistoolpro.removeAllFilters` | Remove All Filters | Confirms before clearing |
| `textanalysistoolpro.importFilters` | Import Filters | Reads `.tat` XML |
| `textanalysistoolpro.exportFilters` | Export Filters | Writes `.tat` XML |
| `textanalysistoolpro.toggleFilterActivation` | Toggle Filter Activation | `Ctrl+H` — smart cursor sync |
| `textanalysistoolpro.goToNextMatch` | Go To Next Match | Arg: letter string |
| `textanalysistoolpro.goToPreviousMatch` | Go To Previous Match | Arg: letter string |
| `textanalysistoolpro.createGroup` | New Filter Group | |
| `textanalysistoolpro.cloneGroup` | Clone Filter Group | |
| `textanalysistoolpro.renameGroup` | Rename Filter Group | |
| `textanalysistoolpro.deleteGroup` | Delete Filter Group | Guards last group |
