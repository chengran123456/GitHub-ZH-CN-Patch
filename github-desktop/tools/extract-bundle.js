const fs = require('fs');
const path = require('path');
const APP = process.env.GHD_APP || 'C:/Users/Kosto/AppData/Local/GitHubDesktop/app-3.6.10/resources/app';
const OUT = path.join(__dirname, '..', 'ref');

const bundle = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8');
console.log('renderer.js =', bundle.length, '字符');

function scan(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  let lastEnd = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const start = i;
      i++;
      let buf = '';
      let closed = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') { buf += src[i + 1] === undefined ? '' : src[i + 1]; i += 2; continue; }
        if (c === ch) { closed = true; i++; break; }
        if (ch !== '`' && (c === '\n' || c === '\r')) break;
        buf += c;
        i++;
      }
      if (closed) out.push({ s: buf, q: ch, at: start, ctx: src.slice(Math.max(0, start - 90), start).replace(/\s+/g, ' ') });
      lastEnd = i;
      continue;
    }
    i++;
  }
  return out;
}

const raw = scan(bundle);
console.log('字符串字面量总数 =', raw.length);

const BAD = [
  /^[\s\W]*$/, /^[a-z][a-zA-Z0-9_$]*$/, /^[A-Z][A-Z0-9_]{2,}$/,
  /^https?:/, /^\//, /^\.\.?\//, /^#/, /^-?\d/, /^(px|em|rem|%)/,
  /[{};]/,
  /^(var|rgba?|hsla?)\(/,
  /^[a-z-]+(-[a-z]+)+$/,
  /^(true|false|null|undefined|NaN|Infinity)$/,
  /^[\w$]+[.:][\w$]+$/,
  /^(string|number|boolean|object|function|symbol|bigint)$/,
  /^[a-f0-9]{8,}$/i,
  /^(GET|POST|PUT|DELETE|PATCH)$/,
];
const NEED_SPACE = true;

function isUi(s) {
  if (s.length < 2 || s.length > 200) return false;
  if (BAD.some(function (re) { return re.test(s); })) return false;
  if (!/[A-Za-z]{2,}/.test(s)) return false;
  const words = s.trim().split(/\s+/);
  if (words.length === 1) {
    const w = words[0];
    if (!/^[A-Z][a-z]+$/.test(w)) return false;
    if (w.length < 3) return false;
  }
  if (/@/.test(s) && !/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(s)) return false;
  return true;
}

const map = new Map();
for (const it of raw) {
  if (!isUi(it.s)) continue;
  const t = it.s;
  let e = map.get(t);
  if (!e) { e = { text: t, count: 0, ctx: it.ctx }; map.set(t, e); }
  e.count++;
}

const list = [...map.values()].sort(function (a, b) { return b.text.length - a.text.length; });
fs.writeFileSync(path.join(OUT, 'bundle-strings.json'), JSON.stringify(list, null, 1), 'utf8');
const tsv = list.map(function (e, i) {
  return String(i + 1).padStart(4, '0') + '\t' + e.text.replace(/\s+/g, ' ') + '\t' + e.count;
});
fs.writeFileSync(path.join(OUT, 'bundle-strings.tsv'), tsv.join('\n'), 'utf8');
console.log('候选(去重) =', list.length);
console.log('');
console.log('--- 抽样 40 ---');
list.filter(function (e, i) { return i % Math.ceil(list.length / 40) === 0; }).slice(0, 40)
  .forEach(function (e) { console.log('  ' + JSON.stringify(e.text).slice(0, 100)); });
