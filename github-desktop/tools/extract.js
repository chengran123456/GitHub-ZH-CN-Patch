const fs = require('fs');
const path = require('path');

const APP = process.env.GHD_APP || 'C:/Users/Kosto/AppData/Local/GitHubDesktop/app-3.6.10/resources/app';
const OUT = path.join(__dirname, '..', 'ref');

const map = JSON.parse(fs.readFileSync(path.join(APP, 'renderer.js.map'), 'utf8'));
const files = [];
map.sources.forEach(function (src, i) {
  const content = map.sourcesContent && map.sourcesContent[i];
  if (!content) return;
  if (!/app\/src\/.*\.tsx?$/.test(src)) return;
  if (/\.d\.ts$/.test(src)) return;
  files.push({ src: src, content: content });
});
console.log('tsx/ts 源文件 =', files.length);

const hits = new Map();
const NON_UI = /(log\.(debug|info|warn|error)|console\.(log|warn|error|debug)|throw new |assert\.|\.toString\(\)|JSON\.stringify|localStorage|sessionStorage)/;
function add(text, kind, src, content, idx) {
  const t = String(text).trim();
  if (!t) return;
  let e = hits.get(t);
  if (!e) { e = { text: t, kinds: [], files: [], ctx: '', ui: false }; hits.set(t, e); }
  if (e.kinds.indexOf(kind) < 0) e.kinds.push(kind);
  if (e.files.indexOf(src) < 0) e.files.push(src);
  const isJsxFile = /\.tsx$/.test(src);
  const around = content.slice(Math.max(0, idx - 60), idx + 120).replace(/\s+/g, ' ');
  if (isJsxFile && !NON_UI.test(around)) e.ui = true;
  if (!e.ctx) e.ctx = around.trim();
}

const ATTRS = 'title|label|description|message|placeholder|aria-label|alt|tooltip|heading|confirmLabel|cancelLabel|screenReaderLabel|placeholderText|summary';
const A = '(?:' + ATTRS + ')';
const passes = [
  [new RegExp('\\b' + A + '\\s*=\\s*"([^"\\n]{2,200})"', 'g'), 'attr-dq'],
  [new RegExp("\\b" + A + "\\s*=\\s*'([^'\\n]{2,200})'", 'g'), 'attr-sq'],
  [new RegExp('\\b' + A + '\\s*=\\s*\\{`([^`]{2,200})`\\}', 'g'), 'attr-tpl'],
  [new RegExp('\\b' + A + '\\s*:\\s*"([^"\\n]{2,200})"', 'g'), 'prop-dq'],
  [new RegExp("\\b" + A + "\\s*:\\s*'([^'\\n]{2,200})'", 'g'), 'prop-sq'],
  [new RegExp('\\b' + A + '\\s*:\\s*`([^`]{2,200})`', 'g'), 'prop-tpl'],
  [/(?<![=\w$])>\s*([A-Za-z][^<>{}]{1,180}?)\s*</g, 'jsx-text'],
  [/`([^`]{0,80}\$\{[^`]{1,200})`/g, 'template'],
];

for (const f of files) {
  const c = f.content;
  for (const [re, kind] of passes) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(c)) !== null) add(m[1], kind, f.src, c, m.index);
  }
}

const TS_NOISE = /^(void|Promise|new Promise|Map|Set|Array|Object|String|Number|Boolean|Function|Error|Date|RegExp|JSON|Symbol|WeakMap|ReadonlyArray|ReadonlyMap|ReadonlySet|Partial|Record|Pick|Omit|Exclude|Extract|ReturnType|Awaited)$/;
const NOISE = [
  /^extends\b/, /^@[a-zA-Z]/, /^https?:\/\//, /^[A-Z][A-Z0-9_]{3,}$/,
  /^[a-z][a-zA-Z0-9]*$/, /^\d+$/, /^#[0-9a-fA-F]{3,8}$/,
  /^(px|em|rem|vh|vw|%)/, /^\d{4}-\d\d-\d\d/, /^[\s\W]*$/,
  /^\.{0,2}\//, /^(var|rgba?|hsla?)\(/,
];
function looksHuman(t, kinds) {
  if (t.length < 2 || t.length > 160) return false;
  if (TS_NOISE.test(t)) return false;
  if (NOISE.some(function (re) { return re.test(t); })) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  const isTpl = kinds.indexOf('template') >= 0 || kinds.indexOf('prop-tpl') >= 0 || kinds.indexOf('attr-tpl') >= 0;
  if (isTpl) {
    const flat = t.replace(/\$\{[^}]*\}/g, 'X');
    if (!/[A-Za-z]{2,}/.test(flat)) return false;
    if (/^[a-z][a-zA-Z0-9_.]*X$/.test(flat)) return false;
    return true;
  }
  if (!/\s/.test(t) && t.length < 4) return false;
  if (/^[A-Za-z0-9_$.\-]+$/.test(t) && !/^[A-Z][a-z]+$/.test(t)) return false;
  if (/[{};=<>]/.test(t)) return false;
  if (/\n/.test(t)) return false;
  if (/: /.test(t)) return false;
  return true;
}

const list = [];
for (const e of hits.values()) { if (looksHuman(e.text, e.kinds)) list.push(e); }
list.sort(function (a, b) {
  if (b.files.length !== a.files.length) return b.files.length - a.files.length;
  return b.text.length - a.text.length;
});

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'candidates.json'), JSON.stringify(list, null, 1), 'utf8');

const uiList = list.filter(function (e) { return e.ui; });
fs.writeFileSync(path.join(OUT, 'candidates-ui.json'), JSON.stringify(uiList, null, 1), 'utf8');

const kinds = {};
list.forEach(function (e) { e.kinds.forEach(function (k) { kinds[k] = (kinds[k] || 0) + 1; }); });
console.log('去重后候选 =', list.length);
console.log('按类型 =', JSON.stringify(kinds));
const tpl = list.filter(function (e) { return /tpl|template/.test(e.kinds.join()); });
console.log('含插值 =', tpl.length);
console.log('');
console.log('【上屏候选 ui=true】= ' + uiList.length);
const uiTpl = uiList.filter(function (e) { return /tpl|template/.test(e.kinds.join()); });
console.log('  其中含插值 = ' + uiTpl.length);
console.log('  纯文本（可直接字典匹配）= ' + (uiList.length - uiTpl.length));
console.log('');
console.log('--- ui=true 纯文本，按长度倒序前 40 ---');
uiList.filter(function (e) { return !/tpl|template/.test(e.kinds.join()); })
  .sort(function (a, b) { return b.text.length - a.text.length; })
  .slice(0, 40)
  .forEach(function (e) { console.log('  ' + JSON.stringify(e.text)); });
