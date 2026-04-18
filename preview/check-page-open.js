const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targetUrl = process.argv[2];
  const debugPort = process.argv[3] || '9224';

  if (!targetUrl) {
    console.error('Usage: node preview/check-page-open.js <url> [debugPort]');
    process.exit(2);
  }

  const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((r) => r.json());
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  const pending = new Map();
  const requestUrls = new Map();
  const state = {
    console: [],
    exceptions: [],
    loadingFailed: [],
  };
  let nextId = 1;
  let sessionId = null;

  const send = (method, params = {}, sid = sessionId) => {
    const id = nextId++;
    const payload = { id, method, params };
    if (sid) payload.sessionId = sid;
    ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.id) {
      const handler = pending.get(msg.id);
      if (!handler) return;
      pending.delete(msg.id);
      if (msg.error) handler.reject(new Error(JSON.stringify(msg.error)));
      else handler.resolve(msg.result);
      return;
    }

    if (msg.method === 'Target.attachedToTarget') {
      sessionId = msg.params.sessionId;
      return;
    }

    if (msg.method === 'Network.requestWillBeSent') {
      requestUrls.set(msg.params.requestId, msg.params.request.url);
      return;
    }

    if (msg.method === 'Network.loadingFailed') {
      state.loadingFailed.push({
        url: requestUrls.get(msg.params.requestId) || null,
        errorText: msg.params.errorText,
      });
      return;
    }

    if (msg.method === 'Runtime.exceptionThrown') {
      const details = msg.params.exceptionDetails || {};
      state.exceptions.push({
        text: details.text,
        line: details.lineNumber,
        column: details.columnNumber,
        description: details.exception?.description || details.exception?.value || null,
      });
      return;
    }

    if (msg.method === 'Runtime.consoleAPICalled') {
      state.console.push({
        type: msg.params.type,
        args: (msg.params.args || []).map((arg) => arg.value ?? arg.description ?? arg.unserializableValue ?? '[object]'),
      });
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, undefined);
  await send('Target.attachToTarget', { targetId, flatten: true }, undefined);
  while (!sessionId) await sleep(50);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Log.enable');

  await send('Page.navigate', { url: targetUrl });
  await sleep(8000);

  const summaryEval = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      href: location.href,
      title: document.title,
      rootChildren: document.getElementById('root')?.children?.length ?? null,
      tweaksChildren: document.getElementById('tweaks-root')?.children?.length ?? null,
      bodyText: document.body.innerText.slice(0, 160),
      readyState: document.readyState
    })`,
    returnByValue: true,
  });

  const summary = JSON.parse(summaryEval.result.value);
  const ok =
    summary.rootChildren > 0 &&
    state.exceptions.length === 0 &&
    state.loadingFailed.length === 0;

  const result = {
    ok,
    page: summary,
    loadingFailed: state.loadingFailed,
    exceptions: state.exceptions,
    console: state.console,
  };

  console.log(JSON.stringify(result, null, 2));
  ws.close();
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
