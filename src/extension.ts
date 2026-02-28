import * as vscode from 'vscode';
import { FilterManager } from './managers/FilterManager';
import { FiltersTreeDataProvider } from './providers/FiltersTreeDataProvider';
import { Decorator } from './Decorator';
import { FilteredDocumentProvider } from './providers/FilteredDocumentProvider';
import { createFilter } from './models/Filter';

let filterManager: FilterManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('TextAnalysisToolPro is now active.');

    filterManager = new FilterManager();

    // Initialize UI Providers
    const treeDataProvider = new FiltersTreeDataProvider(filterManager);
    vscode.window.registerTreeDataProvider('filtersView', treeDataProvider);

    const filteredDocProvider = new FilteredDocumentProvider(filterManager);
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(FilteredDocumentProvider.scheme, filteredDocProvider)
    );

    // Initialize Decorator
    new Decorator(filterManager);

    // Register Commands
    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.addFilter', async () => {
        const result = await vscode.window.showInputBox({
            prompt: 'Enter text to filter (prefix with "regex:" for regular expressions)',
            placeHolder: 'e.g., Error, Exception, regex:^\\d{4}'
        });
        if (result) {
            const isRegex = result.startsWith('regex:');
            const text = isRegex ? result.substring(6) : result;
            filterManager.addFilter(createFilter(text, isRegex));
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.removeFilter', (node) => {
        if (node && node.filter) {
            filterManager.removeFilter(node.filter.id);
        } else {
            // Fallback to quick pick if command palette is used
            vscode.window.showInformationMessage('Use the sidebar to remove specific filters.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.toggleFilter', (node) => {
        if (node && node.filter) {
            filterManager.toggleFilterEnable(node.filter.id);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.showFiltered', async () => {
        const uri = vscode.Uri.parse(`${FilteredDocumentProvider.scheme}:FilteredView`);

        for (const tabGroup of vscode.window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString()) {
                    await vscode.window.tabGroups.close(tab);
                    return;
                }
            }
        }

        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.importFilters', () => {
        filterManager.importFilters();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.exportFilters', () => {
        filterManager.exportFilters();
    }));
}

export function deactivate() { }
