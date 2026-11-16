const http = require('http');

const port = process.argv[2] || '9223';

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
  const targets = await getJson('http://127.0.0.1:' + port + '/json');
  const page = targets.find(t => t.type === 'page');
  if (!page) { console.log('NO_PAGE'); return; }
  console.log('title:', page.title, '| url:', page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const expr = `JSON.stringify({
    text: document.body.innerText.replace(/\\n{2,}/g,'\\n').slice(0, 700),
    menus: [...document.querySelectorAll('[role="menuitem"], button')].slice(0,20).map(e => (e.innerText||'').trim()).filter(Boolean)
  })`;

  ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id === 1) {
      const v = m.result && m.result.result && m.result.result.value;
      if (typeof v === 'string') {
        const o = JSON.parse(v);
        console.log('--- 界面文本 ---');
        console.log(o.text);
        console.log('--- 按钮样本 ---');
        console.log(o.menus.join(' | '));
      } else {
        console.log('RAW:', JSON.stringify(m.result).slice(0, 500));
      }
      ws.close();
    }
  };
  setTimeout(() => { try { ws.close(); } catch (e) {} process.exit(0); }, 8000);
})();
