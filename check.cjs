// 汇总验证脚本使用的依赖。
const { strict: assert } = require('node:assert');
const { readFileSync, mkdirSync } = require('node:fs');
const { chromium, webkit } = require('playwright');
const source = readFileSync(`${__dirname}/eartraining-autoeq.user.js`, 'utf8');
const sample = '# Test profile\nPreamp: -6 dB\nFilter 1: ON PK Fc 1000 Hz Gain 6 dB Q 1\n';

// 检查用户实际首页与训练页均在自动匹配范围内。
const matches = [...source.matchAll(/^\/\/\s*@match\s+(\S+)/gm)].map(match => match[1]);
for (const origin of ['https://eartraining.cn', 'https://app.eartraining.cn']) {
  assert.ok(matches.includes(`${origin}/*`), `${origin} 必须自动匹配`);
}

// 在隔离浏览器中验证导入、滤波、旁路和连接语义。
async function chk(engine, label) {
  const browser = await engine.launch({ headless: true, channel: label === 'chromium' ? 'msedge' : undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://app.eartraining.cn/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui}.v-application{min-height:100vh;background:#f7f7f7;--v-theme-primary:103,58,183;--v-theme-surface:255,255,255;--v-theme-on-surface:33,33,33}h1,p{padding:16px}</style><div class="v-application"><h1>AutoEQ 自动化验证页面</h1><p>用于检查 iPad 面板与音频路由，不是训练网站。</p></div>' }));
    // 记录浏览器真实音频连接与滤波器。
    await page.addInitScript(() => {
      if (!window.AudioNode) return;
      window.wires = [];
      window.cuts = [];
      window.filters = [];
      const connect = AudioNode.prototype.connect;
      const disconnect = AudioNode.prototype.disconnect;
      AudioNode.prototype.connect = function (...args) {
        const result = connect.apply(this, args);
        wires.push({ from: this, to: args[0], args });
        return result;
      };
      AudioNode.prototype.disconnect = function (...args) {
        const result = disconnect.apply(this, args);
        cuts.push({ from: this, args });
        return result;
      };
      const iir = BaseAudioContext.prototype.createIIRFilter;
      BaseAudioContext.prototype.createIIRFilter = function (...args) {
        const node = iir.apply(this, args);
        filters.push(node);
        return node;
      };
    });
    await page.addInitScript({ content: source });
    await page.goto('https://app.eartraining.cn/');
    assert.deepEqual(errors, [], `${label}: 页面初始化错误`);
    const host = page.locator('#eartraining-autoeq');
    const status = host.locator('#status');
    const toggle = host.locator('#toggle');
    const file = host.locator('input[type="file"]');
    const importer = host.locator('#import');
    // 检查窄屏触控布局并保存预览。
    async function vw() {
      for (const width of [320, 768, 1024]) {
        await page.setViewportSize({ width, height: 768 });
        assert.equal(await page.evaluate(() => {
          const shadow = document.querySelector('#eartraining-autoeq').shadowRoot;
          const rect = shadow.querySelector('.bar').getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth && rect.width <= 200 && rect.height <= 56 && [...shadow.querySelectorAll('button,#toggle')].every(e => e.getBoundingClientRect().height >= 44) && shadow.querySelector('.bar').innerText.replace(/\s+/g, ' ').trim() === '导入 EQ';
        }), true, `${label}: ${width}px 布局不应溢出`);
      }
      mkdirSync(`${__dirname}/test-results`, { recursive: true });
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.screenshot({ path: `${__dirname}/test-results/${label}-ipad.png` });
      await host.locator('.bar').screenshot({ path: `${__dirname}/test-results/${label}-controls.png` });
      if (!await toggle.isDisabled()) {
        await toggle.check();
        await host.locator('.bar').screenshot({ path: `${__dirname}/test-results/${label}-controls-on.png` });
      }
    }
    assert.equal(await toggle.isDisabled(), true);
    assert.equal(await host.locator('button').count(), 1);
    assert.equal(await host.getByRole('switch', { name: 'EQ', exact: true }).count(), 1);

    // 通过真实文件选择器接口导入文本。
    async function imprt(text, name = 'Test ParametricEq.txt') {
      await file.setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
      await page.waitForFunction(() => !document.querySelector('#eartraining-autoeq').shadowRoot.querySelector('input[type="file"]').value);
    }
    await imprt(sample);
    // 平台未提供 Web Audio 时仅检查真实界面与降级提示。
    if (!await page.evaluate(() => Boolean(window.AudioNode && (window.AudioContext || window.webkitAudioContext)))) {
      assert.equal(await toggle.isDisabled(), true);
      assert.match(await status.textContent(), /不支持 Web Audio/);
      assert.equal(await importer.getAttribute('title'), 'Test ParametricEq.txt');
      await page.reload();
      assert.equal(await importer.getAttribute('title'), 'Test ParametricEq.txt');
      await vw();
      assert.deepEqual(errors, []);
      console.log(`${label}: 界面、文件导入、刷新恢复和 320–1024px 布局通过；此平台缺少 Web Audio，音频检查未执行`);
      return;
    }
    assert.equal(await toggle.isChecked(), true);
    assert.equal(await status.textContent(), 'EQ 开启');

    // 检查真实 AudioNode 的路由与返回值。
    const routed = await page.evaluate(async () => {
      window.ctx = new AudioContext({ sampleRate: 48000 });
      await ctx.resume();
      window.src = ctx.createGain();
      const result = src.connect(ctx.destination);
      window.bus = wires.findLast(w => w.from === src).to;
      window.dry = wires.find(w => w.from === bus && w.to instanceof GainNode).to;
      return result === ctx.destination && bus !== ctx.destination;
    });
    assert.equal(routed, true);
    assert.equal(await status.textContent(), 'EQ 生效');
    assert.match(await toggle.evaluate(e => getComputedStyle(e.nextElementSibling, '::before').transform), /20/);
    const gain = await page.evaluate(() => {
      const freq = new Float32Array([1000]);
      const mag = new Float32Array(1);
      filters.at(-1).getFrequencyResponse(freq, mag, new Float32Array(1));
      const pre = wires.find(w => w.from === bus && w.to !== dry).to.gain.value;
      return 20 * Math.log10(mag[0] * pre);
    });
    assert.ok(Math.abs(gain) < 0.001, `${label}: 前级和峰值增益应互相抵消`);

    // 验证指定输出、全部输出和中间节点的连接与断开。
    const semantics = await page.evaluate(() => {
      src.disconnect(ctx.destination);
      const mapped = cuts.at(-1).args[0] === bus;
      let missing = false;
      try { src.disconnect(ctx.destination); } catch (error) { missing = error.name === 'InvalidAccessError'; }
      const middle = ctx.createGain();
      const same = src.connect(middle) === middle;
      src.connect(ctx.destination, 0, 0);
      src.disconnect(0);
      src.connect(ctx.destination);
      src.disconnect();
      src.connect(ctx.destination);
      const splitter = ctx.createChannelSplitter(2);
      splitter.connect(ctx.destination, 1, 0);
      splitter.disconnect(ctx.destination, 1, 0);
      let invalid = false;
      try { src.connect(ctx.destination, 0, 1); } catch (error) { invalid = error.name === 'IndexSizeError'; }
      const param = src.connect(middle.gain);
      return mapped && missing && same && invalid && param === undefined;
    });
    assert.equal(semantics, true);
    await toggle.click();
    assert.equal(await toggle.isChecked(), false);
    assert.equal(await status.textContent(), 'EQ 关闭');
    assert.equal(await toggle.evaluate(e => getComputedStyle(e.nextElementSibling, '::before').transform), 'none');
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(() => Math.abs(dry.gain.value - 1) < 0.001));
    await toggle.click();
    await toggle.press('Space');
    assert.equal(await toggle.isChecked(), false);
    await toggle.press('Space');
    assert.equal(await toggle.isChecked(), true);
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(() => dry.gain.value < 0.001));

    // 拒绝错误格式、缺项和越界值，并保留旧配置。
    for (const bad of ['', 'GraphicEQ: 20 0; 1000 -3', sample.replace('Q 1', 'Q 0'), sample.replace('1000 Hz', '25000 Hz'), sample.replace('-6 dB', 'NaN dB'), sample + 'Preamp: 0 dB', sample.replace('ON PK', 'OFF PK'), sample.replace('PK', 'LS'), sample.repeat(2000)]) {
      await imprt(bad, 'invalid.txt');
      assert.match(await status.textContent(), /导入失败/);
      assert.equal(await importer.getAttribute('title'), 'Test ParametricEq.txt');
      assert.equal(await toggle.isChecked(), true);
    }

    // 验证两类搁架的中心增益、Q 值和不同采样率。
    for (const type of ['LSC', 'HSC']) {
      await imprt(sample.replace('ON PK', `ON ${type}`));
      const response = await page.evaluate(() => {
        const mag = new Float32Array(3);
        filters.at(-1).getFrequencyResponse(new Float32Array([1, 1000, 23000]), mag, new Float32Array(3));
        return Array.from(mag, value => 20 * Math.log10(value));
      });
      assert.ok(Math.abs(response[1] - 3) < 0.001);
      assert.ok(Math.abs(response[type === 'LSC' ? 0 : 2] - 6) < 0.01);
      assert.ok(Math.abs(response[type === 'LSC' ? 2 : 0]) < 0.01);
    }
    await imprt(sample.replace('PK', 'LSC').replace('Q 1', 'Q 1.4'));
    const resonant = await page.evaluate(() => {
      const mag = new Float32Array(1);
      filters.at(-1).getFrequencyResponse(new Float32Array([500]), mag, new Float32Array(1));
      return mag[0];
    });
    await imprt(sample.replace('PK', 'LSC').replace('Q 1', 'Q 0.7'));
    const regular = await page.evaluate(() => {
      const mag = new Float32Array(1);
      filters.at(-1).getFrequencyResponse(new Float32Array([500]), mag, new Float32Array(1));
      return mag[0];
    });
    assert.ok(Math.abs(resonant - regular) > 0.1, '搁架 Q 值必须保留');
    await imprt('\uFEFF' + sample.replaceAll('\n', '\r\n') + 'Filter 2: OFF PK Fc 2000 Hz Gain 1 dB Q 1\r\n');
    await page.evaluate(async () => {
      window.ctx2 = new AudioContext({ sampleRate: 44100 });
      await ctx2.resume();
      ctx2.createGain().connect(ctx2.destination);
      window.low = new AudioContext({ sampleRate: 16000 });
      await low.resume();
      low.createGain().connect(low.destination);
    });
    await imprt(sample.replace('1000 Hz', '10000 Hz'), 'nyquist.txt');
    assert.match(await status.textContent(), /采样率/);
    assert.equal(await importer.getAttribute('title'), 'Test ParametricEq.txt');

    // 确保离线渲染不被改写，并保持双声道声像。
    assert.equal(await page.evaluate(async () => {
      const offline = new OfflineAudioContext(2, 128, 48000);
      const buffer = offline.createBuffer(2, 128, 48000);
      buffer.getChannelData(0)[0] = 0.5;
      buffer.getChannelData(1)[0] = -0.25;
      const node = offline.createBufferSource();
      node.buffer = buffer;
      const result = node.connect(offline.destination);
      const direct = wires.at(-1).to === offline.destination;
      node.start();
      const output = await offline.startRendering();
      return result === offline.destination && direct && output.getChannelData(0)[0] === 0.5 && output.getChannelData(1)[0] === -0.25;
    }), true);
    await page.evaluate(async () => { await Promise.all([ctx.close(), ctx2.close(), low.close()]); });

    // 检查保存、刷新恢复、重复加载和窄屏布局。
    await toggle.click();
    await page.reload();
    assert.equal(await toggle.isChecked(), false);
    assert.equal(await importer.getAttribute('title'), 'Test ParametricEq.txt');
    await page.evaluate(source);
    assert.equal(await page.locator('#eartraining-autoeq').count(), 1);
    await vw();
    assert.deepEqual(errors, []);
    console.log(`${label}: 导入校验、滤波响应、开关、重连、多采样率、持久化与 320–1024px 布局通过`);
  } finally { await browser.close(); }
}

// 执行指定浏览器的检查。
chk(process.argv[2] === 'webkit' ? webkit : chromium, process.argv[2] || 'chromium').catch(error => { console.error(error); process.exitCode = 1; });
