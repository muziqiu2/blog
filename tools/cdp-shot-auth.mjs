#!/usr/bin/env node
/**
 * cdp-shot-auth.mjs —— 需要登录的站点截图（基于 tools/cdp-shot.mjs 改造）
 *
 * 流程：打开登录页 → 页面内 fetch 提交登录表单（带 CSRF，不销毁执行上下文）
 *       → 登录成功后依次导航到各目标页截图（同一浏览器会话，Cookie 连续）。
 *
 * 用法:
 *   node tools/cdp-shot-auth.mjs --login <loginUrl> --user <u> --pass <p> \
 *        --shot "<url>|<out.png>[|<waitMs>]" [--shot ...] [--width 1440] [--height 900] [--full]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_DEFAULT = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const name = k.slice(2);
    if (['full'].includes(name)) a[name] = true;
    else if (name === 'shot') (a[name] ||= []).push(argv[++i]);
    else a[name] = argv[++i];
  }
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, 60000);
    });
  }
  async waitEvent(method, timeout = 30000) {
    const t0 = Date.now();
    const base = this.events.length;
    while (Date.now() - t0 < timeout) {
      const hit = this.events.slice(base).find((e) => e.method === method);
      if (hit) return hit;
      await sleep(120);
    }
    return null;
  }
  drainEvents() {
    this.events.length = 0;
  }
}

async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.login || !args.user || !args.pass || !args.shot?.length) {
    console.error('用法: node tools/cdp-shot-auth.mjs --login <url> --user <u> --pass <p> --shot "<url>|<out.png>[|<waitMs>]" ...');
    process.exit(2);
  }
  const width = Number(args.width || 1440);
  const height = Number(args.height || 900);
  const scale = Number(args.scale || 1);
  const port = 9300 + Math.floor(Math.random() * 600);
  const userDataDir = path.join(os.tmpdir(), `cdp-shot-${port}`);

  const child = spawn(
    CHROME_DEFAULT,
    [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
      `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
      `--window-size=${width},${height}`, 'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true }
  );

  const cleanup = () => {
    try { child.kill(); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  };

  try {
    let version = null;
    for (let i = 0; i < 60; i++) {
      try { version = await getJSON(`http://127.0.0.1:${port}/json/version`); break; }
      catch { await sleep(300); }
    }
    if (!version) throw new Error('Chrome DevTools 端口未就绪');

    const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
      .then((r) => r.json())
      .catch(async () => {
        const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
        return list.find((t) => t.type === 'page');
      });

    const ws = new WebSocket(created.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: scale, mobile: false,
    });

    /* ---- 1) 登录页 ---- */
    cdp.drainEvents();
    await cdp.send('Page.navigate', { url: args.login });
    await cdp.waitEvent('Page.loadEventFired', 45000);
    await sleep(1200);

    const loginJs = `(async () => {
      const tok = document.querySelector('input[name="_token"]');
      const fu = document.querySelector('input[name="username"]');
      const fp = document.querySelector('input[name="password"]');
      if (!tok || !fu || !fp) return 'NO_FORM';
      const fd = new FormData();
      fd.append('_token', tok.value);
      fd.append('username', ${JSON.stringify(args.user)});
      fd.append('password', ${JSON.stringify(args.pass)});
      const res = await fetch(document.querySelector('form').action || '/login', {
        method: 'POST', body: fd, credentials: 'same-origin', redirect: 'follow',
      });
      return 'HTTP_' + res.status + '_URL_' + location.pathname;
    })()`;
    const loginRes = await cdp.send('Runtime.evaluate', {
      expression: loginJs, awaitPromise: true, returnByValue: true,
    });
    const loginOut = loginRes?.result?.value ?? JSON.stringify(loginRes);
    console.log('login:', loginOut);
    if (!String(loginOut).startsWith('HTTP_2')) {
      throw new Error('登录失败: ' + loginOut);
    }

    /* ---- 2) 逐页截图 ---- */
    for (const spec of args.shot) {
      const [url, out, waitMs] = spec.split('|');
      cdp.drainEvents();
      await cdp.send('Page.navigate', { url });
      await cdp.waitEvent('Page.loadEventFired', 45000);
      await sleep(Number(waitMs || 3000));

      let clip;
      if (args.full) {
        const m = await cdp.send('Page.getLayoutMetrics');
        const cs = m.cssContentSize || m.contentSize;
        const fh = Math.min(Math.ceil(cs.height), 12000);
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width, height: fh, deviceScaleFactor: scale, mobile: false,
        });
        await sleep(900);
        clip = { x: 0, y: 0, width, height: fh, scale: 1 };
      }

      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: !!args.full, ...(clip ? { clip } : {}),
      });
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
      const st = fs.statSync(out);
      console.log(`OK  ${out}  ${st.size} bytes`);
    }
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  console.error('失败:', e.message);
  process.exitCode = 1;
});
