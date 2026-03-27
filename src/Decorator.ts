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

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('textanalysistoolpro.unmatchedLinesOpacity')) {
                this.clearDecorations();
                this.updateDecorations();
            }
        });
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

        // Instead of mapping decorations to individual pre-existing filter types,
        // we map the EXACT winning foreground/background combination of the line 
        // to a dynamically created DecorationType so that colors blend perfectly down the hierarchy.
        const dynamicDecorations: Map<string, vscode.DecorationOptions[]> = new Map();

        // Define default fallback strings to check against "missing" xml
        const defaultFg = '#ffffff';
        const defaultBg = '#2d2d30';
        const defaultBgAlt = '#44475a';

        const hasIncludeFilters = filters.some(f => !f.isExclude);

        for (let i = 0; i < this.activeEditor.document.lineCount; i++) {
            const line = this.activeEditor.document.lineAt(i);
            const lineText = line.text;

            let winningFg: string | undefined;
            let winningBg: string | undefined;
            // If there are no include filters, everything is included by default unless excluded
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
                    // Determine the final colors
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
                // Lines that don't match or are excluded appear faded when filters are unchecked
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

        // Apply dynamically constructed decorations and clear old ones
        for (const [key, type] of this.decorationTypes) {
            const options = dynamicDecorations.get(key) || [];
            this.activeEditor.setDecorations(type, options);
        }
    }
}
