'use strict';

/**
 * Antigravity Desktop (Renderer Preload) Chinese Localization Runtime.
 *
 * Works cleanly inside Electron sandboxed preloads (`sandbox: true`, `contextIsolation: true`):
 * - Zero Node.js `fs` or external module dependencies at runtime.
 * - Strictly skips code blocks, editors, terminals, and editable inputs.
 * - Mutates `Text.nodeValue` in-place (React Fiber safe) with WeakMap loop protection.
 * - Batches DOM mutations via `requestAnimationFrame` to avoid UI jank during streaming.
 */

function createTranslator(dict) {
  const exact = (dict && dict.exact) || {};
  const patterns = ((dict && dict.patterns) || []).map((p) => ({
    re: new RegExp(p.regex, p.flags || ''),
    replace: p.replace,
  }));

  function translate(raw) {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 240) {
      return raw;
    }
    const trimmed = raw.trim();
    if (!trimmed) return raw;

    // Fast path: skip strings that already contain no ASCII letters
    if (!/[A-Za-z]/.test(trimmed)) {
      return raw;
    }

    let translated = null;
    if (Object.prototype.hasOwnProperty.call(exact, trimmed)) {
      translated = exact[trimmed];
    } else {
      for (let i = 0; i < patterns.length; i++) {
        const rule = patterns[i];
        if (rule.re.test(trimmed)) {
          const candidate = trimmed.replace(rule.re, rule.replace);
          if (candidate !== trimmed) {
            translated = candidate;
            break;
          }
        }
      }
    }

    if (translated === null || translated === trimmed) {
      return raw;
    }

    // Preserve leading and trailing whitespace
    const leadingLen = raw.indexOf(trimmed);
    const leading = raw.slice(0, leadingLen);
    const trailing = raw.slice(leadingLen + trimmed.length);
    return leading + translated + trailing;
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

const SKIP_SELECTOR = [
  'code',
  'pre',
  'kbd',
  'samp',
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
  '[data-code-block]',
  '[data-zh-cn-skip]',
].join(',');

const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label'];

function isAllowedOrigin(win) {
  try {
    const loc = win && win.location;
    if (!loc) return false;
    const proto = loc.protocol;
    const host = loc.hostname;
    if (proto === 'file:' || proto === 'data:' || proto === 'about:') return true;
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
  if (typeof el.closest === 'function' && el.closest(SKIP_SELECTOR)) return true;
  return false;
}

function installDomLocalization(dict, deps) {
  const win = (deps && deps.window) || (typeof window !== 'undefined' ? window : null);
  const doc = (deps && deps.document) || (win && win.document) || null;
  if (!win || !doc) return () => {};

  // Honor opt-out env var when available
  try {
    if (typeof process !== 'undefined' && process.env && process.env.ANTIGRAVITY_ZH_CN === '0') {
      return () => {};
    }
    if (typeof process !== 'undefined' && process.isMainFrame === false) {
      return () => {};
    }
  } catch {
    // Ignore in restricted environments
  }

  if (!(deps && deps.skipOriginCheck) && !isAllowedOrigin(win)) {
    return () => {};
  }

  const { translate } = createTranslator(dict);
  const translatedNodes = new WeakMap();
  const translatedAttrs = new WeakMap();
  const debugMode =
    typeof process !== 'undefined' && process.env && process.env.ANTIGRAVITY_ZH_CN_DEBUG === '1';
  const untranslatedSet = debugMode ? new Set() : null;

  function recordUntranslated(text) {
    if (!untranslatedSet) return;
    const trimmed = text.trim();
    if (
      trimmed.length >= 2 &&
      trimmed.length <= 60 &&
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

    const next = translate(current);
    if (next !== current) {
      translatedNodes.set(node, next);
      node.nodeValue = next;
    } else if (debugMode) {
      recordUntranslated(current);
    }
  }

  function translateElementAttributes(el) {
    if (!el || el.nodeType !== 1) return;
    if (SKIP_TAGS.has(el.tagName)) return;

    let cache = translatedAttrs.get(el);
    for (let i = 0; i < TRANSLATABLE_ATTRS.length; i++) {
      const attr = TRANSLATABLE_ATTRS[i];
      if (!el.hasAttribute(attr)) continue;
      const current = el.getAttribute(attr);
      if (!current) continue;
      if (cache && cache[attr] === current) continue;

      const next = translate(current);
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
      if (shouldSkipElement(root)) return;
      translateElementAttributes(root);
    }

    const walker = doc.createTreeWalker(
      root,
      5, // NodeFilter.SHOW_ELEMENT (1) | NodeFilter.SHOW_TEXT (4)
      {
        acceptNode(node) {
          if (node.nodeType === 1 && shouldSkipElement(node)) {
            return 2; // NodeFilter.FILTER_REJECT (skip subtree)
          }
          return 1; // NodeFilter.FILTER_ACCEPT
        },
      }
    );

    let current = walker.nextNode();
    while (current) {
      if (current.nodeType === 3) {
        translateTextNode(current);
      } else if (current.nodeType === 1) {
        translateElementAttributes(current);
      }
      current = walker.nextNode();
    }
  }

  function translateTitle() {
    if (typeof doc.title === 'string' && doc.title) {
      const next = translate(doc.title);
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

  let observer = null;
  function start() {
    const root = doc.body || doc.documentElement;
    if (!root) return;
    translateTitle();
    walkAndTranslate(root);

    const ObserverCtor = win.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (!ObserverCtor || observer) return;

    observer = new ObserverCtor((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'characterData') {
          enqueue(m.target);
        } else if (m.type === 'attributes') {
          enqueue(m.target);
        } else if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            enqueue(m.addedNodes[j]);
          }
        }
      }
    });

    observer.observe(doc.documentElement || root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS,
    });
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  return () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    pendingRoots.clear();
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createTranslator,
    installDomLocalization,
    isAllowedOrigin,
    shouldSkipElement,
  };
}
