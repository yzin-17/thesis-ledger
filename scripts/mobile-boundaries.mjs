import { posix } from 'node:path';

const sharedContracts = [
  'packages/api-client/src/',
  'packages/schemas/src/',
  'packages/domain/src/',
];
export function mobileBoundaryViolation(file, specifier) {
  const target = specifier.startsWith('.')
    ? posix.normalize(posix.join(posix.dirname(file), specifier))
    : specifier;
  if (file.startsWith('apps/mobile/src/') && /^apps\/(desktop|server)\//u.test(target))
    return '手机不得通过相对路径依赖 Desktop 或 Server 应用';
  if (sharedContracts.some((prefix) => file.startsWith(prefix)) && /^apps\//u.test(target))
    return '共享合同不得通过相对路径反向依赖应用源码';
  if (
    file.startsWith('apps/mobile/src/') &&
    /^@thesis-ledger\/(?:desktop|server)(?:\/|$)/u.test(specifier)
  )
    return '手机只能消费共享合同，不得依赖 Desktop 或 Server 应用';
  if (
    !sharedContracts.some((prefix) => file.startsWith(prefix)) ||
    /\.test\.[cm]?[jt]sx?$/u.test(file)
  )
    return null;
  if (
    /^(?:react(?:-native|-dom)?(?:\/|$)|@react-navigation\/|expo(?:-|\/|$)|@thesis-ledger\/(?:desktop|mobile|server)(?:\/|$))/u.test(
      specifier,
    )
  )
    return '跨端领域合同不得依赖 UI 应用或原生平台模块';
  if (
    file.startsWith('packages/api-client/src/') &&
    /^(?:node:|fs$|path$|http$|https$|net$)/u.test(specifier)
  )
    return '共享 API client 不得依赖 Node 运行时';
  return null;
}
