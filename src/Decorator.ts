import * as vscode from 'vscode';
import { FilterManager } from './managers/FilterManager';

export class Decorator {
    private activeEditor: vscode.TextEditor | undefined;
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();

    constructor(private filterManager: FilterManager) {
        this.activeEditor = vscode.window.activeTextEditor;

        vscode.window.onDidChangeActiveTextEditor(editor => {
            this.activeEditor = editor;
            if (editor) {
                this.updateDecorations();
            }
        });

        vscode.workspace.onDidChangeTextDocument(event => {
            if (this.activeEditor && event.document === this.activeEditor.document) {
                this.updateDecorations();
            }
        });

        this.filterManager.onDidChangeFilters(() => {
            this.clearDecorations();
            this.updateDecorations();
        });
    }

    private clearDecorations() {
        if (!this.activeEditor) { return; }
        for (const [id, decorationType] of this.decorationTypes) {
            this.activeEditor.setDecorations(decorationType, []);
            decorationType.dispose();
        }
        this.decorationTypes.clear();
    }

    private updateDecorations() {
        if (!this.activeEditor) { return; }

        const filters = this.filterManager.getFilters().filter(f => f.isEnabled);
        const text = this.activeEditor.document.getText();

        // Prepare new decoration types for active filters if not present
        filters.forEach(filter => {
            if (!this.decorationTypes.has(filter.id)) {
                this.decorationTypes.set(filter.id, vscode.window.createTextEditorDecorationType({
                    backgroundColor: filter.backgroundColor || 'rgba(255, 255, 0, 0.3)', // Default highlight
                    color: filter.foregroundColor
                }));
            }
        });

        // Compute matches per filter
        const decorationsMap = new Map<string, vscode.DecorationOptions[]>();
        filters.forEach(f => decorationsMap.set(f.id, []));

        // Iterate line by line to support potentially huge files better than giant matching
        // In a real optimized scenario, we'd limit this or do it asynchronously
        for (let i = 0; i < this.activeEditor.document.lineCount; i++) {
            const line = this.activeEditor.document.lineAt(i);
            const lineText = line.text;

            for (const filter of filters) {
                let match = false;
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
                    const range = line.range;
                    const decoration = { range };
                    decorationsMap.get(filter.id)?.push(decoration);
                    // A line might be highlighted by multiple filters. 
                    // Visual priority will be based on the order of decoration application.
                }
            }
        }

        // Apply
        for (const [id, decorations] of decorationsMap) {
            const type = this.decorationTypes.get(id);
            if (type) {
                this.activeEditor.setDecorations(type, decorations);
            }
        }
    }
}
