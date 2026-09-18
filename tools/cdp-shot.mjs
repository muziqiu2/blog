#!/usr/bin/env node
/**
 * cdp-shot.mjs —— 用 CDP 精确控制无头 Chrome 截图（零依赖，Node 22 内置 WebSocket）
 *
 * 相比 `chrome --screenshot` 的好处：
 *   - 可注入 JS（关弹窗、展开折叠、滚动触发懒加载）
 *   - 可任意设定视口宽度（不受 Windows 最小窗口宽 ~500px 限制）
 *   - 支持整页截图（captureBeyondViewport）
 *
 * 用法:
 *   node tools/cdp-shot.mjs --url <url> --out <file.png> [选项]
 * 选项:
 *   --width 1440        视口宽（默认 1440）
 *   --height 900        视口高（默认 900）
 *   --scale 2           设备像素比（默认 1）
 *   --mobile            以移动端模式渲染（启用 mobile 视图与触摸）
 *   --full              整页截图
 *   --wait 3500         加载后额外等待毫秒
 *   --js "<code>"       截图前执行的 JS
 *   --js-file <path>    从文件读取要执行的 JS
 *   --chrome <path>     Chrome 可执行文件路径
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
    if (['mobile', 'full'].includes(name)) {
      a[name] = true;
    } else {
      a[name] = argv[++i];
    }
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
    while (Date.now() - t0 < timeout) {
      const hit = this.events.find((e) => e.method === method);
      if (hit) return hit;
      await sleep(120);
    }
    return null;
  }
}

async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url || !args.out) {
    console.error('用法: node tools/cdp-shot.mjs --url <url> --out <file.png> [--width 1440 --height 900 --full --mobile --wait 3500 --js "..."]');
    process.exit(2);
  }
  const chromePath = args.chrome || CHROME_DEFAULT;
  const width = Number(args.width || 1440);
  const height = Number(args.height || 900);
  const scale = Number(args.scale || 1);
  const waitMs = Number(args.wait || 3500);
  const port = 9300 + Math.floor(Math.random() * 600);
  const userDataDir = path.join(os.tmpdir(), `cdp-shot-${port}`);

  let js = args.js || '';
  if (args['js-file']) js = fs.readFileSync(args['js-file'], 'utf8');

  const child = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      `--window-size=${width},${height}`,
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true }
  );

  const cleanup = () => {
    try {
      child.kill();
    } catch {}
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  };

  try {
    // 等 DevTools 起来
    let version = null;
    for (let i = 0; i < 60; i++) {
      try {
        version = await getJSON(`http://127.0.0.1:${port}/json/version`);
        break;
      } catch {
        await sleep(300);
      }
    }
    if (!version) throw new Error('Chrome DevTools 端口未就绪');

    // 新建标签页
    const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
      .then((r) => r.json())
      .catch(async () => {
        const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
        return list.find((t) => t.type === 'page');
      });

    const wsUrl = created.webSocketDebuggerUrl;
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });

    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: !!args.mobile,
    });
    if (args.mobile) {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Network.setUserAgentOverride', {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      });
    }

    await cdp.send('Page.navigate', { url: args.url });
    await cdp.waitEvent('Page.loadEventFired', 45000);
    await sleep(waitMs);

    if (js) {
      await cdp.send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
      await sleep(600);
    }

    let clip;
    if (args.full) {
      const m = await cdp.send('Page.getLayoutMetrics');
      const cs = m.cssContentSize || m.contentSize;
      const fh = Math.min(Math.ceil(cs.height), 12000);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: fh,
        deviceScaleFactor: scale,
        mobile: !!args.mobile,
      });
      await sleep(900);
      clip = { x: 0, y: 0, width, height: fh, scale: 1 };
    }

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: !!args.full,
      ...(clip ? { clip } : {}),
    });

    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, Buffer.from(shot.data, 'base64'));
    const st = fs.statSync(args.out);
    console.log(`OK  ${args.out}  ${st.size} bytes  ${width}x${args.full ? 'full' : height}@${scale}`);
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  console.error('失败:', e.message);
  process.exitCode = 1;
});
