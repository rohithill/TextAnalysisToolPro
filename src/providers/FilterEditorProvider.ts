import * as vscode from 'vscode';
import { Filter } from '../models/Filter';
import { FilterManager } from '../managers/FilterManager';

export class FilterEditorProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'filterEditorView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly filterManager: FilterManager
    ) {
        this.filterManager.onDidChangeActiveDocument(() => {
            this.clearForm();
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
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this.getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'saveFilter': {
                    const newFilter: Filter = {
                        id: data.id || Math.random().toString(36).substring(2, 9),
                        text: data.text,
                        isRegex: data.isRegex,
                        isMatchCase: data.isMatchCase,
                        isExclude: data.isExclude,
                        foregroundColor: data.foregroundColor,
                        backgroundColor: data.backgroundColor,
                        description: data.description,
                        isEnabled: data.isEnabled !== undefined ? data.isEnabled : true
                    };

                    if (!newFilter.foregroundColor) newFilter.foregroundColor = '#ffffff';
                    if (!newFilter.backgroundColor) newFilter.backgroundColor = '#2d2d30';

                    if (data.id) {
                        this.filterManager.updateFilter(newFilter);
                    } else {
                        this.filterManager.addFilter(newFilter);
                    }

                    // Clear the form after saving gracefully
                    this.clearForm();
                    break;
                }
            }
        });
    }

    public editFilter(filter: Filter) {
        if (this._view) {
            this._view.show?.(true); // Bring the view into focus
            this._view.webview.postMessage({ command: 'loadFilter', filter: filter });
        }
    }

    public clearForm() {
        if (this._view) {
            const config = vscode.workspace.getConfiguration('textanalysistoolpro');
            const defaultFg = config.get<string>('defaultForegroundColor') || '#ffffff';
            const defaultBg = config.get<string>('defaultBackgroundColor') || '#44475a';

            this._view.webview.postMessage({
                command: 'clearFilter',
                defaultFg: defaultFg,
                defaultBg: defaultBg
            });
        }
    }

    private getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Filter Editor</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-editor-foreground); }
        .form-group { margin-bottom: 12px; }
        label { display: block; margin-bottom: 4px; font-size: 12px; }
        input[type="text"] { width: 100%; box-sizing: border-box; padding: 4px; font-family: var(--vscode-editor-font-family); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
        .checkbox-group { display: flex; align-items: center; margin-bottom: 6px; font-size: 13px; }
        .checkbox-group input { margin-right: 6px; }
        .color-group { display: flex; align-items: center; margin-top: 8px; font-size: 13px; }
        .color-group input { margin-right: 8px; width: 40px; height: 24px; padding: 0; border: none; cursor: pointer; }
        button { width: 100%; padding: 6px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; margin-top: 15px; font-weight: bold; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); margin-top: 8px; }
        button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        fieldset { border: 1px solid var(--vscode-widget-border); margin: 0; padding: 10px; border-radius: 4px; }
        legend { font-size: 12px; font-weight: bold; padding: 0 4px; }
        #form-title { font-size: 14px; font-weight: bold; margin-bottom: 10px; text-transform: uppercase; }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div id="form-title">Add New Filter</div>
    <input type="hidden" id="filter-id" value="">
    <input type="hidden" id="filter-enabled" value="true">
    
    <div class="form-group">
        <label for="filter-text">Text or Regex Matcher</label>
        <input type="text" id="filter-text" placeholder="e.g., Error, Exception">
    </div>
    
    <div class="form-group">
        <label for="filter-desc">Description (Optional)</label>
        <input type="text" id="filter-desc" placeholder="e.g., Catches all fatal exceptions">
    </div>
    
    <div class="form-group">
        <div class="checkbox-group">
            <input type="checkbox" id="is-regex">
            <label for="is-regex">Regular Expression</label>
        </div>
        <div class="checkbox-group">
            <input type="checkbox" id="match-case">
            <label for="match-case">Match Case</label>
        </div>
        <div class="checkbox-group">
            <input type="checkbox" id="is-exclude">
            <label for="is-exclude">Exclude Lines</label>
        </div>
    </div>
    
    <fieldset>
        <legend>Highlight Colors</legend>
        <div class="color-group">
            <input type="color" id="fg-color" value="#ffffff">
            <label for="fg-color">Text</label>
        </div>
        <div class="color-group">
            <input type="color" id="bg-color" value="#44475a">
            <label for="bg-color">Background</label>
        </div>
    </fieldset>

    <button id="btn-save">Save Filter</button>
    <button id="btn-cancel" class="secondary hidden">Clear Form</button>

    <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('btn-save').addEventListener('click', () => {
            const text = document.getElementById('filter-text').value;
            if (!text) return; // Disallow empty saves
            
            vscode.postMessage({
                command: 'saveFilter',
                id: document.getElementById('filter-id').value || null,
                text: text,
                isRegex: document.getElementById('is-regex').checked,
                isMatchCase: document.getElementById('match-case').checked,
                isExclude: document.getElementById('is-exclude').checked,
                isEnabled: document.getElementById('filter-enabled').value === 'true',
                foregroundColor: document.getElementById('fg-color').value,
                backgroundColor: document.getElementById('bg-color').value,
                description: document.getElementById('filter-desc').value
            });
        });
        
        document.getElementById('btn-cancel').addEventListener('click', () => {
            vscode.postMessage({ command: 'clearFilter' });
            clearForm();
        });

        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'loadFilter':
                    const filter = message.filter;
                    document.getElementById('form-title').innerText = 'Edit Filter';
                    document.getElementById('filter-id').value = filter.id;
                    document.getElementById('filter-enabled').value = filter.isEnabled;
                    document.getElementById('filter-text').value = filter.text;
                    document.getElementById('filter-desc').value = filter.description || '';
                    document.getElementById('is-regex').checked = filter.isRegex;
                    document.getElementById('match-case').checked = filter.isMatchCase;
                    document.getElementById('is-exclude').checked = filter.isExclude;
                    document.getElementById('fg-color').value = filter.foregroundColor || '#ffffff';
                    document.getElementById('bg-color').value = filter.backgroundColor || '#44475a';
                    document.getElementById('btn-cancel').classList.remove('hidden');
                    document.getElementById('btn-save').innerText = 'Update Filter';
                    break;
                case 'clearFilter':
                    const defaultFg = message.defaultFg || '#ffffff';
                    const defaultBg = message.defaultBg || '#44475a';
                    clearForm(defaultFg, defaultBg);
                    break;
            }
        });

        function clearForm(defaultFg = '#ffffff', defaultBg = '#44475a') {
            document.getElementById('form-title').innerText = 'Add New Filter';
            document.getElementById('filter-id').value = '';
            document.getElementById('filter-enabled').value = 'true';
            document.getElementById('filter-text').value = '';
            document.getElementById('filter-desc').value = '';
            document.getElementById('is-regex').checked = false;
            document.getElementById('match-case').checked = false;
            document.getElementById('is-exclude').checked = false;
            // Use defaults
            document.getElementById('fg-color').value = defaultFg;
            document.getElementById('bg-color').value = defaultBg;
            document.getElementById('btn-cancel').classList.add('hidden');
            document.getElementById('btn-save').innerText = 'Save Filter';
        }
        
        // Return key in text submits
        document.getElementById('filter-text').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('btn-save').click();
            }
        });
    </script>
</body>
</html>`;
    }
}
