import * as assert from 'assert';
import * as vscode from 'vscode';
import { FilterManager } from '../../managers/FilterManager';
import { FilteredDocumentProvider } from '../../providers/FilteredDocumentProvider';
import { createFilter } from '../../models/Filter';
import { filterManager as globalFilterManager } from '../../extension';
import { FiltersWebviewProvider } from '../../providers/FiltersWebviewProvider';

suite('TextAnalysisToolPro Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('FilterManager Toggle Activation Test', async () => {
        const filterManager = new FilterManager();
        const mockFileUri = vscode.Uri.file(__dirname + '/mock.log');
        const contentData = Buffer.from("Line 1: OK\nLine 2: ERROR happened\nLine 3: OK");
        await vscode.workspace.fs.writeFile(mockFileUri, contentData);

        const virtualUri = vscode.Uri.from({
            scheme: FilteredDocumentProvider.scheme,
            path: '/[Filtered] mock.log',
            query: mockFileUri.toString()
        });
        const testUri = virtualUri.toString();

        filterManager.setActiveDocumentUri(testUri);

        // 1. Initially, activation is true by default
        assert.strictEqual(filterManager.isFiltersActivated(testUri), true, 'Filters should be activated by default');

        // 2. Add a filter
        const myFilter = createFilter("ERROR");
        myFilter.description = "Test description";
        filterManager.addFilter(myFilter, testUri);

        // 3. Toggle activation off
        filterManager.toggleFiltersActivation(testUri);
        assert.strictEqual(filterManager.isFiltersActivated(testUri), false, 'Filters should be deactivated after toggle');

        // 4. Test the provider behavior
        const provider = new FilteredDocumentProvider(filterManager);
        try {
            // When deactivated, it should return the full text instead of just "Line 2: ERROR happened"
            const content = await provider.provideTextDocumentContent(virtualUri);

            assert.strictEqual(
                content,
                "Line 1: OK\nLine 2: ERROR happened\nLine 3: OK",
                "Provider should return full text when filters are deactivated"
            );

            // 5. Toggle definition back on
            filterManager.toggleFiltersActivation(virtualUri.toString());
            const filteredContent = await provider.provideTextDocumentContent(virtualUri);

            assert.strictEqual(
                filteredContent,
                "Line 2: ERROR happened",
                "Provider should return only matching lines when filters are reactivated"
            );
        } finally {
            // Cleanup
            await vscode.workspace.fs.delete(mockFileUri);
        }
    });

    test('FilterManager Line Mapping Cache Test', async () => {
        const filterManager = new FilterManager();
        const mockFileUri = vscode.Uri.file(__dirname + '/mock_map.log');
        const contentData = Buffer.from("Line 1\nLine 2 MATCH\nLine 3\nLine 4 MATCH\nLine 5");
        await vscode.workspace.fs.writeFile(mockFileUri, contentData);

        const virtualUri = vscode.Uri.from({
            scheme: FilteredDocumentProvider.scheme,
            path: '/[Filtered] mock_map.log',
            query: mockFileUri.toString()
        });
        const testUri = virtualUri.toString();

        filterManager.setActiveDocumentUri(testUri);

        const myFilter = createFilter("MATCH");
        filterManager.addFilter(myFilter, testUri);

        const provider = new FilteredDocumentProvider(filterManager);

        try {
            // Document should only contain Line 2 (source line index 1) and Line 4 (source line index 3)
            await provider.provideTextDocumentContent(virtualUri);

            // Forward mapping
            assert.strictEqual(filterManager.getSourceLineFromVirtualLine(testUri, 0), 1);
            assert.strictEqual(filterManager.getSourceLineFromVirtualLine(testUri, 1), 3);

            // Backward mapping
            assert.strictEqual(filterManager.getVirtualLineFromSourceLine(testUri, 1), 0);

            // Nearest Match tests
            assert.strictEqual(filterManager.getVirtualLineFromSourceLine(testUri, 0), 0); // Nearest is line 1 (virtual 0)
            assert.strictEqual(filterManager.getVirtualLineFromSourceLine(testUri, 2), 1); // Nearest is line 3 (virtual 1)
            assert.strictEqual(filterManager.getVirtualLineFromSourceLine(testUri, 4), 1); // Beyond matches = last virtual
        } finally {
            await vscode.workspace.fs.delete(mockFileUri);
        }
    });

    test('Toggle Cursor Sync E2E Test', async () => {
        const ext = vscode.extensions.getExtension('rohithill.textanalysistoolpro');
        await ext?.activate();

        const mockFileUri = vscode.Uri.file(__dirname + '/mock_sync2.log');
        const contentData = Buffer.from(
            "Line 1\nLine 2 MATCH\nLine 3\nLine 4 MATCH\nLine 5\nLine 6 MATCH\nLine 7\nLine 8 MATCH\nLine 9\nLine 10 MATCH"
        );
        await vscode.workspace.fs.writeFile(mockFileUri, contentData);

        const virtualUri = vscode.Uri.from({
            scheme: FilteredDocumentProvider.scheme,
            path: '/[Filtered] mock_sync2.log',
            query: mockFileUri.toString()
        });
        const testUri = virtualUri.toString();

        const doc = await vscode.workspace.openTextDocument(virtualUri);
        const editor = await vscode.window.showTextDocument(doc);

        // Add a filter so it actually filters
        const myFilter = createFilter("MATCH");
        globalFilterManager.addFilter(myFilter, testUri);

        // Wait for doc to update
        await new Promise(resolve => setTimeout(resolve, 500));

        // Let's set the cursor to "Line 8 MATCH". This is virtual line index 3.
        const startRange = new vscode.Range(3, 0, 3, 0);
        editor.selection = new vscode.Selection(startRange.start, startRange.end);
        assert.strictEqual(editor.selection.active.line, 3);

        // Execute toggle
        await vscode.commands.executeCommand('textanalysistoolpro.toggleFilterActivation');

        // Wait for text to update and cursor to move
        await new Promise(resolve => setTimeout(resolve, 500));

        // The cursor should be moved to line index 7 (the source index of Line 8 MATCH)
        try {
            assert.strictEqual(editor.selection.active.line, 7);
        } catch (e) {
            await vscode.workspace.fs.delete(mockFileUri);
            throw e;
        }

        // cleanup
        await vscode.workspace.fs.delete(mockFileUri);
    });

    test('FiltersWebviewProvider HTML Generation Test for Double Click Edit', async () => {
        const filterManager = new FilterManager();
        const provider = new FiltersWebviewProvider(vscode.Uri.file(__dirname), filterManager);
        const html = (provider as any)._getHtmlForWebview();

        assert.ok(
            html.includes("tr.ondblclick"),
            "Double-clicking a filter row should trigger edit"
        );
    });
});
