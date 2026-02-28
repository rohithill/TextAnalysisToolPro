import * as vscode from 'vscode';
import { Filter } from '../models/Filter';

export class FilterManager {
    private filters: Filter[] = [];
    private onDidChangeFiltersEmitter = new vscode.EventEmitter<Filter[]>();
    public readonly onDidChangeFilters = this.onDidChangeFiltersEmitter.event;

    constructor() { }

    public getFilters(): Filter[] {
        return this.filters;
    }

    public addFilter(filter: Filter) {
        this.filters.push(filter);
        this.onDidChangeFiltersEmitter.fire(this.filters);
    }

    public removeFilter(id: string) {
        this.filters = this.filters.filter(f => f.id !== id);
        this.onDidChangeFiltersEmitter.fire(this.filters);
    }

    public toggleFilterEnable(id: string) {
        const filter = this.filters.find(f => f.id === id);
        if (filter) {
            filter.isEnabled = !filter.isEnabled;
            this.onDidChangeFiltersEmitter.fire(this.filters);
        }
    }

    public updateFilter(updatedFilter: Filter) {
        const index = this.filters.findIndex(f => f.id === updatedFilter.id);
        if (index !== -1) {
            this.filters[index] = updatedFilter;
            this.onDidChangeFiltersEmitter.fire(this.filters);
        }
    }

    public async importFilters() {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'TextAnalysisTool Filters': ['tat'] }
        });
        if (uris && uris[0]) {
            try {
                const data = await vscode.workspace.fs.readFile(uris[0]);
                const loadedFilters = JSON.parse(data.toString()) as Filter[];
                this.filters = loadedFilters;
                this.onDidChangeFiltersEmitter.fire(this.filters);
                vscode.window.showInformationMessage('Filters imported successfully.');
            } catch (e) {
                vscode.window.showErrorMessage('Failed to import filters.');
            }
        }
    }

    public async exportFilters() {
        const uri = await vscode.window.showSaveDialog({
            filters: { 'TextAnalysisTool Filters': ['tat'] }
        });
        if (uri) {
            try {
                const data = Buffer.from(JSON.stringify(this.filters, null, 2));
                await vscode.workspace.fs.writeFile(uri, data);
                vscode.window.showInformationMessage('Filters exported successfully.');
            } catch (e) {
                vscode.window.showErrorMessage('Failed to export filters.');
            }
        }
    }
}
