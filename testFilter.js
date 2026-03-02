const filters = [];
function addFilter(filter) {
    const usedLetters = new Set(filters.map(f => f.letter).filter(Boolean));
    let nextLetter = undefined;
    for (let i = 0; i < 26; i++) {
        const char = String.fromCharCode(97 + i); // 'a' is 97
        if (!usedLetters.has(char)) {
            nextLetter = char;
            break;
        }
    }
    filter.letter = nextLetter;
    filters.push(filter);
}
addFilter({id: "1", text: "first"});
addFilter({id: "2", text: "second"});
console.log(filters);
