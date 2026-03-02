export interface Filter {
    id: string;
    text: string;
    isRegex: boolean;
    isMatchCase: boolean;
    isEnabled: boolean;
    isExclude: boolean;
    foregroundColor: string;
    backgroundColor: string;
    description?: string;
    letter?: string;
}

export function createFilter(
    text: string,
    isRegex = false,
    isMatchCase = false,
    isExclude = false,
    foregroundColor = '#ffffff',
    backgroundColor = '#2d2d30',
    description = ''
): Filter {
    return {
        id: Math.random().toString(36).substring(2, 9),
        text,
        isRegex,
        isMatchCase,
        isEnabled: true,
        isExclude,
        foregroundColor,
        backgroundColor,
        description
    };
}
