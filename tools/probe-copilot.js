const http = require('http');

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  const targets = await getJson('http://127.0.0.1:9222/json');
  const page = targets.find(t => t.type === 'page' && t.url.startsWith('http://tauri.localhost'));
  if (!page) { console.log('NO_PAGE'); return; }
  console.log('url:', page.url, '| title:', page.title);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const expr = `JSON.stringify({
    visibility: document.visibilityState,
    lang: document.documentElement.lang,
    text: document.body.innerText.replace(/\\n{2,}/g,'\\n').slice(0, 900),
    sample: [...document.querySelectorAll('button, [role="tab"], [role="menuitem"], a')].slice(0,25).map(e => (e.innerText||'').trim() || e.getAttribute('aria-label') || '').filter(Boolean)
  })`;

  ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id === 1) {
      const v = m.result && m.result.result && m.result.result.value;
      if (typeof v === 'string') {
        const obj = JSON.parse(v);
        console.log('visibility:', obj.visibility, '| lang:', obj.lang);
        console.log('--- 界面文本样本 ---');
        console.log(obj.text);
        console.log('--- 按钮/标签样本 ---');
        console.log(obj.sample.join(' | '));
      } else {
        console.log('RAW:', JSON.stringify(m.result));
      }
      ws.close();
    }
  };
  setTimeout(() => { try { ws.close(); } catch (e) {} process.exit(0); }, 8000);
})();
