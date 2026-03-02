import * as vscode from 'vscode';
import { FilterManager } from './managers/FilterManager';
import { FiltersWebviewProvider } from './providers/FiltersWebviewProvider';
import { Decorator } from './Decorator';
import { FilteredDocumentProvider } from './providers/FilteredDocumentProvider';
import { FilterEditorProvider } from './providers/FilterEditorProvider';

let filterManager: FilterManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('TextAnalysisToolPro is now active.');

    filterManager = new FilterManager();

    // Initialize UI Providers
    const filtersWebviewProvider = new FiltersWebviewProvider(context.extensionUri, filterManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(FiltersWebviewProvider.viewType, filtersWebviewProvider)
    );

    const filterEditorProvider = new FilterEditorProvider(context.extensionUri, filterManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(FilterEditorProvider.viewType, filterEditorProvider)
    );

    const filteredDocProvider = new FilteredDocumentProvider(filterManager);
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(FilteredDocumentProvider.scheme, filteredDocProvider)
    );

    // Initialize Decorator
    new Decorator(filterManager);

    // Register Commands
    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.addFilter', () => {
        vscode.commands.executeCommand('filterEditorView.focus');
        filterEditorProvider.clearForm();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.editFilter', (node: any) => {
        if (node && node.filter) {
            vscode.commands.executeCommand('filterEditorView.focus');
            filterEditorProvider.editFilter(node.filter);
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

    // Register Hover Provider for filtered documents
    context.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: FilteredDocumentProvider.scheme }, {
        provideHover(document, position, _token) {
            const uriString = document.uri.toString();
            // In the virtual doc, the query is the actual file path
            // In the virtual doc, the query is the actual file path, but we don't need it for hover

            // To get filters, we use the virtual uri string
            const filters = filterManager.getFilters(uriString).filter(f => f.isEnabled && !f.isExclude);
            if (filters.length === 0) return null;

            const lineText = document.lineAt(position.line).text;
            const matchedLetters: string[] = [];

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

                if (match && filter.letter) {
                    matchedLetters.push(filter.letter);
                }
            }

            if (matchedLetters.length > 0) {
                const uniqueLetters = [...new Set(matchedLetters)].sort();
                return new vscode.Hover(`**Matched Filters:** ${uniqueLetters.join(', ')}`);
            }
            return null;
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.toggleFilter', (node: any) => {
        if (node && node.filter) {
            filterManager.toggleFilterEnable(node.filter.id);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.toggleFilterActivation', () => {
        filterManager.toggleFiltersActivation();
    }));

    // Track active virtual documents
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            const uri = editor.document.uri;
            if (uri.scheme === FilteredDocumentProvider.scheme) {
                filterManager.setActiveDocumentUri(uri.toString());
            }
        }
    });

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.showFiltered', async () => {
        const fileUris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Analyze File',
            title: 'Select a file to filter'
        });

        if (!fileUris || fileUris.length === 0) {
            return;
        }

        openFilteredDocument(fileUris[0]);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.analyzeCurrentFile', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.uri.scheme !== FilteredDocumentProvider.scheme) {
            openFilteredDocument(activeEditor.document.uri);
        } else {
            vscode.window.showInformationMessage('No valid active file to analyze.');
        }
    }));

    async function openFilteredDocument(sourceUri: vscode.Uri) {
        // Extract the filename to use in the tab title
        const filename = sourceUri.path.split('/').pop() || 'File';
        const virtualFileName = `[Filtered] ${filename}`;

        // Construct our virtual document URI. 
        // Scheme: textanalysistoolpro
        // Path: /[Filtered] filename (used for the display tab title)
        // Query: the original file's full URI string (used to read the hard drive later)
        const virtualUri = vscode.Uri.from({
            scheme: FilteredDocumentProvider.scheme,
            path: `/${virtualFileName}`,
            query: sourceUri.toString()
        });

        const doc = await vscode.workspace.openTextDocument(virtualUri);
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });

        // Set this as the active document so any new filters apply to it immediately
        filterManager.setActiveDocumentUri(virtualUri.toString());
    }

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.goToNextMatch', (letter: string) => {
        jumpToMatch(letter, 1);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.goToPreviousMatch', (letter: string) => {
        jumpToMatch(letter, -1);
    }));

    function jumpToMatch(letter: string, direction: 1 | -1) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !letter) return;

        const uriString = editor.document.uri.toString();
        const filters = filterManager.getFilters(uriString).filter(f => f.isEnabled && !f.isExclude);
        const targetFilter = filters.find(f => f.letter === letter);

        if (!targetFilter) return; // No active filter for this letter

        const currentLine = editor.selection.active.line;
        const totalLines = editor.document.lineCount;

        let foundLine = -1;
        for (let i = currentLine + direction; i >= 0 && i < totalLines; i += direction) {
            const lineText = editor.document.lineAt(i).text;

            let match = false;
            if (targetFilter.isRegex) {
                try {
                    const regex = new RegExp(targetFilter.text, targetFilter.isMatchCase ? '' : 'i');
                    match = regex.test(lineText);
                } catch (e) { }
            } else {
                if (targetFilter.isMatchCase) {
                    match = lineText.includes(targetFilter.text);
                } else {
                    match = lineText.toLowerCase().includes(targetFilter.text.toLowerCase());
                }
            }

            if (match) {
                foundLine = i;
                break;
            }
        }

        if (foundLine !== -1) {
            const range = editor.document.lineAt(foundLine).range;
            editor.selection = new vscode.Selection(range.start, range.start);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        } else {
            vscode.window.showInformationMessage(`No more matches found for filter '${letter}'.`);
        }
    }

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.importFilters', () => {
        filterManager.importFilters();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.exportFilters', () => {
        filterManager.exportFilters();
    }));
}

export function deactivate() { }
