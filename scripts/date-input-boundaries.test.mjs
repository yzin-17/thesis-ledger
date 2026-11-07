import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dateInputBoundaryViolation as check } from './date-input-boundaries.mjs';

test('日期消费者必须使用公共输入；类型和值仍属于业务', () => {
  const consumer = 'apps/desktop/src/features/journal/Review.tsx';
  assert.match(check(consumer, '<Input type="date" />'), /公共 DateInput/u);
  assert.match(check(consumer, '<input type="month" />'), /公共 DateInput/u);
  assert.match(check(consumer, '<InputGroupInput type="datetime-local" />'), /公共 DateInput/u);
  assert.equal(check(consumer, '<DateInput type="date" value={date} />'), null);
  assert.equal(check(consumer, '<Input type="text" />'), null);
});

test('共享日期控件不能反向依赖业务或回退原生弹层', () => {
  const control = 'apps/desktop/src/components/ui/date-input.tsx';
  assert.equal(check(control, '<InputGroupInput type={type} />'), null);
  assert.match(check(control, 'input.showPicker()'), /原生日期弹层/u);
  assert.match(check(control, "import { convert } from '@/features/journal/time'"), /反向依赖/u);
  assert.equal(check(control, "import { cn } from '@/lib/utils'"), null);
});
