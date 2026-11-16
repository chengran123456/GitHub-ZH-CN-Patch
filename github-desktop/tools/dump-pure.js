const fs = require('fs');
const path = require('path');
const list = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ref', 'candidates-ui.json'), 'utf8'));
const pure = list.filter(function (e) { return !/tpl|template/.test(e.kinds.join()); });
pure.sort(function (a, b) {
  const fa = (a.files[0] || '').replace(/^webpack:\/\/\/?/, '');
  const fb = (b.files[0] || '').replace(/^webpack:\/\/\/?/, '');
  if (fa !== fb) return fa < fb ? -1 : 1;
  return a.text < b.text ? -1 : 1;
});
const lines = pure.map(function (e, i) {
  const f = (e.files[0] || '').replace(/^webpack:\/\/\/?/, '').replace(/^app\/src\//, '');
  return String(i + 1).padStart(3, '0') + '\t' + e.text.replace(/\s+/g, ' ') + '\t[' + f + ']';
});
fs.writeFileSync(path.join(__dirname, '..', 'ref', 'todo-pure.tsv'), lines.join('\n'), 'utf8');
console.log('pure =', pure.length);
console.log(lines.slice(0, 8).join('\n'));
