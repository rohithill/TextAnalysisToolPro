import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FilterManager } from '../../managers/FilterManager';
import { FilteredDocumentProvider } from '../../providers/FilteredDocumentProvider';
import { FiltersWebviewProvider } from '../../providers/FiltersWebviewProvider';
import { Decorator } from '../../Decorator';
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

    test('Decorator handles non-matching lines correctly (unfiltered view)', async () => {
        // We import the Decorator directly to test its internal logic without UI side effects.
        
        // Use a clean local filter manager
        const localFilterManager = new FilterManager();
        const testUri = 'file:///test-decorator.log';
        localFilterManager.setActiveDocumentUri(testUri);
        
        // Add a single filter "YES"
        const myFilter = createFilter("YES");
        localFilterManager.addFilter(myFilter, testUri);

        // Instantiate the Decorator
        const decorator = new Decorator(localFilterManager);

        // We will mock the activeEditor to track what the Decorator applies
        const decoratedRanges: any[] = [];
        const mockEditor = {
            document: {
                uri: { toString: () => testUri },
                lineCount: 4,
                lineAt: (i: number) => {
                    const texts = ["Line 1 NO", "Line 2 YES", "Line 3 NO", "Line 4 YES"];
                    return { text: texts[i], range: { start: { line: i }, end: { line: i } } };
                }
            },
            setDecorations: (type: any, rangesOrOptions: any[]) => {
                // Collect the ranges passed to setDecorations
                for (const r of rangesOrOptions) {
                    if (r.range) {
                        decoratedRanges.push(r.range);
                    } else {
                        decoratedRanges.push(r);
                    }
                }
            }
        };

        // Inject the mock editor using any typecasting
        (decorator as any).activeEditor = mockEditor;

        // Force an update
        (decorator as any).updateDecorations();

        // The mock document has matching lines at index 1 and 3
        const decoratedLineIndices = decoratedRanges.map((r: any) => r.start.line);
        
        // Every line should be decorated now: YES lines with colors, NO lines with opacity
        assert.ok(decoratedLineIndices.includes(1), "Line 1 (YES) should be decorated");
        assert.ok(decoratedLineIndices.includes(3), "Line 3 (YES) should be decorated");
        
        assert.ok(decoratedLineIndices.includes(0), "Line 0 (NO) should be decorated (faded)");
        assert.ok(decoratedLineIndices.includes(2), "Line 2 (NO) should be decorated (faded)");
        
        assert.strictEqual(decoratedLineIndices.length, 4, "All 4 lines should be decorated in total");
    });

    test('Decorator handles exclude-only filters without forcing default colors', async () => {
        // This test ensures that when only exclude filters are used,
        // the remaining (implicitly included) lines are NOT forcefully colored
        // with the default text colors, leaving them with VS Code's native syntax highlighting.
        
        const localFilterManager = new FilterManager();
        const testUri = 'file:///test-decorator-exclude.log';
        localFilterManager.setActiveDocumentUri(testUri);
        
        // Add ONLY an exclude filter
        const myFilter = createFilter("EXCLUDE");
        myFilter.isExclude = true;
        localFilterManager.addFilter(myFilter, testUri);

        const decorator = new Decorator(localFilterManager);

        const decoratedRanges: any[] = [];
        const mockEditor = {
            document: {
                uri: { toString: () => testUri },
                lineCount: 2,
                lineAt: (i: number) => {
                    const texts = ["Line 1 NORMAL", "Line 2 EXCLUDE"];
                    return { text: texts[i], range: { start: { line: i }, end: { line: i } } };
                }
            },
            setDecorations: (type: any, rangesOrOptions: any[]) => {
                for (const r of rangesOrOptions) {
                    if (r.range) {
                        decoratedRanges.push({ line: r.range.start.line, type });
                    } else {
                        decoratedRanges.push({ line: r.start.line, type });
                    }
                }
            }
        };

        (decorator as any).activeEditor = mockEditor;
        (decorator as any).updateDecorations();

        // Line 1 is NORMAL, Line 2 is EXCLUDED
        // For line 1 (index 0), it should NOT be decorated heavily OR faded. Length of decorations for line 0 should be 0.
        // For line 2 (index 1), it matches the exclude filter, so it SHOULD be faded.
        
        const decoratedIndices = decoratedRanges.map((r: any) => r.line);

        assert.ok(!decoratedIndices.includes(0), "Line 0 (NORMAL) should receive absolutely NO decoration (keeps native syntax highlighting)");
        assert.ok(decoratedIndices.includes(1), "Line 1 (EXCLUDE) should be decorated with the faded_unmatched opacity style");
        assert.strictEqual(decoratedIndices.length, 1, "Only the excluded line should receive any decorator modification");
    });

    test('Decorator properly overrides include matches with exclude filters', async () => {
        
        const localFilterManager = new FilterManager();
        const testUri = 'file:///test-decorator-override.log';
        localFilterManager.setActiveDocumentUri(testUri);
        
        // Add an INCLUDE filter
        const includeFilter = createFilter("TARGET");
        localFilterManager.addFilter(includeFilter, testUri);

        // Add an EXCLUDE filter
        const excludeFilter = createFilter("IGNORE");
        excludeFilter.isExclude = true;
        localFilterManager.addFilter(excludeFilter, testUri);

        const decorator = new Decorator(localFilterManager);

        const decoratedLines: {line: number, key: string}[] = [];
        const mockEditor = {
            document: {
                uri: { toString: () => testUri },
                lineCount: 2,
                lineAt: (i: number) => {
                    const texts = ["Line 1 TARGET", "Line 2 TARGET IGNORE"];
                    return { text: texts[i], range: { start: { line: i }, end: { line: i } } };
                }
            },
            setDecorations: (type: any, rangesOrOptions: any[]) => {
                let foundKey = "unknown";
                for (const [k, v] of (decorator as any).decorationTypes.entries()) {
                    if (v === type) { foundKey = k; break; }
                }

                for (const r of rangesOrOptions) {
                    if (r.range) {
                        decoratedLines.push({ line: r.range.start.line, key: foundKey });
                    } else {
                        decoratedLines.push({ line: r.start.line, key: foundKey });
                    }
                }
            }
        };

        (decorator as any).activeEditor = mockEditor;
        (decorator as any).updateDecorations();
        
        // Check what keys were applied to what lines
        const line0Dec = decoratedLines.find(d => d.line === 0);
        const line1Dec = decoratedLines.find(d => d.line === 1);

        assert.ok(line0Dec, "Line 0 should be decorated");
        assert.ok(!line0Dec?.key.includes("faded"), "Line 0 (TARGET) should receive the brightly colored decoration, NOT faded");
        
        assert.ok(line1Dec, "Line 1 should be decorated");
        assert.ok(line1Dec?.key.includes("faded"), "Line 1 (TARGET IGNORE) should receive the faded_unmatched decoration because exclude properly overrides it");
    });

    test('Decorator clears zombie decorations from previous updates', async () => {
        // This test simulates the issue where toggling from an unfiltered view
        // to a filtered view leaves leftover "faded" decorations floating on lines
        // that are now perfectly matched.
        
        const localFilterManager = new FilterManager();
        const testUri = 'file:///test-decorator-zombie.log';
        localFilterManager.setActiveDocumentUri(testUri);
        
        // Add an INCLUDE filter
        const includeFilter = createFilter("TARGET");
        localFilterManager.addFilter(includeFilter, testUri);

        const decorator = new Decorator(localFilterManager);

        // Keep track of what options are set for each type
        const appliedDecorations = new Map<any, any[]>();

        // Scenario 1: Unfiltered document (contains unmatched lines)
        const mockEditor = {
            document: {
                uri: { toString: () => testUri },
                lineCount: 2,
                lineAt: (i: number) => {
                    // Line 0 MATCHES, Line 1 DOES NOT
                    const texts = ["Line 1 TARGET", "Line 2 MISS"];
                    return { text: texts[i], range: { start: { line: i }, end: { line: i } } };
                }
            },
            setDecorations: (type: any, rangesOrOptions: any[]) => {
                appliedDecorations.set(type, rangesOrOptions);
            }
        };

        (decorator as any).activeEditor = mockEditor;
        (decorator as any).updateDecorations();
        
        // Find the faded decoration type
        let fadedType: any = undefined;
        let fadedKey = '';
        for (const [key, type] of (decorator as any).decorationTypes.entries()) {
            if (key.includes("faded")) {
                fadedType = type;
                fadedKey = key;
                break;
            }
        }
        
        assert.ok(fadedType, "Faded decoration type should be created");
        assert.ok(appliedDecorations.get(fadedType)?.length === 1, "Faded decoration should be applied to 1 line initially");

        // Scenario 2: Filtered document (contains ONLY matched lines)
        mockEditor.document.lineAt = (i: number) => {
            // Now BOTH lines MATCH
            const texts = ["Line 1 TARGET", "Line 2 ALSO TARGET"];
            return { text: texts[i], range: { start: { line: i }, end: { line: i } } };
        };

        // Clear tracking before the second pass
        appliedDecorations.clear();
        
        // Update again (simulating updating the webview state to Filtered)
        (decorator as any).updateDecorations();

        // The faded type should still exist in memory cache
        assert.ok((decorator as any).decorationTypes.has(fadedKey), "Faded type should remain in memory cache");
        
        // BUT it MUST have been explicitly swept with an empty array!
        assert.ok(appliedDecorations.has(fadedType), "setDecorations must be predictability called on the old faded type to clear zombies");
        assert.strictEqual(appliedDecorations.get(fadedType)?.length, 0, "Zombie faded decoration options array MUST be strictly empty");
    });
});
