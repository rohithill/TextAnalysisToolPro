import * as vscode from 'vscode';
import { FilterManager } from './managers/FilterManager';
import { FiltersWebviewProvider } from './providers/FiltersWebviewProvider';
import { Decorator } from './Decorator';
import { FilteredDocumentProvider } from './providers/FilteredDocumentProvider';
import { FilterEditorProvider } from './providers/FilterEditorProvider';

export const filterManager = new FilterManager();

export function activate(context: vscode.ExtensionContext) {
    console.log('TextAnalysisToolPro is now active.');


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

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.toggleFilterActivation', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.uri.scheme !== FilteredDocumentProvider.scheme) {
            filterManager.toggleFiltersActivation();
            return;
        }

        const uriString = activeEditor.document.uri.toString();
        const currentActiveLine = activeEditor.selection.active.line;
        const wasFiltersActivated = filterManager.isFiltersActivated(uriString);

        // Map the current visible line to its underlying source line BEFORE toggle
        let sourceLineTarget: number | undefined;
        if (wasFiltersActivated) {
            sourceLineTarget = filterManager.getSourceLineFromVirtualLine(uriString, currentActiveLine);
        } else {
            // Unfiltered view, so virtual line == source line
            sourceLineTarget = currentActiveLine;
        }

        // Toggle the filters
        filterManager.toggleFiltersActivation(uriString);

        // Wait for VS Code to physically update the editor's text buffer
        await new Promise<void>(resolve => {
            // Failsafe timeout in case the document identical or doesn't update
            const timeout = setTimeout(() => {
                disposable.dispose();
                resolve();
            }, 1000);

            const disposable = vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.uri.toString() === uriString) {
                    clearTimeout(timeout);
                    disposable.dispose();
                    // Wait long enough for VS Code to finish its internal cursor clamping
                    // that happens after a document content replacement (it clamps to end of change).
                    setTimeout(resolve, 100);
                }
            });
        });

        if (sourceLineTarget !== undefined) {
            const isFiltersNowActivated = filterManager.isFiltersActivated(uriString);
            let newTargetVirtualLine = 0;

            if (isFiltersNowActivated) {
                // We turned filters ON. Map the source line to the closest surviving filtered line.
                const mappedLine = filterManager.getVirtualLineFromSourceLine(uriString, sourceLineTarget);
                if (mappedLine !== undefined) {
                    newTargetVirtualLine = mappedLine;
                }
            } else {
                // We turned filters OFF. The document is 1:1, so virtual line == source line
                newTargetVirtualLine = sourceLineTarget;
            }

            const applySelection = () => {
                const newRange = new vscode.Range(newTargetVirtualLine, 0, newTargetVirtualLine, 0);
                activeEditor.selection = new vscode.Selection(newRange.start, newRange.end);
                activeEditor.revealRange(newRange, vscode.TextEditorRevealType.InCenter);
            };

            // Apply immediately after settling, then once more as insurance against
            // any remaining internal VS Code cursor adjustments.
            applySelection();
            setTimeout(applySelection, 20);
        }
    }));

    // Track active virtual documents
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.uri.scheme === FilteredDocumentProvider.scheme) {
            filterManager.setActiveDocumentUri(editor.document.uri.toString());
        } else {
            // Focused a regular file (or no editor) — clear so the filter panel shows nothing
            filterManager.setActiveDocumentUri(undefined);
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
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Active });

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

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.removeAllFilters', async () => {
        const filters = filterManager.getFilters();
        if (filters.length === 0) {
            vscode.window.showInformationMessage('No filters to remove.');
            return;
        }
        const confirm = await vscode.window.showWarningMessage(
            `Remove all ${filters.length} filter(s)?`,
            { modal: true },
            'Remove All'
        );
        if (confirm === 'Remove All') {
            filterManager.removeAllFilters();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.exportFilters', () => {
        filterManager.exportFilters();
    }));

    // ── Group commands ──────────────────────────────────────────────────────

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.createGroup', () => {
        filterManager.addGroup();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.cloneGroup', async () => {
        const groups = filterManager.getGroups();
        if (groups.length === 0) { return; }
        const items = groups.map(g => ({ label: g.name || '(unnamed)', id: g.id }));
        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select group to clone' });
        if (picked) {
            filterManager.cloneGroup(picked.id);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.renameGroup', async () => {
        const groups = filterManager.getGroups();
        if (groups.length === 0) { return; }
        const items = groups.map(g => ({ label: g.name || '(unnamed)', id: g.id }));
        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select group to rename' });
        if (picked) {
            const newName = await vscode.window.showInputBox({
                prompt: 'Enter new group name',
                value: picked.label,
                validateInput: v => v.trim() ? undefined : 'Name cannot be empty'
            });
            if (newName && newName.trim()) {
                filterManager.renameGroup(picked.id, newName.trim());
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('textanalysistoolpro.deleteGroup', async () => {
        const groups = filterManager.getGroups();
        if (groups.length <= 1) {
            vscode.window.showWarningMessage('Cannot delete the last remaining group.');
            return;
        }
        const items = groups.map(g => ({ label: g.name || '(unnamed)', id: g.id }));
        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select group to delete' });
        if (picked) {
            const confirm = await vscode.window.showWarningMessage(
                `Delete group "${picked.label}"? All its filters will be removed.`,
                { modal: true },
                'Delete'
            );
            if (confirm === 'Delete') {
                filterManager.removeGroup(picked.id);
            }
        }
    }));
}

export function deactivate() { }
