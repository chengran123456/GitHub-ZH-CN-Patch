const fs = require('fs');
const path = require('path');
const APP = process.env.GHD_APP || 'C:/Users/Kosto/AppData/Local/GitHubDesktop/app-3.6.10/resources/app';
const map = JSON.parse(fs.readFileSync(path.join(APP, 'renderer.js.map'), 'utf8'));

const targets = ['Changes', 'History', 'Push', 'Pull', 'Fetch', 'No local changes', 'Discard changes'];
const out = {};
map.sources.forEach(function (src, i) {
  const c = map.sourcesContent && map.sourcesContent[i];
  if (!c || !/app\/src\//.test(src)) return;
  targets.forEach(function (t) {
    const re = new RegExp("(['\"`])" + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\1', 'g');
    let m;
    while ((m = re.exec(c)) !== null) {
      if (!out[t]) out[t] = [];
      if (out[t].length < 4) {
        out[t].push({ f: src.replace(/^webpack:\/\/\/?/, ''), ctx: c.slice(Math.max(0, m.index - 110), m.index + 90).replace(/\s+/g, ' ') });
      }
    }
  });
});
targets.forEach(function (t) {
  console.log('');
  console.log('=== ' + t + ' ===');
  (out[t] || []).forEach(function (h) {
    console.log('  [' + h.f + ']');
    console.log('    ' + h.ctx);
  });
  if (!out[t]) console.log('  (无字面量)');
});
