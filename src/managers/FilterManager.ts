import * as vscode from 'vscode';
import { Filter } from '../models/Filter';

export class FilterManager {
    // Map of Virtual Document URI String -> Array of Filters
    private filtersByUri: Map<string, Filter[]> = new Map();

    // Map of Virtual Document URI String -> Boolean (whether filters are activated or toggled off)
    private isActivatedByUri: Map<string, boolean> = new Map();

    // The currently focused Virtual Document URI (or undefined if examining a non-filtered file)
    private activeDocumentUri: string | undefined;

    private onDidChangeFiltersEmitter = new vscode.EventEmitter<string>();
    public readonly onDidChangeFilters = this.onDidChangeFiltersEmitter.event;

    private onDidChangeActiveDocumentEmitter = new vscode.EventEmitter<string | undefined>();
    public readonly onDidChangeActiveDocument = this.onDidChangeActiveDocumentEmitter.event;

    // Map of Virtual Document URI String -> Array of Source Line Numbers
    // Used to map a virtual line back to its original file line number
    private lineMatchCache: Map<string, number[]> = new Map();

    constructor() { }

    public setLineMatchCache(uri: string, matches: number[]) {
        this.lineMatchCache.set(uri, matches);
    }

    public getSourceLineFromVirtualLine(uri: string, virtualLine: number): number | undefined {
        const matches = this.lineMatchCache.get(uri);
        if (matches && virtualLine >= 0 && virtualLine < matches.length) {
            return matches[virtualLine];
        }
        return undefined;
    }

    public getVirtualLineFromSourceLine(uri: string, sourceLine: number): number | undefined {
        const matches = this.lineMatchCache.get(uri);
        if (!matches) return undefined;

        // Find the first virtual line that corresponds to this source line or the nearest subsequent matched line
        for (let vLine = 0; vLine < matches.length; vLine++) {
            if (matches[vLine] >= sourceLine) {
                return vLine;
            }
        }

        // If the source line is beyond all matches, return the last virtual line
        return matches.length > 0 ? matches.length - 1 : undefined;
    }

    public setActiveDocumentUri(uri: string | undefined) {
        if (this.activeDocumentUri !== uri) {
            this.activeDocumentUri = uri;
            this.onDidChangeActiveDocumentEmitter.fire(uri);
        }
    }

    public getActiveDocumentUri(): string | undefined {
        return this.activeDocumentUri;
    }

    public getFilters(uri?: string): Filter[] {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return [];
        return this.filtersByUri.get(targetUri) || [];
    }

    public isFiltersActivated(uri?: string): boolean {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return true;
        // Default to true if not explicitly toggled off
        return this.isActivatedByUri.get(targetUri) !== false;
    }

    public toggleFiltersActivation(uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const current = this.isFiltersActivated(targetUri);
        this.isActivatedByUri.set(targetUri, !current);
        this.onDidChangeFiltersEmitter.fire(targetUri);
    }

    public addFilter(filter: Filter, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) {
            vscode.window.showWarningMessage('Please select a Filtered View tab before adding a filter.');
            return;
        }

        const filters = this.getFilters(targetUri);

        // Assign a letter 'a'-'z' to the new filter if one is available
        const usedLetters = new Set(filters.map(f => f.letter).filter(Boolean));
        let nextLetter: string | undefined = undefined;
        for (let i = 0; i < 26; i++) {
            const char = String.fromCharCode(97 + i); // 'a' is 97
            if (!usedLetters.has(char)) {
                nextLetter = char;
                break;
            }
        }
        filter.letter = nextLetter;

        filters.push(filter);
        this.filtersByUri.set(targetUri, filters);
        this.onDidChangeFiltersEmitter.fire(targetUri);
    }

    public removeFilter(id: string, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        let filters = this.getFilters(targetUri);
        filters = filters.filter(f => f.id !== id);

        // Reassign letters so there are no gaps
        filters.forEach((f, index) => {
            if (index < 26) {
                f.letter = String.fromCharCode(97 + index); // 'a' is 97
            } else {
                f.letter = undefined;
            }
        });

        this.filtersByUri.set(targetUri, filters);
        this.onDidChangeFiltersEmitter.fire(targetUri);
    }

    public toggleFilterEnable(id: string, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const filters = this.getFilters(targetUri);
        const filter = filters.find(f => f.id === id);
        if (filter) {
            filter.isEnabled = !filter.isEnabled;
            this.filtersByUri.set(targetUri, filters);
            this.onDidChangeFiltersEmitter.fire(targetUri);
        }
    }

    public moveFilter(oldIndex: number, newIndex: number, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const filters = this.getFilters(targetUri);
        if (oldIndex < 0 || oldIndex >= filters.length || newIndex < 0 || newIndex > filters.length) {
            return;
        }

        // Remove the filter from the old index
        const [movedFilter] = filters.splice(oldIndex, 1);

        // Adjust newIndex if it was after the oldIndex (since we just removed an item)
        if (newIndex > oldIndex) {
            newIndex--;
        }

        // Insert the filter at the new index
        filters.splice(newIndex, 0, movedFilter);

        // Reassign letters so they remain sequential 'a'-'z' from top to bottom
        filters.forEach((f, index) => {
            if (index < 26) {
                f.letter = String.fromCharCode(97 + index); // 'a' is 97
            } else {
                f.letter = undefined;
            }
        });

        this.filtersByUri.set(targetUri, filters);
        this.onDidChangeFiltersEmitter.fire(targetUri);
    }

    public updateFilter(updatedFilter: Filter, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const filters = this.getFilters(targetUri);
        const index = filters.findIndex(f => f.id === updatedFilter.id);
        if (index !== -1) {
            // Preserve the original filter's letter if present
            updatedFilter.letter = filters[index].letter;
            filters[index] = updatedFilter;
            this.filtersByUri.set(targetUri, filters);
            this.onDidChangeFiltersEmitter.fire(targetUri);
        }
    }

    private escapeXml(unsafe: string): string {
        return unsafe.replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
    }

    private unescapeXml(safe: string): string {
        return safe.replace(/&(lt|gt|amp|apos|quot);/ig, (all, group) => {
            switch (group.toLowerCase()) {
                case 'lt': return '<';
                case 'gt': return '>';
                case 'amp': return '&';
                case 'apos': return '\'';
                case 'quot': return '"';
                default: return all;
            }
        });
    }

    public async importFilters() {
        if (!this.activeDocumentUri) {
            vscode.window.showWarningMessage('Please focus a Filtered View tab to import filters into.');
            return;
        }

        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'TextAnalysisTool Filters': ['tat'] }
        });
        if (uris && uris[0]) {
            try {
                const data = await vscode.workspace.fs.readFile(uris[0]);
                const xmlStr = data.toString();

                const loadedFilters: Filter[] = [];
                // Parse standard TextAnalysisTool.NET flat XML structure
                const regex = /<filter\s+([^>]+)\/?>/gi;
                let match;

                while ((match = regex.exec(xmlStr)) !== null) {
                    const attrs = match[1];

                    const getAttr = (name: string) => {
                        const attrMatch = new RegExp(`\\b${name}=["']([^"']*)["']`, 'i').exec(attrs);
                        return attrMatch ? this.unescapeXml(attrMatch[1]) : undefined;
                    };

                    const text = getAttr('text') || '';
                    if (!text) continue; // skip invalid filters without text

                    const isEnabled = getAttr('enabled') === 'y';
                    const isExclude = getAttr('excluding') === 'y';
                    const isRegex = getAttr('regex') === 'y';
                    const isMatchCase = getAttr('case_sensitive') === 'y';
                    const description = getAttr('description') || '';

                    const foreColorRaw = getAttr('foreColor');
                    const foreColor = foreColorRaw ? `#${foreColorRaw}` : '#ffffff';

                    const backColorRaw = getAttr('backColor');
                    const backColor = backColorRaw ? `#${backColorRaw}` : '#2d2d30';

                    loadedFilters.push({
                        id: Math.random().toString(36).substring(2, 9),
                        text,
                        isEnabled,
                        isExclude,
                        isRegex,
                        isMatchCase,
                        description,
                        foregroundColor: foreColor,
                        backgroundColor: backColor
                    });
                }

                // Assign letters incrementally
                loadedFilters.forEach((f, index) => {
                    if (index < 26) {
                        f.letter = String.fromCharCode(97 + index);
                    }
                });

                this.filtersByUri.set(this.activeDocumentUri, loadedFilters);
                this.onDidChangeFiltersEmitter.fire(this.activeDocumentUri);
                vscode.window.showInformationMessage('Filters imported successfully.');
            } catch (e) {
                vscode.window.showErrorMessage('Failed to import filters.');
            }
        }
    }

    public async exportFilters() {
        if (!this.activeDocumentUri) {
            vscode.window.showWarningMessage('Please focus a Filtered View tab to export its filters.');
            return;
        }

        const uri = await vscode.window.showSaveDialog({
            filters: { 'TextAnalysisTool Filters': ['tat'] }
        });
        if (uri) {
            try {
                const filters = this.getFilters(this.activeDocumentUri);

                let xml = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n`;
                xml += `<TextAnalysisTool.NET version="2016-06-16" showOnlyFilteredLines="True">\n`;
                xml += `  <filters>\n`;

                for (const f of filters) {
                    const enabled = f.isEnabled ? 'y' : 'n';
                    const excluding = f.isExclude ? 'y' : 'n';
                    const regex = f.isRegex ? 'y' : 'n';
                    const case_sensitive = f.isMatchCase ? 'y' : 'n';
                    const text = this.escapeXml(f.text);
                    const desc = this.escapeXml(f.description || '');

                    // remove starting # for colors if present
                    const foreColor = f.foregroundColor.replace(/^#/, '');
                    const backColor = f.backgroundColor.replace(/^#/, '');

                    let filterTag = `    <filter enabled="${enabled}" excluding="${excluding}" description="${desc}" `;
                    if (foreColor && foreColor.toLowerCase() !== 'ffffff') {
                        filterTag += `foreColor="${foreColor}" `;
                    }
                    if (backColor && backColor.toLowerCase() !== '2d2d30' && backColor.toLowerCase() !== '44475a') {
                        filterTag += `backColor="${backColor}" `;
                    }
                    filterTag += `type="matches_text" case_sensitive="${case_sensitive}" regex="${regex}" text="${text}" />\n`;

                    xml += filterTag;
                }

                xml += `  </filters>\n`;
                xml += `</TextAnalysisTool.NET>\n`;

                const data = Buffer.from(xml, 'utf8');
                await vscode.workspace.fs.writeFile(uri, data);
                vscode.window.showInformationMessage('Filters exported successfully.');
            } catch (e) {
                vscode.window.showErrorMessage('Failed to export filters.');
            }
        }
    }
}
