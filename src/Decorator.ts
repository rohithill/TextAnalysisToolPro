import * as vscode from 'vscode';
import { FilterManager } from './managers/FilterManager';

export class Decorator {
    private activeEditor: vscode.TextEditor | undefined;
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    // Cursor highlight type is recreated after filter types so it has a higher
    // internal VS Code decoration ID and always renders on top of filter backgrounds.
    private cursorLineDecorationType: vscode.TextEditorDecorationType | undefined;

    constructor(private filterManager: FilterManager) {
        this.activeEditor = vscode.window.activeTextEditor;

        vscode.window.onDidChangeActiveTextEditor(editor => {
            this.activeEditor = editor;
            if (editor) {
                this.updateDecorations();
            }
        });

        vscode.window.onDidChangeTextEditorSelection(event => {
            if (this.activeEditor &&
                event.textEditor.document.uri.toString() === this.activeEditor.document.uri.toString()) {
                this.activeEditor = event.textEditor;
                this.updateCursorLineHighlight();
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

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('textanalysistoolpro.unmatchedLinesOpacity') ||
                e.affectsConfiguration('textanalysistoolpro.activeLineHighlightColor')) {
                this.clearDecorations();
                this.updateDecorations();
            }
        });

        if (this.activeEditor) {
            this.updateDecorations();
        }
    }

    /**
     * Dispose and recreate cursorLineDecorationType so it is always assigned a
     * higher internal VS Code decoration ID than the filter decoration types
     * created in updateDecorations(). Higher ID = rendered on top.
     */
    private recreateCursorLineDecorationType() {
        if (this.activeEditor && this.cursorLineDecorationType) {
            this.activeEditor.setDecorations(this.cursorLineDecorationType, []);
        }
        this.cursorLineDecorationType?.dispose();
        // Use solid 6-digit hex — VS Code decoration renderer does not support
        // 8-digit hex (#rrggbbaa) or rgba() for backgroundColor.
        const config = vscode.workspace.getConfiguration('textanalysistoolpro');
        const highlightColor = config.get<string>('activeLineHighlightColor', '#6996ff');
        this.cursorLineDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: highlightColor,
            borderColor: highlightColor,
            borderWidth: '1px',
            borderStyle: 'solid',
            isWholeLine: true,
        });
    }

    private updateCursorLineHighlight() {
        if (!this.activeEditor || !this.activeEditor.selection || !this.cursorLineDecorationType) { return; }
        // Only highlight in the filtered view, not in regular source files.
        if (this.activeEditor.document.uri.scheme !== 'textanalysistoolpro') {
            this.activeEditor.setDecorations(this.cursorLineDecorationType, []);
            return;
        }
        const activeLine = this.activeEditor.selection.active.line;
        const lineRange = this.activeEditor.document.lineAt(activeLine).range;
        this.activeEditor.setDecorations(this.cursorLineDecorationType, [{ range: lineRange }]);
    }

    private clearDecorations() {
        if (!this.activeEditor) { return; }
        for (const [/* id */, decorationType] of this.decorationTypes) {
            this.activeEditor.setDecorations(decorationType, []);
            decorationType.dispose();
        }
        this.decorationTypes.clear();
    }

    private updateDecorations() {
        if (!this.activeEditor) { return; }

        const uriString = this.activeEditor.document.uri.toString();
        const filters = this.filterManager.getFilters(uriString).filter(f => f.isEnabled);

        // Map the EXACT winning fg/bg combination → DecorationType so colors blend perfectly.
        const dynamicDecorations: Map<string, vscode.DecorationOptions[]> = new Map();

        const defaultFg = '#ffffff';
        const defaultBg = '#2d2d30';

        const hasIncludeFilters = filters.some(f => !f.isExclude);

        for (let i = 0; i < this.activeEditor.document.lineCount; i++) {
            const line = this.activeEditor.document.lineAt(i);
            const lineText = line.text;

            let winningFg: string | undefined;
            let winningBg: string | undefined;
            let matchInclude = !hasIncludeFilters;
            let matchExclude = false;

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
                    if (filter.isExclude) {
                        matchExclude = true;
                    } else if (!matchInclude) {
                        matchInclude = true;
                        winningFg = filter.foregroundColor;
                        winningBg = filter.backgroundColor;
                    }
                }
            }

            if (matchInclude && !matchExclude) {
                if (winningFg || winningBg) {
                    const finalFg = winningFg || defaultFg;
                    const finalBg = winningBg || defaultBg;
                    const key = `${finalFg}_${finalBg}`;

                    if (!dynamicDecorations.has(key)) {
                        dynamicDecorations.set(key, []);
                        if (!this.decorationTypes.has(key)) {
                            this.decorationTypes.set(key, vscode.window.createTextEditorDecorationType({
                                color: finalFg,
                                backgroundColor: finalBg,
                                isWholeLine: true
                            }));
                        }
                    }
                    dynamicDecorations.get(key)!.push({ range: line.range });
                }
            } else if (filters.length > 0) {
                const config = vscode.workspace.getConfiguration('textanalysistoolpro');
                const matchedOpacity = config.get<number>('unmatchedLinesOpacity', 0.4);

                const key = `faded_unmatched_${matchedOpacity}`;
                if (!dynamicDecorations.has(key)) {
                    dynamicDecorations.set(key, []);
                    if (!this.decorationTypes.has(key)) {
                        this.decorationTypes.set(key, vscode.window.createTextEditorDecorationType({
                            opacity: matchedOpacity.toString()
                        }));
                    }
                }
                dynamicDecorations.get(key)!.push({ range: line.range });
            }
        }

        // Apply filter decorations first.
        for (const [key, type] of this.decorationTypes) {
            const options = dynamicDecorations.get(key) || [];
            this.activeEditor.setDecorations(type, options);
        }

        // Recreate cursor type AFTER all filter types so its internal ID is higher
        // (higher ID = rendered on top in VS Code's decoration system).
        this.recreateCursorLineDecorationType();
        this.updateCursorLineHighlight();
    }
}
