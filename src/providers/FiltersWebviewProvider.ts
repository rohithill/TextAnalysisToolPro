import * as vscode from 'vscode';
import { FilterManager } from '../managers/FilterManager';

export class FiltersWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'filtersView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _filterManager: FilterManager
    ) {
        // Listen to filter updates
        this._filterManager.onDidChangeFilters((uri) => {
            if (this._filterManager.getActiveDocumentUri() === uri) {
                this._updateWebview();
            }
        });

        // Listen to active document changes
        this._filterManager.onDidChangeActiveDocument(() => {
            this._updateWebview();
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'toggleFilter':
                    this._filterManager.toggleFilterEnable(message.id);
                    break;
                case 'removeFilter':
                    this._filterManager.removeFilter(message.id);
                    break;
                case 'editFilter': {
                    const filter = this._filterManager.getFilters(this._filterManager.getActiveDocumentUri()!).find(f => f.id === message.id);
                    if (filter) {
                        vscode.commands.executeCommand('textanalysistoolpro.editFilter', { filter });
                    }
                    break;
                }
                case 'moveFilter':
                    this._filterManager.moveFilter(message.oldIndex, message.newIndex);
                    break;

                // --- Group messages ---
                case 'createGroup':
                    this._filterManager.addGroup();
                    break;
                case 'cloneGroup':
                    this._filterManager.cloneGroup(message.groupId);
                    break;
                case 'setActiveGroup':
                    this._filterManager.setActiveGroup(message.groupId);
                    break;
                case 'deleteGroup': {
                    const groups = this._filterManager.getGroups();
                    if (groups.length <= 1) {
                        vscode.window.showWarningMessage('Cannot delete the last remaining group.');
                        return;
                    }
                    const group = groups.find(g => g.id === message.groupId);
                    const confirm = await vscode.window.showWarningMessage(
                        `Delete group "${group?.name}"? All its filters will be removed.`,
                        { modal: true },
                        'Delete'
                    );
                    if (confirm === 'Delete') {
                        this._filterManager.removeGroup(message.groupId);
                    }
                    break;
                }
                case 'renameGroup': {
                    const group = this._filterManager.getGroups().find(g => g.id === message.groupId);
                    const newName = await vscode.window.showInputBox({
                        prompt: 'Enter new group name',
                        value: group?.name || '',
                        validateInput: v => v.trim() ? undefined : 'Name cannot be empty'
                    });
                    if (newName && newName.trim()) {
                        this._filterManager.renameGroup(message.groupId, newName.trim());
                    }
                    break;
                }
            }
        });

        this._updateWebview();
    }

    private async _updateWebview() {
        if (!this._view) return;

        const activeUriString = this._filterManager.getActiveDocumentUri();
        if (!activeUriString) {
            this._view.webview.postMessage({ type: 'updateGroups', groups: [], filters: [], activeGroupId: undefined });
            return;
        }

        const groups = this._filterManager.getGroups(activeUriString);
        const activeGroupId = this._filterManager.getActiveGroupId(activeUriString);
        const filters = this._filterManager.getFilters(activeUriString);
        let lines: string[] = [];

        try {
            const virtualUri = vscode.Uri.parse(activeUriString);
            const realUri = vscode.Uri.parse(virtualUri.query);
            const fileData = await vscode.workspace.fs.readFile(realUri);
            lines = fileData.toString().split(/\r?\n/);
        } catch (e) {
            // Ignore error
        }

        const filterData = filters.map(filter => {
            let hitCount = 0;
            for (const lineText of lines) {
                let match = false;
                if (filter.isRegex) {
                    try {
                        const regex = new RegExp(filter.text, filter.isMatchCase ? '' : 'i');
                        match = regex.test(lineText);
                    } catch (e) { }
                } else {
                    if (filter.isMatchCase) {
                        match = lineText.includes(filter.text);
                    } else {
                        match = lineText.toLowerCase().includes(filter.text.toLowerCase());
                    }
                }
                if (match) hitCount++;
            }

            return {
                ...filter,
                hitCount,
                letterStr: filter.letter ? filter.letter : ' ',
                mods: [
                    filter.isRegex ? '[R]' : '',
                    filter.isMatchCase ? '[Aa]' : '',
                    filter.isExclude ? '[!]' : ''
                ].filter(Boolean).join(' ')
            };
        });

        const groupData = groups.map(g => ({ id: g.id, name: g.name }));

        this._view.webview.postMessage({ type: 'updateGroups', groups: groupData, filters: filterData, activeGroupId });
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Filters</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: transparent;
            padding: 0;
            margin: 0;
            user-select: none;
        }

        /* ── Group bar ──────────────────────────────────── */
        #group-bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 2px;
            padding: 4px 4px 0 4px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .group-tab {
            padding: 2px 8px;
            border: 1px solid var(--vscode-panel-border);
            border-bottom: none;
            border-radius: 4px 4px 0 0;
            cursor: pointer;
            font-size: 11px;
            opacity: 0.7;
            background: var(--vscode-editor-background);
            white-space: nowrap;
        }
        .group-tab:hover { opacity: 1; }
        .group-tab.active {
            opacity: 1;
            background: var(--vscode-tab-activeBackground, var(--vscode-sideBar-background));
            border-bottom: 2px solid var(--vscode-focusBorder);
            font-weight: bold;
        }
        #group-actions {
            display: flex;
            gap: 2px;
            margin-left: auto;
            padding-right: 2px;
        }
        .group-btn {
            background: none;
            border: 1px solid var(--vscode-panel-border);
            color: var(--vscode-foreground);
            cursor: pointer;
            border-radius: 3px;
            padding: 1px 5px;
            font-size: 11px;
            opacity: 0.7;
        }
        .group-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

        /* ── Filter table ───────────────────────────────── */
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: auto;
        }
        th, td {
            text-align: left;
            padding: 4px 6px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            border-bottom: 1px solid var(--vscode-panel-border);
            border-right: 1px solid var(--vscode-panel-border);
        }
        th:last-child, td:last-child { border-right: none; }
        th {
            font-weight: 600;
            position: sticky;
            top: 0;
            background: var(--vscode-sideBar-background);
            z-index: 10;
            resize: horizontal;
            overflow: auto;
        }
        tr.enabled { opacity: 1; }

        .actions { display: flex; gap: 4px; }
        .icon { cursor: pointer; opacity: 0.7; }
        .icon:hover { opacity: 1; }
        input[type="checkbox"] { cursor: pointer; }

        /* Drag and Drop */
        tr.draggable { cursor: grab; }
        tr.draggable:active { cursor: grabbing; }
        tr.drag-over-top { border-top: 2px solid var(--vscode-focusBorder); }
        tr.drag-over-bottom { border-bottom: 2px solid var(--vscode-focusBorder); }
        tr.dragging { opacity: 0.4; }

        #empty-hint {
            padding: 8px;
            font-size: 11px;
            opacity: 0.6;
            font-style: italic;
        }
    </style>
</head>
<body>
    <!-- Group bar -->
    <div id="group-bar">
        <div id="group-tabs"></div>
        <div id="group-actions">
            <button class="group-btn" id="btn-new-group"    title="New group">+</button>
            <button class="group-btn" id="btn-clone-group"  title="Clone active group">⎘</button>
            <button class="group-btn" id="btn-rename-group" title="Rename active group">✎</button>
            <button class="group-btn" id="btn-delete-group" title="Delete active group">🗑</button>
        </div>
    </div>

    <!-- Filter table -->
    <table id="filtersTable">
        <thead>
            <tr>
                <th style="width: 24px;"></th>
                <th style="width: 24px;">Ch</th>
                <th style="width: 80px;">Modifiers</th>
                <th style="min-width: 100px;">Pattern</th>
                <th style="min-width: 100px;">Description</th>
                <th style="width: 40px;">Hits</th>
                <th style="width: 40px;">Acts</th>
            </tr>
        </thead>
        <tbody id="filtersBody">
        </tbody>
    </table>
    <div id="empty-hint" style="display:none">No filters in this group. Add one via the Filter Editor.</div>

    <script>
        const vscode = acquireVsCodeApi();
        const tbody = document.getElementById('filtersBody');
        const groupTabs = document.getElementById('group-tabs');
        const emptyHint = document.getElementById('empty-hint');

        let currentGroups = [];
        let currentActiveGroupId = null;

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'updateGroups') {
                currentGroups = message.groups;
                currentActiveGroupId = message.activeGroupId;
                renderGroups(message.groups, message.activeGroupId);
                renderFilters(message.filters);
            }
        });

        // ── Group bar ───────────────────────────────────────────────────────
        function renderGroups(groups, activeGroupId) {
            groupTabs.innerHTML = '';
            groups.forEach(g => {
                const tab = document.createElement('span');
                tab.className = 'group-tab' + (g.id === activeGroupId ? ' active' : '');
                tab.textContent = g.name || '(unnamed)';
                tab.title = g.name;
                tab.onclick = () => vscode.postMessage({ type: 'setActiveGroup', groupId: g.id });
                groupTabs.appendChild(tab);
            });
        }

        document.getElementById('btn-new-group').onclick = () =>
            vscode.postMessage({ type: 'createGroup' });

        document.getElementById('btn-clone-group').onclick = () => {
            if (currentActiveGroupId) {
                vscode.postMessage({ type: 'cloneGroup', groupId: currentActiveGroupId });
            }
        };

        document.getElementById('btn-rename-group').onclick = () => {
            if (currentActiveGroupId) {
                vscode.postMessage({ type: 'renameGroup', groupId: currentActiveGroupId });
            }
        };

        document.getElementById('btn-delete-group').onclick = () => {
            if (currentActiveGroupId) {
                vscode.postMessage({ type: 'deleteGroup', groupId: currentActiveGroupId });
            }
        };

        // ── Filter table ────────────────────────────────────────────────────
        let draggedRow = null;

        function renderFilters(filters) {
            tbody.innerHTML = '';

            if (filters.length === 0) {
                emptyHint.style.display = 'block';
                return;
            }
            emptyHint.style.display = 'none';

            filters.forEach((f, index) => {
                const tr = document.createElement('tr');
                tr.className = f.isEnabled ? 'enabled draggable' : 'disabled draggable';
                tr.ondblclick = () => vscode.postMessage({ type: 'editFilter', id: f.id });

                tr.draggable = true;
                tr.dataset.index = index;

                tr.addEventListener('dragstart', (e) => {
                    draggedRow = tr;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index);
                    tr.classList.add('dragging');
                });

                tr.addEventListener('dragend', (e) => {
                    tr.classList.remove('dragging');
                    draggedRow = null;
                    clearDragStyles();
                });

                tr.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (draggedRow === tr) return;
                    clearDragStyles();
                    const rect = tr.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) {
                        tr.classList.add('drag-over-top');
                    } else {
                        tr.classList.add('drag-over-bottom');
                    }
                });

                tr.addEventListener('dragleave', (e) => {
                    tr.classList.remove('drag-over-top');
                    tr.classList.remove('drag-over-bottom');
                });

                tr.addEventListener('drop', (e) => {
                    e.preventDefault();
                    clearDragStyles();
                    if (!draggedRow || draggedRow === tr) return;
                    const oldIndex = parseInt(draggedRow.dataset.index, 10);
                    let newIndex = parseInt(tr.dataset.index, 10);
                    const rect = tr.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY >= midY) { newIndex++; }
                    if (oldIndex !== newIndex) {
                        vscode.postMessage({ type: 'moveFilter', oldIndex, newIndex });
                    }
                });

                // Colors
                tr.style.color = f.foregroundColor;
                tr.style.backgroundColor = f.backgroundColor;

                // Checkbox
                const tdCheck = document.createElement('td');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = f.isEnabled;
                cb.onchange = () => vscode.postMessage({ type: 'toggleFilter', id: f.id });
                tdCheck.appendChild(cb);
                tr.appendChild(tdCheck);

                // Letter
                const tdLetter = document.createElement('td');
                tdLetter.textContent = f.letterStr;
                tr.appendChild(tdLetter);

                // Mods
                const tdMods = document.createElement('td');
                tdMods.textContent = f.mods;
                tr.appendChild(tdMods);

                // Pattern
                const tdPattern = document.createElement('td');
                tdPattern.textContent = f.text;
                tr.appendChild(tdPattern);

                // Description
                const tdDesc = document.createElement('td');
                tdDesc.textContent = f.description || '';
                tr.appendChild(tdDesc);

                // Hits
                const tdHits = document.createElement('td');
                tdHits.textContent = f.hitCount;
                tr.appendChild(tdHits);

                // Actions
                const tdActions = document.createElement('td');
                tdActions.className = 'actions';

                const editBtn = document.createElement('span');
                editBtn.innerHTML = '✎';
                editBtn.className = 'icon';
                editBtn.title = 'Edit';
                editBtn.onclick = () => vscode.postMessage({ type: 'editFilter', id: f.id });

                const deleteBtn = document.createElement('span');
                deleteBtn.innerHTML = '❌';
                deleteBtn.className = 'icon';
                deleteBtn.title = 'Remove';
                deleteBtn.onclick = () => vscode.postMessage({ type: 'removeFilter', id: f.id });

                tdActions.appendChild(editBtn);
                tdActions.appendChild(deleteBtn);
                tr.appendChild(tdActions);

                tbody.appendChild(tr);
            });
        }

        function clearDragStyles() {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(r => {
                r.classList.remove('drag-over-top');
                r.classList.remove('drag-over-bottom');
            });
        }
    </script>
</body>
</html>`;
    }
}
