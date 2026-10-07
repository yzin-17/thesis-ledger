import { createHash } from 'node:crypto';
import { compareMarketPitEvidenceInstantStringsV1 } from '@thesis-ledger/schemas';
import { DsaV3ProtocolError } from './dsa-v3-protocol.js';

export function navInvalid(): never {
  throw new DsaV3ProtocolError('DSA 净值原文、身份或证据关联无效', 'invalid-response');
}
export const navHash = (raw: string | Buffer) => createHash('sha256').update(raw).digest('hex');
export const navCanonical = (value: unknown): string => {
  const sort = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(sort);
    if (node && typeof node === 'object')
      return Object.fromEntries(
        Object.entries(node)
          .sort(([a], [b]) => (a < b ? -1 : Number(a > b)))
          .map(([key, item]) => [key, sort(item)]),
      );
    return node;
  };
  return JSON.stringify(sort(value));
};
export const navEqual = (a: unknown, b: unknown) => navCanonical(a) === navCanonical(b);
export function navTimeBefore(a: string, b: string) {
  const result = compareMarketPitEvidenceInstantStringsV1(a, b);
  if (result === undefined || result > 0) navInvalid();
}

/** 扫描数据词法，拒绝重复对象键及过深结构；裸键只用于来源的基金身份数据。 */
export function parseNavRaw(raw: string, bareKeys = false): unknown {
  const token = /\s+|[{}[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*/y;
  const stack: Array<Set<string> | null> = [];
  const colon = /\s*:/y;
  let offset = 0;
  const output: string[] = [];
  while (offset < raw.length) {
    let item: string;
    if (raw[offset] === '"') {
      const end = quotedEnd(raw, offset);
      item = raw.slice(offset, end);
      offset = end;
    } else {
      token.lastIndex = offset;
      const match = token.exec(raw);
      if (!match) navInvalid();
      item = match[0];
      offset = token.lastIndex;
    }
    colon.lastIndex = offset;
    if (item === '{' || item === '[') {
      stack.push(item === '{' ? new Set() : null);
      if (stack.length > 64) navInvalid();
    } else if (item === '}' || item === ']') {
      if (!stack.length) navInvalid();
      stack.pop();
    } else if (!/^\s+$/.test(item) && colon.test(raw)) {
      item = registerKey(item, bareKeys, stack.at(-1));
    }
    output.push(item);
  }
  if (stack.length) navInvalid();
  try {
    return JSON.parse(output.join(''));
  } catch {
    navInvalid();
  }
}

function registerKey(item: string, bareKeys: boolean, keys: Set<string> | null | undefined) {
  if (!keys) navInvalid();
  if (!item.startsWith('"')) {
    if (!bareKeys || !/^[A-Za-z_]\w*$/.test(item)) navInvalid();
    item = JSON.stringify(item);
  }
  const key = JSON.parse(item) as string;
  if (keys.has(key)) navInvalid();
  keys.add(key);
  return item;
}

function quotedEnd(raw: string, start: number): number {
  let index = start + 1;
  while (index < raw.length) {
    if (raw[index] === '"') return index + 1;
    if (raw[index] === '\\') index += 1;
    index += 1;
  }
  navInvalid();
}
