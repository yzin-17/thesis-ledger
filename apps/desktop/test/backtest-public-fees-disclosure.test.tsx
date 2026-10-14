import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BacktestPublicFeesDisclosure } from '../src/features/strategy/BacktestPublicFeesDisclosure.js';

const sample = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/schemas/fixtures/market-public-fees-v3.response.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

describe('回测冻结收费披露', () => {
  it('展示已冻结的备用整窗切换原因', () => {
    const html = renderToStaticMarkup(
      <BacktestPublicFeesDisclosure
        disclosure={{
          status: 'source',
          response: sample.response,
          fallbackReason: '主源未能提供本次可计算的公共收费，整段区间使用已配置备用源。',
        }}
      />,
    );
    expect(html).toContain('整段区间使用已配置备用源');
    expect(html).toContain('0.05%');
  });
  it('展示真实费率样本的变化、来源链接、转载性质及模型计算口径', () => {
    const html = renderToStaticMarkup(
      <BacktestPublicFeesDisclosure disclosure={{ status: 'source', response: sample.response }} />,
    );
    expect(html).toContain('历史公共收费：已使用冻结费率');
    expect(html).toContain('600000.SH');
    expect(html).toContain('0.1%');
    expect(html).toContain('0.05%');
    expect(html).toContain('0.00341%');
    expect(html).toContain('政府公开转载');
    expect(html).toContain(`href="${sample.response.sourceDocuments[0].url}"`);
    expect(html).toContain(sample.response.provenance.providerRevision);
    expect(html).toContain('规费包含关系');
    expect(html).toContain('历史首次可见时间尚未核验');
  });
  it('使用模型时展示冻结原因，旧快照无字段时不生成收费声明', () => {
    const html = renderToStaticMarkup(
      <BacktestPublicFeesDisclosure
        disclosure={{ status: 'executionModel', reason: '公共收费源暂不可用，使用已选执行模型。' }}
      />,
    );
    expect(html).toContain('公共收费：使用已选执行模型');
    expect(html).toContain('公共收费源暂不可用');
    expect(html).not.toContain('已使用冻结费率');
    expect(renderToStaticMarkup(<BacktestPublicFeesDisclosure disclosure={undefined} />)).toBe('');
  });
});
