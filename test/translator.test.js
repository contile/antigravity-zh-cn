'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDictionaries } = require('../src/patcher');
const {
  createTranslator,
  isAllowedOrigin,
  shouldSkipElement,
} = require('../src/runtime/preload-hook');

test('loadDictionaries validates all locale files and compiles regexes', () => {
  const dicts = loadDictionaries();
  assert.ok(dicts.stats.menuExactCount > 50);
  assert.ok(dicts.stats.uiExactCount > 500);
  assert.ok(dicts.stats.uiControlCount > 100);
  assert.ok(dicts.stats.uiPatternCount >= 40);
});

test('createTranslator handles exact UI strings, long settings descriptions, and whitespace', () => {
  const { rendererDict } = loadDictionaries();
  const { translate } = createTranslator(rendererDict);

  assert.equal(translate('New Conversation'), '新建对话');
  assert.equal(translate('  This Computer  '), '  本机  ');
  assert.equal(translate('Ask anything, @ to mention'), '输入任何问题，输入 @ 引用上下文');
  assert.equal(translate('Commands Outside Sandbox'), '沙箱外命令');
  assert.equal(
    translate(
      'Automatically prompt you to restart the app when a new update is available. When disabled, you can check for updates manually from the app menu.'
    ),
    '发现新版本时自动提示重启更新；关闭后仍可通过应用菜单手动检查更新。'
  );
});

test('createTranslator guards single-word control labels outside UI controls', () => {
  const { rendererDict } = loadDictionaries();
  const { translate } = createTranslator(rendererDict);

  assert.equal(translate('Back', { allowControls: true }), '返回');
  assert.equal(translate('Back', { allowControls: false }), 'Back');
  assert.equal(translate('Idle', { allowControls: true }), '空闲');
  assert.equal(translate('Idle', { allowControls: false }), 'Idle');
});

test('createTranslator matches dynamic patterns without mutating arbitrary prose', () => {
  const { rendererDict } = loadDictionaries();
  const { translate } = createTranslator(rendererDict);

  assert.equal(translate('3 files changed'), '3 个文件已变更');
  assert.equal(translate('Thought for 12s'), '已思考 12 秒');
  assert.equal(translate('5 minutes ago'), '5 分钟前');
  assert.equal(translate('Read 42 lines'), '已读取 42 行');
  assert.equal(translate('Edited src/index.ts'), '已编辑 src/index.ts');
  assert.equal(translate('Working Directory: D:\\work'), '工作目录：D:\\work');
  assert.equal(translate('Your Plan: Google AI Pro'), '当前方案：Google AI Pro');
  assert.equal(translate('Gemini 4 Argon Weekly Limit'), 'Gemini 4 Argon 每周额度');
  assert.equal(
    translate('You have used some of your weekly limit, it will fully refresh in 6 days, 22 hours.'),
    '已使用部分每周额度，将在 6 天 22 小时 后完全重置。'
  );
  assert.equal(
    translate('You have used some of your 5-hour limit, it will fully refresh in 3 hours, 47 minutes.'),
    '已使用部分 5 小时额度，将在 3 小时 47 分钟 后完全重置。'
  );
  assert.equal(translate('Models & Usage'), '模型与用量');
  assert.equal(translate('Not in Project'), '不在项目中');
  assert.equal(translate('Give Feedback'), '反馈问题');
  assert.equal(translate('Preset'), '预设');
  assert.equal(translate('Background'), '背景色');
  assert.equal(translate('Foreground'), '前景色');
  assert.equal(translate('Execution'), '执行');
  assert.equal(translate('Not set'), '未设置');
  assert.equal(translate('Change'), '更改');
  assert.equal(translate('Navigation'), '导航');
  assert.equal(translate('Layout Controls'), '布局控制');
  assert.equal(translate('Resets in 6d 22h'), '将于 6 天 22 小时 后重置');
  assert.equal(translate('Resets in 3h 30m'), '将于 3 小时 30 分钟 后重置');
  assert.equal(translate('% left'), '% 剩余');
  assert.equal(translate('Hey Alex, what should we build today?'), '你好 Alex，今天想一起构建什么？');
  assert.equal(translate('Welcome back, Alex. Where should we pick up?'), '欢迎回来，Alex。从哪里继续？');
  assert.equal(
    translate('Ask anything, @ to mention, / for actions'),
    '输入任何问题，@ 引用上下文，/ 调用指令'
  );

  const sentence = 'Please refactor Settings and Terminal Sandbox in main.ts';
  assert.equal(translate(sentence), sentence);
});

test('isAllowedOrigin restricts DOM translation to local Hub and plugin origins', () => {
  assert.equal(isAllowedOrigin({ location: { protocol: 'https:', hostname: '127.0.0.1' } }), true);
  assert.equal(isAllowedOrigin({ location: { protocol: 'https:', hostname: 'localhost' } }), true);
  assert.equal(isAllowedOrigin({ location: { protocol: 'plugin:', hostname: 'abc123' } }), true);
  assert.equal(isAllowedOrigin({ location: { protocol: 'https:', hostname: 'github.com' } }), false);
});

test('shouldSkipElement protects code, terminals, icon fonts, file trees, and chat content', () => {
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
