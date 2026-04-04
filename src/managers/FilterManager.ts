import * as vscode from 'vscode';
import * as path from 'path';
import { Filter, FilterGroup, createGroup } from '../models/Filter';

export class FilterManager {
    // Map of Virtual Document URI String -> Array of FilterGroups
    private groupsByUri: Map<string, FilterGroup[]> = new Map();

    // Map of Virtual Document URI String -> active group id
    private activeGroupIdByUri: Map<string, string> = new Map();

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

    // -------------------------------------------------------------------------
    // Line cache helpers (unchanged)
    // -------------------------------------------------------------------------

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

        for (let vLine = 0; vLine < matches.length; vLine++) {
            if (matches[vLine] >= sourceLine) {
                return vLine;
            }
        }

        return matches.length > 0 ? matches.length - 1 : undefined;
    }

    // -------------------------------------------------------------------------
    // Active document
    // -------------------------------------------------------------------------

    public setActiveDocumentUri(uri: string | undefined) {
        if (this.activeDocumentUri !== uri) {
            this.activeDocumentUri = uri;
            this.onDidChangeActiveDocumentEmitter.fire(uri);
        }
    }

    public getActiveDocumentUri(): string | undefined {
        return this.activeDocumentUri;
    }

    // -------------------------------------------------------------------------
    // Group helpers
    // -------------------------------------------------------------------------

    /** Ensures at least one group exists for a URI and returns all groups. */
    private ensureGroups(uri: string): FilterGroup[] {
        if (!this.groupsByUri.has(uri)) {
            const defaultGroup = createGroup('unnamed_1');
            this.groupsByUri.set(uri, [defaultGroup]);
            this.activeGroupIdByUri.set(uri, defaultGroup.id);
        }
        return this.groupsByUri.get(uri)!;
    }

    /** Returns the active group for a URI, creating defaults if necessary. */
    private getActiveGroup(uri: string): FilterGroup {
        const groups = this.ensureGroups(uri);
        const activeId = this.activeGroupIdByUri.get(uri);
        return groups.find(g => g.id === activeId) || groups[0];
    }

    /** Auto-generates the next available "unnamed_N" name. */
    private nextAutoName(uri: string): string {
        const groups = this.groupsByUri.get(uri) || [];
        const used = new Set(groups.map(g => g.name));
        let n = 1;
        while (used.has(`unnamed_${n}`)) {
            n++;
        }
        return `unnamed_${n}`;
    }

    // -------------------------------------------------------------------------
    // Public group API
    // -------------------------------------------------------------------------

    public getGroups(uri?: string): FilterGroup[] {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return [];
        return this.ensureGroups(targetUri);
    }

    public getActiveGroupId(uri?: string): string | undefined {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return undefined;
        this.ensureGroups(targetUri);
        return this.activeGroupIdByUri.get(targetUri);
    }

    public addGroup(name?: string, uri?: string): FilterGroup {
        const targetUri = uri || this.activeDocumentUri;
        const groups = targetUri ? this.ensureGroups(targetUri) : [];
        const resolvedName = name || (targetUri ? this.nextAutoName(targetUri) : 'unnamed_1');
        const newGroup = createGroup(resolvedName);
        groups.push(newGroup);
        if (targetUri) {
            this.groupsByUri.set(targetUri, groups);
            this.activeGroupIdByUri.set(targetUri, newGroup.id);
            this.onDidChangeFiltersEmitter.fire(targetUri);
        }
        return newGroup;
    }

    public cloneGroup(groupId: string, uri?: string): FilterGroup | undefined {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return undefined;

        const groups = this.ensureGroups(targetUri);
        const source = groups.find(g => g.id === groupId);
        if (!source) return undefined;

        const cloneName = `${source.name} (copy)`;
        const cloned = createGroup(cloneName);
        // Deep-copy each filter with a new id
        cloned.filters = source.filters.map(f => ({ ...f, id: Math.random().toString(36).substring(2, 9) }));

        groups.push(cloned);
        this.groupsByUri.set(targetUri, groups);
        // Activate the newly cloned group
        this.activeGroupIdByUri.set(targetUri, cloned.id);
        this.onDidChangeFiltersEmitter.fire(targetUri);
        return cloned;
    }

    public renameGroup(groupId: string, name: string, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const groups = this.ensureGroups(targetUri);
        const group = groups.find(g => g.id === groupId);
        if (group) {
            group.name = name;
            this.onDidChangeFiltersEmitter.fire(targetUri);
        }
    }

    public setActiveGroup(groupId: string, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const groups = this.ensureGroups(targetUri);
        if (groups.find(g => g.id === groupId)) {
            this.activeGroupIdByUri.set(targetUri, groupId);
            this.onDidChangeFiltersEmitter.fire(targetUri);
        }
    }

    public removeGroup(groupId: string, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        let groups = this.ensureGroups(targetUri);
        const wasActive = this.activeGroupIdByUri.get(targetUri) === groupId;

        groups = groups.filter(g => g.id !== groupId);

        if (groups.length === 0) {
            // Always keep at least one group
            const defaultGroup = createGroup(this.nextAutoName(targetUri));
            groups.push(defaultGroup);
            this.activeGroupIdByUri.set(targetUri, defaultGroup.id);
        } else if (wasActive) {
            this.activeGroupIdByUri.set(targetUri, groups[0].id);
        }

        this.groupsByUri.set(targetUri, groups);
        this.onDidChangeFiltersEmitter.fire(targetUri);
    }

    // -------------------------------------------------------------------------
    // Filter-level operations (all scoped to the active group)
    // -------------------------------------------------------------------------

    public getFilters(uri?: string): Filter[] {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return [];
        return this.getActiveGroup(targetUri).filters;
    }

    public isFiltersActivated(uri?: string): boolean {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return true;
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

        const group = this.getActiveGroup(targetUri);
        const filters = group.filters;

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
        this.onDidChangeFiltersEmitter.fire(targetUri);
    }

    public removeFilter(id: string, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const group = this.getActiveGroup(targetUri);
        group.filters = group.filters.filter(f => f.id !== id);

        // Reassign letters so there are no gaps
        group.filters.forEach((f, index) => {
            if (index < 26) {
                f.letter = String.fromCharCode(97 + index);
            } else {
                f.letter = undefined;
            }
        });

        this.onDidChangeFiltersEmitter.fire(targetUri);
    }

    public removeAllFilters(uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const group = this.getActiveGroup(targetUri);
        group.filters = [];
        this.onDidChangeFiltersEmitter.fire(targetUri);
    }

    public toggleFilterEnable(id: string, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const filters = this.getFilters(targetUri);
        const filter = filters.find(f => f.id === id);
        if (filter) {
            filter.isEnabled = !filter.isEnabled;
            this.onDidChangeFiltersEmitter.fire(targetUri);
        }
    }

    public toggleAllFilters(enable: boolean, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const filters = this.getFilters(targetUri);
        filters.forEach(f => f.isEnabled = enable);
        this.onDidChangeFiltersEmitter.fire(targetUri);
    }

    public moveFilter(oldIndex: number, newIndex: number, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const group = this.getActiveGroup(targetUri);
        const filters = group.filters;
        if (oldIndex < 0 || oldIndex >= filters.length || newIndex < 0 || newIndex > filters.length) {
            return;
        }

        const [movedFilter] = filters.splice(oldIndex, 1);

        if (newIndex > oldIndex) {
            newIndex--;
        }

        filters.splice(newIndex, 0, movedFilter);

        // Reassign letters so they remain sequential 'a'-'z' from top to bottom
        filters.forEach((f, index) => {
            if (index < 26) {
                f.letter = String.fromCharCode(97 + index);
            } else {
                f.letter = undefined;
            }
        });

        this.onDidChangeFiltersEmitter.fire(targetUri);
    }

    public updateFilter(updatedFilter: Filter, uri?: string) {
        const targetUri = uri || this.activeDocumentUri;
        if (!targetUri) return;

        const filters = this.getFilters(targetUri);
        const index = filters.findIndex(f => f.id === updatedFilter.id);
        if (index !== -1) {
            updatedFilter.letter = filters[index].letter;
            filters[index] = updatedFilter;
            this.onDidChangeFiltersEmitter.fire(targetUri);
        }
    }

    // -------------------------------------------------------------------------
    // XML helpers
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Import / Export (operates on the active group)
    // -------------------------------------------------------------------------

    public parseFiltersXml(xmlStr: string): Filter[] {
        const loadedFilters: Filter[] = [];
        const regex = /<filter\s+([^>]+)\/?>/gi;
        let match;

        while ((match = regex.exec(xmlStr)) !== null) {
            const attrs = match[1];

            const getAttr = (name: string) => {
                const attrMatch = new RegExp(`\\b${name}=(["'])([^"']*)\\1`, 'i').exec(attrs);
                return attrMatch ? this.unescapeXml(attrMatch[2]) : undefined;
            };

            const text = getAttr('text') || '';
            if (!text) continue;

            const isEnabled = getAttr('enabled') === 'y';
            const isExclude = getAttr('excluding') === 'y';
            const isRegex = getAttr('regex') === 'y';
            const isMatchCase = getAttr('case_sensitive') === 'y';
            const description = getAttr('description') || '';

            const config = vscode.workspace.getConfiguration('textanalysistoolpro');
            const defaultFore = config.get<string>('defaultForegroundColor', '#ffffff');
            const defaultBack = config.get<string>('defaultBackgroundColor', '#44475a');

            const foreColorRaw = getAttr('foreColor');
            const foreColor = foreColorRaw ? `#${foreColorRaw}` : defaultFore;

            const backColorRaw = getAttr('backColor');
            const backColor = backColorRaw ? `#${backColorRaw}` : defaultBack;

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

        return loadedFilters;
    }

    public async loadAutoFilters(uri: string) {
        const groups = this.groupsByUri.get(uri) || [];
        if (groups.length > 1 || (groups.length === 1 && groups[0].filters.length > 0)) {
            return;
        }

        const config = vscode.workspace.getConfiguration('textanalysistoolpro');
        const autoLoadFilters = config.get<Record<string, string>>('autoLoadFilters', {});
        
        let loadedAny = false;
        
        for (const [groupName, filePath] of Object.entries(autoLoadFilters)) {
            try {
                let fileUri = vscode.Uri.file(filePath);
                
                if (!path.isAbsolute(filePath)) {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders && workspaceFolders.length > 0) {
                        fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
                    }
                }
                
                try {
                    await vscode.workspace.fs.stat(fileUri);
                } catch (statError) {
                    vscode.window.showWarningMessage(`TextAnalysisToolPro: Auto-configured filter file not found for group "${groupName}": ${filePath}`);
                    console.warn(`Auto-configured filter file missing: ${fileUri.toString()}`);
                    continue;
                }
                
                const data = await vscode.workspace.fs.readFile(fileUri);
                const xmlStr = data.toString();
                const loadedFilters = this.parseFiltersXml(xmlStr);
                
                if (loadedFilters.length > 0) {
                    const newGroup = this.addGroup(groupName, uri);
                    newGroup.filters = loadedFilters;
                    loadedAny = true;
                }
            } catch (e: any) {
                const errorMsg = e && e.message ? e.message : String(e);
                vscode.window.showWarningMessage(`TextAnalysisToolPro: Failed to read filter file "${filePath}" for group "${groupName}". Error: ${errorMsg}`);
                console.error(`Failed to load auto-configured filter file ${filePath}:`, e);
            }
        }
        
        if (loadedAny) {
            const groups = this.groupsByUri.get(uri) || [];
            if (groups.length > 1 && groups[0].name === 'unnamed_1' && groups[0].filters.length === 0) {
                this.removeGroup(groups[0].id, uri);
            }
            this.onDidChangeFiltersEmitter.fire(uri);
        }
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

                const loadedFilters = this.parseFiltersXml(xmlStr);

                // Replace the active group's filters
                const group = this.getActiveGroup(this.activeDocumentUri);
                group.filters = loadedFilters;
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

                const fileData = Buffer.from(xml, 'utf8');
                await vscode.workspace.fs.writeFile(uri, fileData);
                vscode.window.showInformationMessage('Filters exported successfully.');
            } catch (e) {
                vscode.window.showErrorMessage('Failed to export filters.');
            }
        }
    }
}
