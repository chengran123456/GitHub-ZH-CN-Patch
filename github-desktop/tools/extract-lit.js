const fs = require('fs');
const path = require('path');
const APP = process.env.GHD_APP || 'C:/Users/Kosto/AppData/Local/GitHubDesktop/app-3.6.10/resources/app';
const OUT = path.join(__dirname, '..', 'ref');

const map = JSON.parse(fs.readFileSync(path.join(APP, 'renderer.js.map'), 'utf8'));
const files = [];
map.sources.forEach(function (src, i) {
  const c = map.sourcesContent && map.sourcesContent[i];
  if (!c) return;
  if (!/app\/src\/(ui|lib)\/.*\.tsx?$/.test(src)) return;
  if (/\.d\.ts$/.test(src)) return;
  files.push({ src: src.replace(/^webpack:\/\/\/?/, ''), c: c });
});
console.log('扫描文件 =', files.length);

function scan(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (ch === '/' && src[i + 1] !== '/' && src[i + 1] !== '*' && /^\/[^/*\s]/.test(src.slice(i, i + 2))) {
      i++;
      let inClass = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { i++; break; }
        else if (c === '\n') break;
        i++;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const start = i;
      i++;
      let buf = '';
      let closed = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') { buf += c + (src[i + 1] || ''); i += 2; continue; }
        if (c === ch) { closed = true; i++; break; }
        if (ch !== '`' && c === '\n') break;
        buf += c;
        i++;
      }
      if (closed) out.push({ s: buf, q: ch, at: start, ctx: src.slice(Math.max(0, start - 80), start).replace(/\s+/g, ' ') });
      continue;
    }
    i++;
  }
  return out;
}

const BAD = [
  /^[\s\W]*$/, /^[a-z][a-zA-Z0-9_$]*$/, /^[A-Z][A-Z0-9_]{2,}$/,
  /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/, /^https?:/, /^\//, /^\.\.?\//,
  /^#/, /^-?\d/, /^(px|em|rem|%)/, /[{}]/, /^[a-z-]+:[a-z-]+/,
  /^(true|false|null|undefined)$/, /^[a-f0-9]{8,}$/i,
  /^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/, /^[\w.-]+@[\w.-]+$/,
  /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/,
  /^[MLHVCSQTAZmlhvcsqtaz][\d\s.,-]+$/, /^[Mml]\s*-?\d/,
  /\^/, /\$\{?[0-9]/, /\.\*/, /^fatal:/, /^error:/,
  /^[a-z0-9]+( [a-z0-9-]+)+$/,
  /^\d+(\.\d+)?(px|em|rem|%)?(\s+\d+(\.\d+)?(px|em|rem|%)?)+$/,
];
function isUi(s, isTpl) {
  if (s.length < 2 || s.length > 220) return false;
  const probe = isTpl ? s.replace(/\$\{[^}]*\}/g, 'X') : s;
  if (BAD.some(function (re) { return re.test(probe); })) return false;
  if (!/[A-Za-z]{2,}/.test(probe)) return false;
  if (!isTpl && /[=<>!&|[\]\\]/.test(s)) return false;
  const words = probe.trim().split(/\s+/);
  if (words.length === 1) {
    const w = words[0].replace(/^[^\w]+|[^\w]+$/g, '');
    if (isTpl) return false;
    if (!/^[A-Z][a-z]{2,}$/.test(w) && !/^[A-Z]{2,}$/.test(w)) return false;
  }
  return true;
}

const got = new Map();
for (const f of files) {
  for (const it of scan(f.c)) {
    const isTpl = it.q === '`' && it.s.indexOf('${') >= 0;
    if (!isUi(it.s, isTpl)) continue;
    let e = got.get(it.s);
    if (!e) { e = { text: it.s, files: [], ctx: '', tpl: false }; got.set(it.s, e); }
    if (isTpl) e.tpl = true;
    if (e.files.indexOf(f.src) < 0) e.files.push(f.src);
    if (!e.ctx) e.ctx = it.ctx;
  }
}

const all = [...got.values()];
const pure = all.filter(function (e) { return !e.tpl; });
const tpl = all.filter(function (e) { return e.tpl; });
const bylen = function (a, b) { return b.text.length - a.text.length; };
pure.sort(bylen);
tpl.sort(bylen);

fs.writeFileSync(path.join(OUT, 'lit-pure.json'), JSON.stringify(pure, null, 1), 'utf8');
fs.writeFileSync(path.join(OUT, 'lit-tpl.json'), JSON.stringify(tpl, null, 1), 'utf8');
fs.writeFileSync(path.join(OUT, 'lit-pure.tsv'), pure.map(function (e, i) {
  return String(i + 1).padStart(4, '0') + '\t' + e.text.replace(/\s+/g, ' ') + '\t[' + (e.files[0] || '').replace('app/src/', '') + ']';
}).join('\n'), 'utf8');
fs.writeFileSync(path.join(OUT, 'lit-tpl.tsv'), tpl.map(function (e, i) {
  return String(i + 1).padStart(4, '0') + '\t' + e.text.replace(/\s+/g, ' ') + '\t[' + (e.files[0] || '').replace('app/src/', '') + ']';
}).join('\n'), 'utf8');

console.log('纯文本候选 =', pure.length);
console.log('含插值候选 =', tpl.length);
console.log('');
console.log('--- 纯文本抽样（每 40 取 1）---');
pure.filter(function (e, i) { return i % Math.ceil(pure.length / 30) === 0; })
  .forEach(function (e) { console.log('  ' + JSON.stringify(e.text).slice(0, 90)); });
