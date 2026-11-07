import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftCloseSnapshotBoundaryViolation as check } from './draft-close-boundaries.mjs';
import { navigationDraftSnapshotBoundaryViolation as navigation } from './draft-close-boundaries.mjs';

const file = 'apps/desktop/src/features/journal/Editor.tsx';
test('识别直接调用及属性调用中的空草稿快照', () => {
  assert.match(
    check(file, 'useDraftCloseGuard({ open, draft: null, dirty: true });'),
    /实际草稿快照/u,
  );
  assert.match(
    check(file, 'hooks.useDraftCloseGuard({ draft: null, busy: false });'),
    /实际草稿快照/u,
  );
});
test('接受实际快照、简写及业务对象的合法空值', () => {
  assert.equal(check(file, 'useDraftCloseGuard({ open, draft, busy });'), null);
  assert.equal(
    check(file, 'useDraftCloseGuard({ draft: { accountId: null, amount }, dirty });'),
    null,
  );
  assert.equal(check(file, 'useDraftCloseGuard({ "draft": fields, dirty });'), null);
});
test('注释、字符串、同名函数声明及其他调用不误报', () => {
  assert.equal(check(file, '// useDraftCloseGuard({ draft: null });'), null);
  assert.equal(check(file, 'const example = "useDraftCloseGuard({ draft: null })";'), null);
  assert.equal(check(file, 'function useDraftCloseGuard({ draft = null }) {}'), null);
  assert.equal(check(file, 'someOtherGuard({ draft: null });'), null);
});
test('只检查 Desktop 生产源码', () => {
  const source = 'useDraftCloseGuard({ draft: null });';
  assert.equal(check('apps/desktop/test/example.tsx', source), null);
  assert.equal(check('apps/mobile/src/example.tsx', source), null);
});

test('导航登记必须提供实际快照，dirty 标记不能替代内容', () => {
  assert.match(navigation(file, 'useNavigationGuard({ dirty, busy });'), /必须登记/u);
  assert.match(
    navigation(file, 'hooks.useNavigationGuard({ dirty: true, draft: null });'),
    /必须登记/u,
  );
  assert.equal(navigation(file, 'useNavigationGuard({ dirty, busy, draft });'), null);
  assert.equal(
    navigation(file, 'useNavigationGuard({ dirty, draft: { revision, accountId: null } });'),
    null,
  );
});
test('纯忙碌登记不需要伪造草稿，注释和测试输入不误报', () => {
  assert.equal(navigation(file, 'useNavigationGuard({ dirty: false, busy });'), null);
  assert.equal(navigation(file, '// useNavigationGuard({ dirty, busy });'), null);
  assert.equal(navigation(file, 'const example = "useNavigationGuard({ dirty })";'), null);
  assert.equal(navigation('apps/desktop/test/guard.tsx', 'useNavigationGuard({ dirty });'), null);
});
