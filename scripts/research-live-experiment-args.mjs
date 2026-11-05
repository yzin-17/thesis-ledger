import { resolve } from 'node:path';

export function parseLiveExperimentArgs(args) {
  const prefixes = [
    'output',
    'resume',
    'history',
    'continue',
    'continue-terminal',
    'provider',
    'model',
  ];
  if (
    args.some(
      (value) =>
        ![
          '--execute',
          '--background',
          '--continue-confirmed-schema-failures',
          '--iterate',
        ].includes(value) && !prefixes.some((prefix) => value.startsWith('--' + prefix + '=')),
    ) ||
    ['--execute', '--background', '--continue-confirmed-schema-failures', '--iterate'].some(
      (flag) => args.filter((value) => value === flag).length > 1,
    ) ||
    prefixes.some(
      (prefix) => args.filter((value) => value.startsWith('--' + prefix + '=')).length > 1,
    ) ||
    args.filter((value) => value.startsWith('--output=')).length !== 1 ||
    args.filter((value) =>
      ['--resume=', '--history=', '--continue=', '--continue-terminal='].some((p) =>
        value.startsWith(p),
      ),
    ).length > 1 ||
    (args.includes('--background') && !args.includes('--execute'))
  )
    throw new Error(
      '用法：node scripts/research-live-experiment.mjs [--execute] [--background] [--provider=cloudflare|openrouter] [--model=<固定型号>] [--resume=<原中断目录>|--history=<旧协议目录>|--continue=<首429终态目录>|--continue-terminal=<多组终态目录>] --output=<新证据目录>',
    );
  const argument = (key) => args.find((value) => value.startsWith('--' + key + '='));
  const providerId = argument('provider')?.slice(11) ?? 'cloudflare';
  const selectedModel = argument('model')?.slice(8);
  if (
    args.includes('--iterate') &&
    (providerId !== 'cloudflare' ||
      !selectedModel ||
      !argument('history') ||
      args.includes('--continue-confirmed-schema-failures'))
  )
    throw new Error('优化协议只接受固定Cloudflare型号和累计历史');
  if (
    !['cloudflare', 'openrouter'].includes(providerId) ||
    (selectedModel && providerId === 'cloudflare' && selectedModel !== '@cf/qwen/qwen3.8-27b')
  )
    throw new Error('只允许本次已授权Provider及其固定型号');
  if (providerId === 'cloudflare' && selectedModel && !argument('history') && !argument('continue'))
    throw new Error('Cloudflare五例必须带入跨Provider累计历史或获准首429终态');
  if (
    providerId === 'openrouter' &&
    !argument('history') &&
    !argument('continue') &&
    !argument('continue-terminal')
  )
    throw new Error('OpenRouter必须带入累计历史或已核对的终态');
  if (
    args.includes('--continue-confirmed-schema-failures') &&
    (providerId !== 'openrouter' ||
      (!argument('continue-terminal') &&
        !(argument('history') && selectedModel === 'nvidia/nemotron-3.5-super-vl:free')))
  )
    throw new Error('已确认Schema失败策略仅允许OpenRouter多组终态或Nemotron独立筛查');
  return {
    output: resolve(argument('output').slice(9)),
    providerId,
    selectedModel,
    resumeArgument: argument('resume'),
    historyArgument: argument('history'),
    continuationArgument: argument('continue'),
    terminalArgument: argument('continue-terminal'),
    continueConfirmedSchemaFailures: args.includes('--continue-confirmed-schema-failures'),
    iterate: args.includes('--iterate'),
  };
}
