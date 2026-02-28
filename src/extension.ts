import * as vscode from 'vscode';
import { FilterManager } from './managers/FilterManager';
import { FiltersTreeDataProvider } from './providers/FiltersTreeDataProvider';
import { Decorator } from './Decorator';
import { createFilter } from './models/Filter';
import { FilterWizard } from './ui/FilterWizard';

let filterManager: FilterManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('TextAnalysisToolPro is now active.');

    filterManager = new FilterManager();

    // Initialize UI Providers
    const treeDataProvider = new FiltersTreeDataProvider(filterManager);
    vscode.window.registerTreeDataProvider('filtersView', treeDataProvider);

    const filteredChannel = vscode.window.createOutputChannel("TextAnalysisToolPro Filtered");

    // Initialize Decorator
    new Decorator(filterManager);

    // Register Commands
    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.addFilter', () => {
        FilterWizard.run(filterManager);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.editFilter', (node: any) => {
        if (node && node.filter) {
            FilterWizard.run(filterManager, node.filter);
        } else {
            vscode.window.showInformationMessage('Use the sidebar to edit specific filters.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.removeFilter', (node: any) => {
        if (node && node.filter) {
            filterManager.removeFilter(node.filter.id);
        } else {
            // Fallback to quick pick if command palette is used
            vscode.window.showInformationMessage('Use the sidebar to remove specific filters.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.toggleFilter', (node: any) => {
        if (node && node.filter) {
            filterManager.toggleFilterEnable(node.filter.id);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.showFiltered', async () => {
        const activeEditors = vscode.window.visibleTextEditors;
        let sourceDoc = activeEditors.find((e: any) => e.document.uri.scheme !== 'output')?.document;

        if (!sourceDoc) {
            vscode.window.showInformationMessage("No valid text document open to filter.");
            return;
        }

        const filters = filterManager.getFilters().filter((f: any) => f.isEnabled);
        if (filters.length === 0) {
            vscode.window.showInformationMessage("No filters active.");
            return;
        }

        filteredChannel.clear();
        filteredChannel.show(true);
        let count = 0;

        for (let i = 0; i < sourceDoc.lineCount; i++) {
            const lineData = sourceDoc.lineAt(i);
            const lineText = lineData.text;
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
                        matchInclude = true;
                    }
                }
            }

            if (matchInclude && !matchExclude) {
                filteredChannel.appendLine(lineText);
                count++;
            }
        }

        filteredChannel.appendLine(`\n--- Completed: ${count} line(s) matched ---`);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.importFilters', () => {
        filterManager.importFilters();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.exportFilters', () => {
        filterManager.exportFilters();
    }));
}

export function deactivate() { }
