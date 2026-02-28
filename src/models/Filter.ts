export interface Filter {
    id: string;
    text: string;
    isRegex: boolean;
    isMatchCase: boolean;
    isEnabled: boolean;
    foregroundColor?: string;
    backgroundColor?: string;
}

export function createFilter(text: string, isRegex = false, isMatchCase = false): Filter {
    return {
        id: Math.random().toString(36).substring(2, 9),
        text,
        isRegex,
        isMatchCase,
        isEnabled: true,
    };
}
