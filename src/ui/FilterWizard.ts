import * as vscode from 'vscode';
import { Filter, createFilter } from '../models/Filter';
import { FilterManager } from '../managers/FilterManager';

export class FilterWizard {
    static async run(filterManager: FilterManager, existingFilter?: Filter) {
        // Step 1: Text Input
        const text = await vscode.window.showInputBox({
            prompt: existingFilter ? 'Edit filter text' : 'Enter text to filter',
            value: existingFilter ? existingFilter.text : '',
            placeHolder: 'e.g., Error, Exception'
        });

        if (text === undefined || text.trim() === '') {
            return; // Cancelled or empty
        }

        // Step 2: Options
        const options: vscode.QuickPickItem[] = [
            { label: 'Regular Expression', description: 'Match using regex', picked: existingFilter?.isRegex },
            { label: 'Match Case', description: 'Case sensitive matching', picked: existingFilter?.isMatchCase },
            { label: 'Exclude', description: 'Hide lines matching this filter', picked: existingFilter?.isExclude }
        ];

        const selectedOptions = await vscode.window.showQuickPick(options, {
            canPickMany: true,
            placeHolder: 'Select filter options (Press Space to toggle, Enter to confirm)'
        });

        if (selectedOptions === undefined) {
            return; // Cancelled
        }

        const isRegex = selectedOptions.some(o => o.label === 'Regular Expression');
        const isMatchCase = selectedOptions.some(o => o.label === 'Match Case');
        const isExclude = selectedOptions.some(o => o.label === 'Exclude');

        // Step 3: Foreground Color
        const colorOptions = [
            { label: 'Default', description: 'No custom foreground color' },
            { label: 'Red', description: '#ff5555' },
            { label: 'Green', description: '#50fa7b' },
            { label: 'Yellow', description: '#f1fa8c' },
            { label: 'Blue', description: '#8be9fd' },
            { label: 'Magenta', description: '#ff79c6' },
            { label: 'Cyan', description: '#8be9fd' },
            { label: 'Custom', description: 'Enter hex code manually...' }
        ];

        let fgColorOption = await vscode.window.showQuickPick(colorOptions, {
            placeHolder: 'Select Foreground Color'
        });

        if (fgColorOption === undefined) return;

        let foregroundColor = existingFilter?.foregroundColor || '#ffffff'; // default
        if (fgColorOption.label === 'Default') {
            foregroundColor = ''; // handled by decorator
        } else if (fgColorOption.label === 'Custom') {
            const hex = await vscode.window.showInputBox({
                prompt: 'Enter Hex Color Code',
                value: existingFilter?.foregroundColor || '#ffffff'
            });
            if (hex === undefined) return;
            foregroundColor = hex;
        } else {
            foregroundColor = fgColorOption.description!;
        }

        // Step 4: Background Color
        const bgOptions = [
            { label: 'Default', description: 'Default background highlighting' },
            { label: 'Dark Gray', description: '#44475a' },
            { label: 'Red', description: 'rgba(255, 85, 85, 0.3)' },
            { label: 'Green', description: 'rgba(80, 250, 123, 0.3)' },
            { label: 'Yellow', description: 'rgba(241, 250, 140, 0.3)' },
            { label: 'Blue', description: 'rgba(139, 233, 253, 0.3)' },
            { label: 'Custom', description: 'Enter hex or rgba code manually...' }
        ];

        let bgColorOption = await vscode.window.showQuickPick(bgOptions, {
            placeHolder: 'Select Background Color'
        });

        if (bgColorOption === undefined) return;

        let backgroundColor = existingFilter?.backgroundColor || 'rgba(255, 255, 0, 0.3)';
        if (bgColorOption.label === 'Default') {
            backgroundColor = 'rgba(255, 255, 0, 0.3)';
        } else if (bgColorOption.label === 'Custom') {
            const hex = await vscode.window.showInputBox({
                prompt: 'Enter Hex or RGBA Color Code',
                value: existingFilter?.backgroundColor || 'rgba(255, 255, 0, 0.3)'
            });
            if (hex === undefined) return;
            backgroundColor = hex;
        } else {
            backgroundColor = bgColorOption.description!;
        }

        // Save
        const filter: Filter = {
            id: existingFilter ? existingFilter.id : Math.random().toString(36).substring(2, 9),
            text,
            isRegex,
            isMatchCase,
            isExclude,
            isEnabled: existingFilter ? existingFilter.isEnabled : true,
            foregroundColor,
            backgroundColor
        };

        if (existingFilter) {
            filterManager.updateFilter(filter);
        } else {
            filterManager.addFilter(filter);
        }
    }
}
