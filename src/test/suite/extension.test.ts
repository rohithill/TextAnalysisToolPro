import * as assert from 'assert';
import * as vscode from 'vscode';
import { FilterManager } from '../../managers/FilterManager';
import { FilteredDocumentProvider } from '../../providers/FilteredDocumentProvider';
import { createFilter } from '../../models/Filter';

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
});
