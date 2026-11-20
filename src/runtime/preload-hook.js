'use strict';

// Sandboxed preload DOM translator (no fs/node calls at runtime).

function createTranslator(dict) {
  const exact = (dict && dict.exact) || {};
  const controls = (dict && dict.controls) || {};
  const exactLower = Object.create(null);
  const controlsLower = Object.create(null);

  for (const k of Object.keys(exact)) {
    const lk = k.toLowerCase();
    if (!(lk in exactLower)) exactLower[lk] = exact[k];
  }
  for (const k of Object.keys(controls)) {
    const lk = k.toLowerCase();
    if (!(lk in controlsLower)) controlsLower[lk] = controls[k];
  }

  const patterns = ((dict && dict.patterns) || []).map((p) => ({
    re: new RegExp(p.regex, p.flags || ''),
    replace: p.replace,
  }));

  function localizeDurationUnits(str) {
    if (!/\b\d+\s*(?:days?|hours?|minutes?|seconds?|d|h|m|s)\b/i.test(str)) return str;
    return str
      .replace(/(\d+)\s*days?\b/gi, '$1 天')
      .replace(/(\d+)\s*hours?\b/gi, '$1 小时')
      .replace(/(\d+)\s*minutes?\b/gi, '$1 分钟')
      .replace(/(\d+)\s*seconds?\b/gi, '$1 秒')
      .replace(/(\d+)d\b/g, '$1 天')
      .replace(/(\d+)h\b/g, '$1 小时')
      .replace(/(\d+)m\b/g, '$1 分钟')
      .replace(/,\s*/g, ' ');
  }

  function lookup(trimmed, allowControls) {
    if (Object.prototype.hasOwnProperty.call(exact, trimmed)) {
      return exact[trimmed];
    }
    if (allowControls && Object.prototype.hasOwnProperty.call(controls, trimmed)) {
      return controls[trimmed];
    }

    const lower = trimmed.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(exactLower, lower)) {
      return exactLower[lower];
    }
    if (allowControls && Object.prototype.hasOwnProperty.call(controlsLower, lower)) {
      return controlsLower[lower];
    }

    for (let i = 0; i < patterns.length; i++) {
      const rule = patterns[i];
      if (rule.re.test(trimmed)) {
        const replaced = localizeDurationUnits(trimmed.replace(rule.re, rule.replace));
        if (replaced !== trimmed) return replaced;
      }
    }
    return null;
  }

  function translate(raw, options) {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 500) {
      return raw;
    }
    const trimmed = raw.trim();
    if (!trimmed || !/[A-Za-z]/.test(trimmed)) {
      return raw;
    }

    const allowControls = !(options && options.allowControls === false);
    const translated = lookup(trimmed, allowControls);
    if (translated === null || translated === trimmed) {
      return raw;
    }

    const leadingLen = raw.indexOf(trimmed);
    return raw.slice(0, leadingLen) + translated + raw.slice(leadingLen + trimmed.length);
  }

  return { translate };
}

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'VAR',
  'TEXTAREA',
  'SVG',
  'MATH',
  'CANVAS',
  'IFRAME',
  'WEBVIEW',
]);

// Subtrees where text nodes must never be touched (code, terminals, icon fonts,
// file trees, user input, and AI markdown responses).
const SKIP_TEXT_SELECTOR = [
  'code',
  'pre',
  'kbd',
  'samp',
  'var',
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="textbox"]',
  '.monaco-editor',
  '.cm-editor',
  '.xterm',
  '.terminal',
  '.hljs',
  '.shiki',
  '.katex',
  '.material-icons',
  '.material-symbols-outlined',
  '.material-symbols-rounded',
  '.material-symbols-sharp',
  '[class*="material-symbol"]',
  '[class*="material-icon"]',
  '[class*="codicon"]',
  '[role="tree"]',
  '[role="treeitem"]',
  '[data-code-block]',
  '[data-zh-cn-skip]',
  '[data-testid="user-input-step"]',
  '[data-testid="user-message"]',
  '[data-testid="user-message-bubble"]',
  '[data-testid="user-message-content"]',
  '[data-testid="agent-response"]',
  '[data-testid="file-title-name"]',
  '[data-testid="webview-download-filename"]',
  '[data-testid="terminal-surface"]',
  '[data-testid="terminal-tab-surface"]',
  '[data-testid="standalone-terminal-view"]',
].join(',');

// Single-word entries in `controls` only apply inside explicit UI controls/chrome
// so common English words never bleed into arbitrary content.
const CONTROL_CONTEXT_SELECTOR = [
  'button',
  'a',
  'label',
  'summary',
  'legend',
  'option',
  'th',
  'dt',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'nav',
  'aside',
  'header',
  'footer',
  '[role="button"]',
  '[role="tab"]',
  '[role="tablist"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="tooltip"]',
  '[role="status"]',
  '[role="toolbar"]',
  '[role="heading"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="navigation"]',
].join(',');

const TRANSLATABLE_ATTRS = [
  'placeholder',
  'data-placeholder',
  'aria-placeholder',
  'title',
  'aria-label',
  'data-tooltip',
];

function isAllowedOrigin(win) {
  try {
    const loc = win && win.location;
    if (!loc) return false;
    const proto = loc.protocol;
    const host = loc.hostname;
    if (proto === 'file:' || proto === 'data:' || proto === 'about:' || proto === 'plugin:') {
      return true;
    }
    if (
      (proto === 'http:' || proto === 'https:') &&
      (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local'))
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function shouldSkipElement(el) {
  if (!el || el.nodeType !== 1) return false;
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === 'function' && el.closest(SKIP_TEXT_SELECTOR)) return true;
  return false;
}

function isControlContext(el) {
  if (!el || el.nodeType !== 1) return false;
  if (typeof el.closest === 'function' && el.closest(CONTROL_CONTEXT_SELECTOR)) return true;
  // Outside skipped chat/code/tree zones, a leaf span/div/p holding a single short text node
  // (e.g. settings row titles, section headings, badges) is safe to treat as a UI label.
  if (el.childNodes && el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
    const tag = el.tagName;
    if (tag === 'SPAN' || tag === 'DIV' || tag === 'P' || tag === 'LI' || tag === 'TD') {
      const text = el.childNodes[0].nodeValue || '';
      if (text.trim().length <= 40) return true;
    }
  }
  return false;
}

function installDomLocalization(dict, deps) {
  const win = (deps && deps.window) || (typeof window !== 'undefined' ? window : null);
  const doc = (deps && deps.document) || (win && win.document) || null;
  if (!win || !doc) return () => {};

  try {
    if (typeof process !== 'undefined' && process.env && process.env.ANTIGRAVITY_ZH_CN === '0') {
      return () => {};
    }
    if (typeof process !== 'undefined' && process.isMainFrame === false) {
      return () => {};
    }
  } catch {}

  if (!(deps && deps.skipOriginCheck) && !isAllowedOrigin(win)) {
    return () => {};
  }

  const { translate } = createTranslator(dict);
  const translatedNodes = new WeakMap();
  const translatedAttrs = new WeakMap();
  const observedShadows = new WeakSet();
  const debugMode =
    typeof process !== 'undefined' && process.env && process.env.ANTIGRAVITY_ZH_CN_DEBUG === '1';
  const untranslatedSet = debugMode ? new Set() : null;

  function recordUntranslated(text) {
    if (!untranslatedSet) return;
    const trimmed = text.trim();
    if (
      trimmed.length >= 2 &&
      trimmed.length <= 80 &&
      /[A-Za-z]{2,}/.test(trimmed) &&
      !/[\u4e00-\u9fff]/.test(trimmed) &&
      !/^(https?:\/\/|\/|[A-Z]:\\|\d+(\.\d+)*$)/i.test(trimmed) &&
      !untranslatedSet.has(trimmed)
    ) {
      untranslatedSet.add(trimmed);
      console.debug('[antigravity-zh-cn][untranslated]', trimmed);
    }
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    const parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) return;

    const current = node.nodeValue;
    if (!current) return;
    if (translatedNodes.get(node) === current) return;

    const allowControls = isControlContext(parent);
    const next = translate(current, { allowControls });
    if (next !== current) {
      translatedNodes.set(node, next);
      node.nodeValue = next;
    } else if (debugMode && allowControls) {
      recordUntranslated(current);
    }
  }

  function translateElementAttributes(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'SVG') return;

    let cache = translatedAttrs.get(el);
    for (let i = 0; i < TRANSLATABLE_ATTRS.length; i++) {
      const attr = TRANSLATABLE_ATTRS[i];
      if (!el.hasAttribute(attr)) continue;
      const current = el.getAttribute(attr);
      if (!current) continue;
      if (cache && cache[attr] === current) continue;

      const next = translate(current, { allowControls: true });
      if (next !== current) {
        if (!cache) {
          cache = {};
          translatedAttrs.set(el, cache);
        }
        cache[attr] = next;
        el.setAttribute(attr, next);
      }
    }
  }

  function walkAndTranslate(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType === 1) {
      // Translate attributes (e.g. data-placeholder on contenteditable composer)
      // before checking whether text descendants should be skipped.
      translateElementAttributes(root);
      if (root.shadowRoot) {
        attachShadowObserver(root.shadowRoot);
        walkAndTranslate(root.shadowRoot);
      }
      if (shouldSkipElement(root)) return;
    }

    const walker = doc.createTreeWalker(root, 5, {
      acceptNode(node) {
        if (node.nodeType === 1) {
          translateElementAttributes(node);
          if (node.shadowRoot) {
            attachShadowObserver(node.shadowRoot);
            walkAndTranslate(node.shadowRoot);
          }
          if (shouldSkipElement(node)) {
            return 2; // FILTER_REJECT: skip children
          }
        }
        return 1; // FILTER_ACCEPT
      },
    });

    let current = walker.nextNode();
    while (current) {
      if (current.nodeType === 3) {
        translateTextNode(current);
      }
      current = walker.nextNode();
    }
  }

  function translateTitle() {
    if (typeof doc.title === 'string' && doc.title) {
      const next = translate(doc.title, { allowControls: true });
      if (next !== doc.title) {
        doc.title = next;
      }
    }
  }

  const pendingRoots = new Set();
  let rafId = null;

  function flushQueue() {
    rafId = null;
    translateTitle();
    const nodes = Array.from(pendingRoots);
    pendingRoots.clear();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n && n.isConnected !== false) {
        walkAndTranslate(n);
      }
    }
  }

  function enqueue(node) {
    if (!node) return;
    pendingRoots.add(node);
    if (rafId === null) {
      const schedule =
        typeof win.requestAnimationFrame === 'function'
          ? win.requestAnimationFrame.bind(win)
          : (fn) => setTimeout(fn, 16);
      rafId = schedule(flushQueue);
    }
  }

  const OBS_OPTIONS = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRS,
  };

  function handleMutations(mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (m.type === 'characterData' || m.type === 'attributes') {
        enqueue(m.target);
      } else if (m.type === 'childList') {
        for (let j = 0; j < m.addedNodes.length; j++) {
          enqueue(m.addedNodes[j]);
        }
      }
    }
  }

  const observers = [];
  function attachShadowObserver(shadowRoot) {
    if (!shadowRoot || observedShadows.has(shadowRoot)) return;
    const ObserverCtor =
      win.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (!ObserverCtor) return;
    observedShadows.add(shadowRoot);
    const obs = new ObserverCtor(handleMutations);
    obs.observe(shadowRoot, OBS_OPTIONS);
    observers.push(obs);
  }

  const timers = [];
  function start() {
    const root = doc.body || doc.documentElement;
    if (!root) return;

    translateTitle();
    walkAndTranslate(root);

    const ObserverCtor =
      win.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (ObserverCtor && observers.length === 0) {
      const obs = new ObserverCtor(handleMutations);
      obs.observe(doc.documentElement || root, OBS_OPTIONS);
      observers.push(obs);
    }

    // Catch lazy-mounted React chunks right after initial load.
    for (const delay of [200, 800, 2000]) {
      timers.push(
        setTimeout(() => {
          const target = doc.body || doc.documentElement;
          if (target) {
            translateTitle();
            walkAndTranslate(target);
          }
        }, delay)
      );
    }
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  return () => {
    for (const t of timers) clearTimeout(t);
    for (const obs of observers) obs.disconnect();
    observers.length = 0;
    pendingRoots.clear();
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createTranslator,
    installDomLocalization,
    isAllowedOrigin,
    shouldSkipElement,
    isControlContext,
  };
}
