# TextAnalysisToolPro

> A powerful VS Code extension inspired by [TextAnalysisTool.NET](https://textanalysistool.github.io/) — built for developers and engineers who need to make sense of large log files, traces, and any text-heavy output.

![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.80-blue?logo=visual-studio-code)
![Version](https://img.shields.io/badge/version-0.3.0-green)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## What is it?

TextAnalysisToolPro brings the best of **TextAnalysisTool.NET** into VS Code. Open any file — log, trace, CSV, anything — and instantly filter it down to just the lines that matter. Set up highlight colors, use regex, exclude noise, and jump between matches with a single keystroke.

Everything is non-destructive: the original file is never touched. You work on a live **Filtered View** that updates in real time as you tweak your filters.

---

## Features

### 🔍 Powerful Filtering
- **Include & Exclude** filters — highlight what you want, fade or hide what you don't
- **Regular expressions** with full regex engine support
- **Case-sensitive** matching when precision matters
- Filters are applied simultaneously; lines matching any include filter (and no exclude filter) are highlighted, while un-matched lines fade into the background.

### 🎨 Color Highlighting
- Assign custom **foreground and background colors** to each filter
- Instantly see which filter matched which line at a glance
- Colors are visible in both the Filtered View and the Filter Panel

### 📁 Filter Groups
- Organize filters into named **groups** (e.g. `errors`, `perf`, `auth`)
- **Only one group is active** at a time — switch between presets instantly
- **Create** new empty groups, or **clone** an existing group to branch your setup
- **Rename** and **delete** groups freely; the last group is always protected
- Each new document starts with a default group `unnamed_1`

### 📋 Filter Panel
- Dedicated sidebar panel listing all filters in the active group
- See **hit counts** (how many lines each filter matches) updated live
- Drag-and-drop to **reorder** filters
- Toggle individual filters on/off with a checkbox
- Double-click any row to jump straight to the editor for that filter

### ✏️ Filter Editor
- Sidebar panel for adding and editing filters
- Full control: text/regex, match case, include/exclude, colors, description
- Press `Enter` in the text field to save instantly

### ⌨️ Keyboard Navigation
- `Ctrl+H` (`Cmd+H` on Mac) — toggle filtering on/off, with smart cursor sync
- Press a filter's letter key (e.g. `a`, `b`, `c`) inside the Filtered View to jump to the **next match** for that filter
- `Shift+<letter>` to jump to the **previous match**

### 💾 Import & Export (`.tat` format)
- Fully compatible with **TextAnalysisTool.NET** `.tat` filter files
- Import a `.tat` file to load a saved set of filters into the active group
- Export the current group's filters to share with your team

---

## Getting Started

### 1. Open a File for Analysis

Use the command palette (`Ctrl+Shift+P`) and run:

```
TextAnalysisToolPro: Open File for Analysis
```

Or click the **Open File** button (📂) in the Filters panel toolbar.

This opens a **Filtered View** tab — a live virtual document driven by your filters.

### 2. Add Your First Filter

In the **Filter Editor** panel (left sidebar):

1. Type a word or regex pattern in the text field
2. Choose include/exclude, match case, and highlight colors
3. Click **Save Filter** (or press `Enter`)

The Filtered View updates instantly.

### 3. Organize with Groups

Use the **group bar** at the top of the Filters panel to:

| Button | Action |
|--------|--------|
| `+` | Create a new empty group |
| `⎘` | Clone the active group (copies all filters) |
| `✎` | Rename the active group |
| `🗑` | Delete the active group |

Click any group tab to make it active — only that group's filters are applied to the document.

---

## Commands

All commands are available via `Ctrl+Shift+P`:

| Command | Description |
|---------|-------------|
| `Open File for Analysis` | Open any file in a Filtered View |
| `Analyze Current File` | Open the currently active editor in a Filtered View |
| `Add Filter` | Focus the Filter Editor |
| `Import Filters` | Load a `.tat` filter file into the active group |
| `Export Filters` | Save the active group's filters to a `.tat` file |
| `Remove All Filters` | Clear all filters in the active group |
| `New Filter Group` | Create a new empty group |
| `Clone Filter Group` | Clone an existing group |
| `Rename Filter Group` | Rename a group |
| `Delete Filter Group` | Delete a group |
| `Toggle Filter Activation` | `Ctrl+H` — show full file / filtered view |

---

## Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `Ctrl+H` | Toggle filters on/off | Any editor |
| `a`–`z` | Jump to next match for filter with that letter | Filtered View |
| `Shift+a`–`Shift+z` | Jump to previous match | Filtered View |

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `textanalysistoolpro.defaultForegroundColor` | `#ffffff` | Default text color for new filters |
| `textanalysistoolpro.defaultBackgroundColor` | `#44475a` | Default background color for new filters |
| `textanalysistoolpro.unmatchedLinesOpacity` | `0.4` | Opacity (0.0 to 1.0) for lines that do not match any filter when in the full document view |

---

## Compatibility

- Reads and writes `.tat` files in the same XML format as **TextAnalysisTool.NET** — share filter files between the desktop app and VS Code seamlessly.

---

## License

[MIT](./LICENSE)
