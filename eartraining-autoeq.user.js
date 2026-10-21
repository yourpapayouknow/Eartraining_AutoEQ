// ==UserScript==
// @name         Eartraining AutoEQ
// @namespace    eartraining-autoeq
// @version      1.0.2
// @description  为耳朵训练网站导入 AutoEQ 参数校正；适用于 iPad Safari Userscripts。
// @author       yourpapayouknow
// @homepageURL  https://github.com/yourpapayouknow/Eartraining_AutoEQ
// @supportURL   https://github.com/yourpapayouknow/Eartraining_AutoEQ/issues
// @updateURL    https://raw.githubusercontent.com/yourpapayouknow/Eartraining_AutoEQ/main/eartraining-autoeq.user.js
// @downloadURL  https://raw.githubusercontent.com/yourpapayouknow/Eartraining_AutoEQ/main/eartraining-autoeq.user.js
// @match        https://eartraining.cn/*
// @match        https://app.eartraining.cn/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @noframes
// @license      MIT
// ==/UserScript==

/*
 * Filter equations adapted from jaakkopasanen/AutoEq (autoeq/peq.py).
 * MIT License — Copyright (c) 2018-2022 Jaakko Pasanen
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// 接入页面的最终音频输出并提供导入和开关。
(() => {
  'use strict';
  if (window.__earAutoEq) return;
  window.__earAutoEq = true;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const key = 'eartraining-autoeq-v1';
  const buses = new Map();
  const cnnct = window.AudioNode?.prototype.connect;
  const dscnnct = window.AudioNode?.prototype.disconnect;
  let profile = null;
  let saved = { text: '', name: '', enabled: false };
  let notice = '';
  let ui;

  // 检查参数范围。
  function rng(value, min, max) {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error('参数超出支持范围');
    }
    return value;
  }

  // 解析 AutoEQ 的 Equalizer APO 参数文本。
  function prs(text) {
    if (typeof text !== 'string' || text.length > 65536) throw new Error('请选择小于 64 KB 的参数 EQ 文本');
    const num = '([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))';
    const pre = new RegExp(`^Preamp:\\s*${num}\\s+dB$`, 'i');
    const flt = new RegExp(`^Filter\\s+\\d+:\\s+(ON|OFF)\\s+(PK|LSC|HSC)\\s+Fc\\s+${num}\\s+Hz\\s+Gain\\s+${num}\\s+dB\\s+Q\\s+${num}$`, 'i');
    const filters = [];
    let preamp;
    for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const line = raw.replace(/#.*/, '').trim();
      if (!line) continue;
      const p = line.match(pre);
      if (p) {
        if (preamp !== undefined) throw new Error('只能包含一个 Preamp');
        preamp = rng(Number(p[1]), -120, 24);
        continue;
      }
      const f = line.match(flt);
      if (!f) throw new Error('需要 AutoEQ 的 ParametricEq.txt（含 Preamp 和 PK/LSC/HSC）');
      const filter = { type: f[2].toUpperCase(), fc: rng(Number(f[3]), 1, 24000), gain: rng(Number(f[4]), -60, 24), q: rng(Number(f[5]), 0.01, 100) };
      if (f[1].toUpperCase() === 'ON') filters.push(filter);
      if (filters.length > 32) throw new Error('最多支持 32 个启用的滤波器');
    }
    if (preamp === undefined || !filters.length) throw new Error('文件缺少 Preamp 或启用的参数滤波器');
    return { preamp, filters };
  }

  // 将 AutoEQ 公式转换为 Web Audio 的分子和分母系数。
  function cff(filter, rate) {
    const { type, fc, gain, q } = filter;
    if (fc >= rate / 2) throw new Error('校正频率超过当前音频采样率范围');
    const a = 10 ** (gain / 40);
    const w = 2 * Math.PI * fc / rate;
    const c = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    if (type === 'PK') return [[1 + alpha * a, -2 * c, 1 - alpha * a], [1 + alpha / a, -2 * c, 1 - alpha / a]];
    const t = 2 * Math.sqrt(a) * alpha;
    if (type === 'LSC') return [
      [a * (a + 1 - (a - 1) * c + t), 2 * a * (a - 1 - (a + 1) * c), a * (a + 1 - (a - 1) * c - t)],
      [a + 1 + (a - 1) * c + t, -2 * (a - 1 + (a + 1) * c), a + 1 + (a - 1) * c - t]
    ];
    return [
      [a * (a + 1 + (a - 1) * c + t), -2 * a * (a - 1 + (a + 1) * c), a * (a + 1 + (a - 1) * c - t)],
      [a + 1 - (a - 1) * c + t, 2 * (a - 1 - (a + 1) * c), a + 1 - (a - 1) * c - t]
    ];
  }

  // 创建尚未接入输出的校正链。
  function chn(ctx, next) {
    const nodes = [ctx.createGain()];
    nodes[0].gain.value = 10 ** (next.preamp / 20);
    for (const filter of next.filters) {
      const node = ctx.createIIRFilter(...cff(filter, ctx.sampleRate));
      cnnct.call(nodes[nodes.length - 1], node);
      nodes.push(node);
    }
    return nodes;
  }

  // 替换校正链并保留网站连接的入口节点。
  function swp(bus, nodes) {
    if (bus.chain.length) dscnnct.call(bus.input, bus.chain[0]);
    for (const node of bus.chain) dscnnct.call(node);
    bus.chain = nodes;
    if (nodes.length) {
      cnnct.call(bus.input, nodes[0]);
      cnnct.call(nodes[nodes.length - 1], bus.wet);
    }
    bus.error = '';
  }

  // 平滑切换校正和原始输出。
  function lvl(bus, smooth = true) {
    const on = saved.enabled && profile && !bus.error;
    for (const [node, value] of [[bus.dry, on ? 0 : 1], [bus.wet, on ? 1 : 0]]) {
      node.gain.cancelScheduledValues(bus.ctx.currentTime);
      if (smooth) node.gain.setTargetAtTime(value, bus.ctx.currentTime, 0.008);
      else node.gain.value = value;
    }
  }

  // 为实时音频上下文建立校正入口。
  function bld(ctx) {
    if (buses.has(ctx)) return buses.get(ctx);
    const bus = { ctx, input: ctx.createGain(), dry: ctx.createGain(), wet: ctx.createGain(), chain: [], error: '', connected: false };
    cnnct.call(bus.input, bus.dry);
    cnnct.call(bus.dry, ctx.destination);
    cnnct.call(bus.wet, ctx.destination);
    try {
      if (profile) swp(bus, chn(ctx, profile));
    } catch (error) {
      bus.error = error.message;
    }
    lvl(bus, false);
    buses.set(ctx, bus);
    // 清理关闭的上下文并更新状态。
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'closed') buses.delete(ctx);
      rndr();
    });
    return bus;
  }

  // 记忆当前文件与开关状态。
  function mem() {
    try { localStorage.setItem(key, JSON.stringify(saved)); }
    catch { notice = '浏览器无法记忆配置；刷新后需重新导入。'; }
  }

  // 显示校正状态。
  function rndr() {
    if (!ui) return;
    const running = [...buses.values()].some(bus => bus.connected && bus.ctx.state === 'running');
    const error = [...buses.values()].find(bus => bus.error)?.error;
    ui.toggle.disabled = !profile || !Ctx || !cnnct;
    ui.toggle.checked = saved.enabled;
    ui.import.title = saved.name || '导入校正';
    const warning = notice || error || (!Ctx || !cnnct ? '浏览器不支持 Web Audio' : '');
    const message = warning || (!profile ? '未导入' : !saved.enabled ? 'EQ 关闭' : running ? 'EQ 生效' : 'EQ 开启');
    const changed = ui.status.textContent !== message;
    ui.status.textContent = message;
    if (warning && changed) window.alert(warning);
  }

  // 原子导入配置；失败时保留旧校正。
  function imprt(text, name) {
    const next = prs(text);
    const ready = [...buses.values()].map(bus => [bus, chn(bus.ctx, next)]);
    for (const [bus, nodes] of ready) swp(bus, nodes);
    profile = next;
    saved = { text, name, enabled: true };
    notice = '';
    for (const bus of buses.values()) lvl(bus);
    mem();
    rndr();
  }

  // 恢复经过重新校验的本地配置。
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored) {
      const next = prs(stored.text);
      if (typeof stored.name !== 'string' || typeof stored.enabled !== 'boolean') throw new Error('无效的已存配置');
      profile = next;
      saved = { text: stored.text, name: stored.name, enabled: stored.enabled };
    }
  } catch { notice = '无法恢复配置，请重新导入。'; }

  // 仅重定向实时音频的最终输出，保持 connect/disconnect 的目标语义。
  if (Ctx && cnnct) {
    window.AudioNode.prototype.connect = function cnct(...args) {
      const ctx = this.context;
      if (!(ctx instanceof Ctx) || args[0] !== ctx.destination) return cnnct.apply(this, args);
      const bus = bld(ctx);
      const destination = args[0];
      args[0] = bus.input;
      cnnct.apply(this, args);
      bus.connected = true;
      rndr();
      return destination;
    };
    // 将指定输出目标的断开操作映射到校正入口。
    window.AudioNode.prototype.disconnect = function dscnct(...args) {
      const bus = buses.get(this.context);
      if (bus && args[0] === bus.ctx.destination) args[0] = bus.input;
      return dscnnct.apply(this, args);
    };
  }

  // 创建适合触控的最小导入面板。
  function mnt() {
    const host = document.createElement('div');
    host.id = 'eartraining-autoeq';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147483646;font:inherit;font-size:16px;line-height:1.5;color:rgb(var(--v-theme-on-surface,33,33,33))}
        *{box-sizing:border-box}.bar{display:flex;align-items:center;gap:8px;padding:4px 8px;border:1px solid rgb(var(--v-theme-on-surface,33,33,33),.2);border-radius:12px;background:rgb(var(--v-theme-surface,255,255,255));box-shadow:0 4px 16px #0000002e}
        button{min-height:44px;padding:8px 12px;border:0;border-radius:8px;font:inherit;color:inherit;background:transparent;cursor:pointer}.switch{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer}.control{position:relative;display:flex;align-items:center;width:52px;height:44px}
        #toggle{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}.track{pointer-events:none;display:block;width:52px;height:32px;border-radius:9999px;background:#767676}.track::before{content:"";display:block;width:26px;height:26px;margin:3px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0003}
        #toggle:checked+.track{background:rgb(var(--v-theme-primary,103,58,183))}#toggle:checked+.track::before{transform:translateX(20px)}#toggle:disabled+.track{opacity:.45}#toggle:disabled{cursor:default}button:focus-visible,#toggle:focus-visible+.track{outline:3px solid currentColor;outline-offset:3px}
        #status{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
      </style>
      <div class="bar" role="group" aria-label="AutoEQ">
        <button id="import" type="button">导入</button>
        <label class="switch">EQ<span class="control"><input id="toggle" type="checkbox" role="switch" aria-label="EQ"><span class="track" aria-hidden="true"></span></span></label>
        <input type="file" accept=".txt,text/plain" hidden aria-label="AutoEQ 参数校正文件">
      </div><span id="status" role="status" aria-live="polite"></span>`;
    ui = { import: shadow.querySelector('#import'), toggle: shadow.querySelector('#toggle'), status: shadow.querySelector('#status') };
    const file = shadow.querySelector('input[type="file"]');
    // 打开 iPad 的文件选择器。
    shadow.querySelector('#import').onclick = () => file.click();
    // 读取用户选择的校正文件。
    file.onchange = async () => {
      const selected = file.files[0];
      if (!selected) return;
      try {
        if (selected.size > 65536) throw new Error('请选择小于 64 KB 的参数 EQ 文本');
        imprt(await selected.text(), selected.name);
      } catch (error) {
        notice = `导入失败：${error.message}。原配置保留。`;
        rndr();
      }
      file.value = '';
    };
    // 切换校正与原始声音。
    ui.toggle.onchange = () => {
      saved.enabled = ui.toggle.checked;
      notice = '';
      for (const bus of buses.values()) lvl(bus);
      mem();
      rndr();
    };
    (document.querySelector('.v-application') || document.body).append(host);
    // 在网站主题容器就绪后继承主题变量。
    if (!document.querySelector('.v-application')) {
      const observer = new MutationObserver(() => {
        const app = document.querySelector('.v-application');
        if (app) { app.append(host); observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    rndr();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mnt, { once: true });
  else mnt();
})();
