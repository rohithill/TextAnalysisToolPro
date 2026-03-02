const vscode = require('vscode-uri');
const u1 = vscode.URI.parse('textanalysistoolpro:/[Filtered] file.txt?file:///a/file.txt');
console.log(u1.query);
const u2 = vscode.URI.from({ scheme: 'textanalysistoolpro', path: '/[Filtered] file.txt', query: 'file:///b/file.txt' });
console.log(u2.query);
console.log(u2.toString());
