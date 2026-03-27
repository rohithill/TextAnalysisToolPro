import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FilterManager } from '../../managers/FilterManager';
import { FilteredDocumentProvider } from '../../providers/FilteredDocumentProvider';
import { FiltersWebviewProvider } from '../../providers/FiltersWebviewProvider';
import { createFilter } from '../../models/Filter';
import { filterManager as globalFilterManager } from '../../extension';
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

    test('FiltersWebviewProvider HTML Color Test', async () => {
        const filterManager = new FilterManager();
        const provider = new FiltersWebviewProvider(
            vscode.Uri.file(__dirname),
            filterManager
        );

        const html: string = (provider as any)._getHtmlForWebview();

        // Ensure color is applied unconditionally, not within an if (f.isEnabled) block
        const bugRegex = /if\s*\(f\.isEnabled\)\s*\{\s*tr\.style\.color/;
        assert.strictEqual(bugRegex.test(html), false, "Colors should not be conditionally applied only when enabled");

        const correctRegex = /tr\.style\.color\s*=\s*f\.foregroundColor;\s*tr\.style\.backgroundColor\s*=\s*f\.backgroundColor;/;
        assert.strictEqual(correctRegex.test(html), true, "Colors should be unconditionally applied to the row");
    });

    // ── Group tests ─────────────────────────────────────────────────────────

    test('FilterManager Group Creation Test', () => {
        const filterManager = new FilterManager();
        const testUri = 'textanalysistoolpro://%5BFiltered%5D%20test.log?file:///test.log';
        filterManager.setActiveDocumentUri(testUri);

        // Initially one default group named unnamed_1
        const groups = filterManager.getGroups(testUri);
        assert.strictEqual(groups.length, 1, 'Should have one default group');
        assert.strictEqual(groups[0].name, 'unnamed_1', 'Default group should be named unnamed_1');

        // Adding a second group
        filterManager.addGroup(undefined, testUri);
        const groups2 = filterManager.getGroups(testUri);
        assert.strictEqual(groups2.length, 2, 'Should have two groups after addGroup');
        assert.strictEqual(groups2[1].name, 'unnamed_2', 'Second group should be auto-named unnamed_2');

        // New group is now active and has no filters
        assert.strictEqual(filterManager.getFilters(testUri).length, 0, 'New group should start empty');
    });

    test('FilterManager Group Filter Isolation Test', () => {
        const filterManager = new FilterManager();
        const testUri = 'textanalysistoolpro://%5BFiltered%5D%20iso.log?file:///iso.log';
        filterManager.setActiveDocumentUri(testUri);

        // Add a filter to group A (unnamed_1)
        const groupAId = filterManager.getActiveGroupId(testUri)!;
        filterManager.addFilter(createFilter('ERROR'), testUri);
        assert.strictEqual(filterManager.getFilters(testUri).length, 1, 'Group A should have 1 filter');

        // Create group B and switch to it
        filterManager.addGroup(undefined, testUri); // also activates group B
        assert.strictEqual(filterManager.getFilters(testUri).length, 0, 'Group B should be empty');

        // Switch back to group A
        filterManager.setActiveGroup(groupAId, testUri);
        assert.strictEqual(filterManager.getFilters(testUri).length, 1, 'Group A should still have 1 filter');
    });

    test('FilterManager Clone Group Test', () => {
        const filterManager = new FilterManager();
        const testUri = 'textanalysistoolpro://%5BFiltered%5D%20clone.log?file:///clone.log';
        filterManager.setActiveDocumentUri(testUri);

        // Add filters to the default group
        const groupAId = filterManager.getActiveGroupId(testUri)!;
        const f1 = createFilter('ERROR');
        const f2 = createFilter('WARN');
        filterManager.addFilter(f1, testUri);
        filterManager.addFilter(f2, testUri);

        // Clone the group
        const cloned = filterManager.cloneGroup(groupAId, testUri)!;
        assert.ok(cloned, 'Cloned group should be returned');
        assert.ok(cloned.name.includes('copy'), 'Cloned group name should mention copy');
        assert.strictEqual(cloned.filters.length, 2, 'Cloned group should have 2 filters');

        // Filter IDs should be different
        assert.notStrictEqual(cloned.filters[0].id, f1.id, 'Cloned filter should have a different id');

        // Active group should now be the clone
        assert.strictEqual(filterManager.getActiveGroupId(testUri), cloned.id, 'Clone should become active');
    });

    test('FilterManager Delete Group Test', () => {
        const filterManager = new FilterManager();
        const testUri = 'textanalysistoolpro://%5BFiltered%5D%20del.log?file:///del.log';
        filterManager.setActiveDocumentUri(testUri);

        const groupAId = filterManager.getActiveGroupId(testUri)!;
        filterManager.addGroup(undefined, testUri); // now 2 groups; unnamed_2 is active

        // Delete unnamed_2 (currently active)
        const groupBId = filterManager.getActiveGroupId(testUri)!;
        filterManager.removeGroup(groupBId, testUri);

        const remaining = filterManager.getGroups(testUri);
        assert.strictEqual(remaining.length, 1, 'Should be back to 1 group');
        assert.strictEqual(filterManager.getActiveGroupId(testUri), groupAId, 'Should fall back to group A');
    });
    test('Webviews should retain context when hidden', async () => {
        const extensionFilePath = path.join(__dirname, '../../../src/extension.ts');
        const extensionCode = fs.readFileSync(extensionFilePath, 'utf8');

        assert.ok(
            extensionCode.includes('retainContextWhenHidden: true'),
            "registerWebviewViewProvider should be called with retainContextWhenHidden: true to prevent state loss when switching tabs"
        );
    });
});
