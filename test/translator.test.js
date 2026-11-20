'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDictionaries } = require('../src/patcher');
const { createTranslator, isAllowedOrigin, shouldSkipElement } = require('../src/runtime/preload-hook');

test('loadDictionaries validates all locale files and compiles regexes', () => {
  const dicts = loadDictionaries();
  assert.ok(dicts.stats.menuExactCount > 50, 'Expected rich menu exact dictionary');
  assert.ok(dicts.stats.uiExactCount > 150, 'Expected rich UI exact dictionary');
  assert.ok(dicts.stats.uiPatternCount >= 20, 'Expected dynamic pattern rules');
});

test('createTranslator translates exact UI labels and preserves whitespace', () => {
  const { rendererDict } = loadDictionaries();
  const { translate } = createTranslator(rendererDict);

  assert.equal(translate('New Conversation'), '新建对话');
  assert.equal(translate('  Settings  '), '  设置  ');
  assert.equal(translate('Terminal Sandbox'), '终端沙箱');
  assert.equal(translate('Permission Grants'), '权限授予规则');
});

test('createTranslator translates dynamic patterns safely without touching arbitrary prose', () => {
  const { rendererDict } = loadDictionaries();
  const { translate } = createTranslator(rendererDict);

  assert.equal(translate('3 files changed'), '3 个文件已变更');
  assert.equal(translate('1 file changed'), '1 个文件已变更');
  assert.equal(translate('Thought for 12s'), '已思考 12 秒');
  assert.equal(translate('5 minutes ago'), '5 分钟前');
  assert.equal(translate('Read 42 lines'), '已读取 42 行');
  assert.equal(translate('Showing 10 of 50'), '显示 10 / 50');

  // Arbitrary English prose / code must NOT be mutated
  const sentence = 'Please refactor Settings and Terminal Sandbox in main.ts';
  assert.equal(translate(sentence), sentence);
});

test('isAllowedOrigin restricts DOM translation to local Hub origins only', () => {
  assert.equal(isAllowedOrigin({ location: { protocol: 'https:', hostname: 'localhost' } }), true);
  assert.equal(isAllowedOrigin({ location: { protocol: 'http:', hostname: '127.0.0.1' } }), true);
  assert.equal(isAllowedOrigin({ location: { protocol: 'file:', hostname: '' } }), true);
  assert.equal(isAllowedOrigin({ location: { protocol: 'https:', hostname: 'github.com' } }), false);
  assert.equal(isAllowedOrigin({ location: { protocol: 'https:', hostname: 'google.com' } }), false);
});

test('shouldSkipElement protects code blocks, terminals, and editable fields', () => {
  const mockEl = (tagName, editable = false, closestMatch = false) => ({
    nodeType: 1,
    tagName,
    isContentEditable: editable,
    closest: () => (closestMatch ? {} : null),
  });

  assert.equal(shouldSkipElement(mockEl('CODE')), true);
  assert.equal(shouldSkipElement(mockEl('PRE')), true);
  assert.equal(shouldSkipElement(mockEl('TEXTAREA')), true);
  assert.equal(shouldSkipElement(mockEl('DIV', true)), true);
  assert.equal(shouldSkipElement(mockEl('SPAN', false, true)), true);
  assert.equal(shouldSkipElement(mockEl('BUTTON', false, false)), false);
});
