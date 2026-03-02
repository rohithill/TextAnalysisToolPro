import * as vscode from 'vscode';
import { FilterManager } from '../managers/FilterManager';

export class FilteredDocumentProvider implements vscode.TextDocumentContentProvider {
    static scheme = 'textanalysistoolpro';

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    private activeUris: Set<string> = new Set();

    constructor(private filterManager: FilterManager) {
        this.filterManager.onDidChangeFilters((uri) => {
            // If the filters changed for a specific document, refresh its virtual view
            if (this.activeUris.has(uri)) {
                this.update(vscode.Uri.parse(uri));
            }
        });

        // Track closed virtual documents to prevent memory leaks
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.uri.scheme === FilteredDocumentProvider.scheme) {
                this.activeUris.delete(doc.uri.toString());
            }
        });
    }

    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        // Assume uri query contains real file path
        if (!uri.query) {
            return "No underlying source file provided.";
        }

        const realUri = vscode.Uri.parse(uri.query);
        this.activeUris.add(uri.toString());

        let sourceText = "";
        try {
            const data = await vscode.workspace.fs.readFile(realUri);
            sourceText = Buffer.from(data).toString('utf8');
        } catch (e) {
            return `Failed to load source file: ${e}`;
        }

        const filters = this.filterManager.getFilters(uri.toString()).filter(f => f.isEnabled);

        // As requested: If user has not added any filter, or if filters are toggled off via Ctrl+H, full content is displayed by default.
        if (filters.length === 0 || !this.filterManager.isFiltersActivated(uri.toString())) {
            // Unfiltered: virtual lines map 1:1 with source lines
            const allIndices = Array.from({ length: sourceText.split(/\r?\n/).length }, (_, i) => i);
            this.filterManager.setLineMatchCache(uri.toString(), allIndices);
            return sourceText;
        }

        const matchedLines: string[] = [];
        const mappedIndices: number[] = [];
        const lines = sourceText.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i];
            let matchInclude = false;
            let matchExclude = false;

            for (const filter of filters) {
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

                if (match) {
                    if (filter.isExclude) {
                        matchExclude = true;
                        break;
                    } else {
                        if (!matchInclude) {
                            matchInclude = true;
                        }
                    }
                }
            }

            if (matchInclude && !matchExclude) {
                matchedLines.push(lineText);
                mappedIndices.push(i);
            }
        }

        this.filterManager.setLineMatchCache(uri.toString(), mappedIndices);
        return matchedLines.join('\n');
    }
}
