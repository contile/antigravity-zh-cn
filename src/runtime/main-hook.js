'use strict';

/**
 * Antigravity Desktop (Electron Main Process) Chinese Localization Hook.
 *
 * Design principles:
 * - Non-destructive: preserves original menu references and English `menuItem.label`
 *   inside click callbacks (e.g. updater's `updateActions[menuItem.label]` lookup
 *   and async `addItemToSubmenu(menu, 'File', ...)` calls).
 * - Defensive: every hook is wrapped in try/catch so localization can never break app startup.
 * - Opt-out escape hatch: set `ANTIGRAVITY_ZH_CN=0` in the environment to temporarily run in English.
 */

if (process.env.ANTIGRAVITY_ZH_CN === '0') {
  module.exports = { installed: false, reason: 'disabled-by-env' };
} else {
  const path = require('path');
  const fs = require('fs');

  let dict = { exact: {}, patterns: [] };
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'zh-cn-menu.json'), 'utf8');
    const parsed = JSON.parse(raw);
    dict = {
      exact: parsed.exact || {},
      patterns: (parsed.patterns || []).map((p) => ({
        re: new RegExp(p.regex, p.flags || ''),
        replace: p.replace,
      })),
    };
  } catch (err) {
    console.error('[antigravity-zh-cn] Failed to load menu dictionary:', err);
  }

  function translateText(text) {
    if (typeof text !== 'string' || text.length === 0) {
      return text;
    }
    const trimmed = text.trim();
    if (!trimmed) return text;

    // Strip Windows/Linux accelerator ampersands (e.g. "&File") for lookup
    const cleanKey = trimmed.replace(/&([A-Za-z0-9])/g, '$1');

    if (Object.prototype.hasOwnProperty.call(dict.exact, trimmed)) {
      return text.replace(trimmed, dict.exact[trimmed]);
    }
    if (cleanKey !== trimmed && Object.prototype.hasOwnProperty.call(dict.exact, cleanKey)) {
      return text.replace(trimmed, dict.exact[cleanKey]);
    }

    for (const rule of dict.patterns) {
      if (rule.re.test(cleanKey)) {
        const replaced = cleanKey.replace(rule.re, rule.replace);
        if (replaced !== cleanKey) {
          return text.replace(trimmed, replaced);
        }
      }
    }
    return text;
  }

  function wrapClickPreserveLabel(origClick, origLabel) {
    if (typeof origClick !== 'function') return origClick;
    return function wrappedMenuClick(menuItem, browserWindow, event) {
      if (!menuItem || !origLabel || menuItem.label === origLabel) {
        return origClick.call(this, menuItem, browserWindow, event);
      }
      const proxyItem = new Proxy(menuItem, {
        get(target, prop, receiver) {
          if (prop === 'label') return origLabel;
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
        set(target, prop, value, receiver) {
          if (prop === 'label') {
            return Reflect.set(target, prop, translateText(value), receiver);
          }
          return Reflect.set(target, prop, value, receiver);
        },
      });
      return origClick.call(this, proxyItem, browserWindow, event);
    };
  }

  function translateTemplateItem(item) {
    if (!item || typeof item !== 'object') return item;
    const cloned = { ...item };
    if (typeof cloned.label === 'string') {
      const origLabel = cloned.label;
      const zhLabel = translateText(origLabel);
      if (zhLabel !== origLabel) {
        cloned.label = zhLabel;
        if (typeof cloned.click === 'function') {
          cloned.click = wrapClickPreserveLabel(cloned.click, origLabel);
        }
      }
    }
    if (typeof cloned.sublabel === 'string') {
      cloned.sublabel = translateText(cloned.sublabel);
    }
    if (typeof cloned.toolTip === 'string') {
      cloned.toolTip = translateText(cloned.toolTip);
    }
    if (Array.isArray(cloned.submenu)) {
      cloned.submenu = cloned.submenu.map(translateTemplateItem);
    }
    return cloned;
  }

  function cloneMenuTranslated(electron, sourceMenu, origBuildFromTemplate) {
    if (!sourceMenu || !Array.isArray(sourceMenu.items)) return sourceMenu;

    function itemToTemplate(item) {
      const tpl = {
        type: item.type,
        enabled: item.enabled,
        visible: item.visible,
      };
      if (item.id) tpl.id = item.id;
      if (item.role) tpl.role = item.role;
      if (item.accelerator) tpl.accelerator = item.accelerator;
      if (item.acceleratorWorksWhenHidden !== undefined) {
        tpl.acceleratorWorksWhenHidden = item.acceleratorWorksWhenHidden;
      }
      if (item.type === 'checkbox' || item.type === 'radio') {
        tpl.checked = item.checked;
      }
      if (typeof item.label === 'string') {
        const origLabel = item.label;
        const zhLabel = translateText(origLabel);
        tpl.label = zhLabel;
        if (typeof item.click === 'function' && !item.role) {
          tpl.click = wrapClickPreserveLabel(item.click, origLabel);
        }
      } else if (typeof item.click === 'function' && !item.role) {
        tpl.click = item.click;
      }
      if (typeof item.sublabel === 'string') {
        tpl.sublabel = translateText(item.sublabel);
      }
      if (typeof item.toolTip === 'string') {
        tpl.toolTip = translateText(item.toolTip);
      }
      if (item.submenu && Array.isArray(item.submenu.items)) {
        // When a submenu has a role like `windowMenu` / `editMenu` / `help`,
        // rebuild its concrete items so every child item label gets translated.
        delete tpl.role;
        tpl.submenu = item.submenu.items.map(itemToTemplate);
      }
      return tpl;
    }

    const template = sourceMenu.items.map(itemToTemplate);
    return origBuildFromTemplate.call(electron.Menu, template);
  }

  function translateDialogOptions(options) {
    if (!options || typeof options !== 'object') return options;
    const next = { ...options };
    if (typeof next.title === 'string') next.title = translateText(next.title);
    if (typeof next.message === 'string') next.message = translateText(next.message);
    if (typeof next.detail === 'string') next.detail = translateText(next.detail);
    if (typeof next.buttonLabel === 'string') next.buttonLabel = translateText(next.buttonLabel);
    if (typeof next.checkboxLabel === 'string') {
      next.checkboxLabel = translateText(next.checkboxLabel);
    }
    if (Array.isArray(next.buttons)) {
      next.buttons = next.buttons.map((b) => (typeof b === 'string' ? translateText(b) : b));
    }
    return next;
  }

  try {
    const electron = require('electron');

    if (electron && electron.Menu && !electron.Menu.__antigravityZhCnPatched) {
      electron.Menu.__antigravityZhCnPatched = true;

      const origBuildFromTemplate = electron.Menu.buildFromTemplate;
      electron.Menu.buildFromTemplate = function patchedBuildFromTemplate(template) {
        try {
          if (Array.isArray(template)) {
            return origBuildFromTemplate.call(this, template.map(translateTemplateItem));
          }
        } catch (err) {
          console.error('[antigravity-zh-cn] Menu.buildFromTemplate error:', err);
        }
        return origBuildFromTemplate.call(this, template);
      };

      const origSetApplicationMenu = electron.Menu.setApplicationMenu;
      electron.Menu.setApplicationMenu = function patchedSetApplicationMenu(menu) {
        try {
          if (menu) {
            const translatedMenu = cloneMenuTranslated(electron, menu, origBuildFromTemplate);
            return origSetApplicationMenu.call(this, translatedMenu);
          }
        } catch (err) {
          console.error('[antigravity-zh-cn] Menu.setApplicationMenu error:', err);
        }
        return origSetApplicationMenu.call(this, menu);
      };
    }

    if (electron && electron.Tray && electron.Tray.prototype && !electron.Tray.prototype.__antigravityZhCnPatched) {
      electron.Tray.prototype.__antigravityZhCnPatched = true;
      const origSetContextMenu = electron.Tray.prototype.setContextMenu;
      const origBuildFromTemplate = electron.Menu.buildFromTemplate;
      electron.Tray.prototype.setContextMenu = function patchedSetContextMenu(menu) {
        try {
          if (menu && Array.isArray(menu.items)) {
            const translated = cloneMenuTranslated(electron, menu, origBuildFromTemplate);
            return origSetContextMenu.call(this, translated);
          }
        } catch (err) {
          console.error('[antigravity-zh-cn] Tray.setContextMenu error:', err);
        }
        return origSetContextMenu.call(this, menu);
      };
    }

    if (electron && electron.dialog && !electron.dialog.__antigravityZhCnPatched) {
      electron.dialog.__antigravityZhCnPatched = true;

      for (const methodName of ['showMessageBox', 'showMessageBoxSync', 'showOpenDialog', 'showSaveDialog']) {
        const origFn = electron.dialog[methodName];
        if (typeof origFn === 'function') {
          electron.dialog[methodName] = function patchedDialog(...args) {
            try {
              if (args.length >= 2 && args[1] && typeof args[1] === 'object') {
                args[1] = translateDialogOptions(args[1]);
              } else if (args.length >= 1 && args[0] && typeof args[0] === 'object' && !args[0].webContents) {
                args[0] = translateDialogOptions(args[0]);
              }
            } catch (err) {
              console.error(`[antigravity-zh-cn] dialog.${methodName} error:`, err);
            }
            return origFn.apply(this, args);
          };
        }
      }

      if (typeof electron.dialog.showErrorBox === 'function') {
        const origErrorBox = electron.dialog.showErrorBox;
        electron.dialog.showErrorBox = function patchedErrorBox(title, content) {
          try {
            return origErrorBox.call(this, translateText(title), translateText(content));
          } catch {
            return origErrorBox.call(this, title, content);
          }
        };
      }
    }
  } catch (err) {
    console.error('[antigravity-zh-cn] Main hook initialization failed:', err);
  }

  module.exports = { installed: true, translateText };
}
