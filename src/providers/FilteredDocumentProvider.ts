import * as vscode from 'vscode';
import { FilterManager } from '../managers/FilterManager';

export class FilteredDocumentProvider implements vscode.TextDocumentContentProvider {
    static scheme = 'textanalysistoolpro';

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    constructor(private filterManager: FilterManager) {
        this.filterManager.onDidChangeFilters(() => {
            this.update(vscode.Uri.parse('textanalysistoolpro:FilteredView'));
        });
        vscode.workspace.onDidChangeTextDocument(event => {
            // Recompute only if active view is actually changing or when text changes in active regular editor.
            // Simplified here: always recompute.
            this.update(vscode.Uri.parse('textanalysistoolpro:FilteredView'));
        })
    }

    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        // Find an active text editor that IS NOT the virtual document to get the text.
        // It's tricky to track the "source" document if we switch to the virtual one.
        // For simplicity, we assume we process the last active file doc.
        const activeEditors = vscode.window.visibleTextEditors;
        let sourceDoc = activeEditors.find(e => e.document.uri.scheme !== FilteredDocumentProvider.scheme)?.document;

        if (!sourceDoc) {
            return "No valid source document open to filter.";
        }

        const filters = this.filterManager.getFilters().filter(f => f.isEnabled);
        if (filters.length === 0) {
            return "No filters active.";
        }

        const matchedLines: string[] = [];

        for (let i = 0; i < sourceDoc.lineCount; i++) {
            const lineData = sourceDoc.lineAt(i);
            const lineText = lineData.text;
            let match = false;

            for (const filter of filters) {
                if (filter.isRegex) {
                    try {
                        const regex = new RegExp(filter.text, filter.isMatchCase ? '' : 'i');
                        match = regex.test(lineText);
                    } catch (e) {
                        // invalid regex
                    }
                } else {
                    if (filter.isMatchCase) {
                        match = lineText.includes(filter.text);
                    } else {
                        match = lineText.toLowerCase().includes(filter.text.toLowerCase());
                    }
                }

                if (match) {
                    matchedLines.push(lineText);
                    break; // No need to check other filters for this line once matched
                }
            }
        }

        return matchedLines.join('\n');
    }
}
