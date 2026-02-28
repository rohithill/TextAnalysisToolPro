import * as vscode from 'vscode';
import { Filter } from '../models/Filter';
import { FilterManager } from '../managers/FilterManager';

export class FiltersTreeDataProvider implements vscode.TreeDataProvider<FilterTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FilterTreeItem | undefined | null | void> = new vscode.EventEmitter<FilterTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FilterTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private filterManager: FilterManager) {
        this.filterManager.onDidChangeFilters(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FilterTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FilterTreeItem): Thenable<FilterTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            const filters = this.filterManager.getFilters();
            return Promise.resolve(filters.map(filter => new FilterTreeItem(filter)));
        }
    }
}

export class FilterTreeItem extends vscode.TreeItem {
    constructor(
        public readonly filter: Filter
    ) {
        super(filter.text, vscode.TreeItemCollapsibleState.None);

        this.tooltip = `Filter: ${filter.text}`;
        this.description = `${filter.isRegex ? '[Regex] ' : ''}${!filter.isEnabled ? '(Disabled)' : ''}`;

        // Use a generic icon, we can customize it later if needed.
        this.iconPath = filter.isEnabled ? new vscode.ThemeIcon('check') : new vscode.ThemeIcon('circle-slash');

        this.contextValue = 'filterItem';
    }
}
