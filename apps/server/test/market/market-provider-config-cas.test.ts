import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { parseProviderSaveInput } from '../../src/market/market-provider-input.js';
import { MarketControlService } from '../../src/market/market-control.service.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';

describe('Provider 配置期望代次', () => {
  it.each([-1, 1.5, true, '1', null, Number.MAX_SAFE_INTEGER + 1])('政策入口拒绝非法期望修订 %s', async (version) => {
    const service = new MarketControlService({} as PrismaService, {} as DsaClient);
    await expect(service.applyPolicy({ expectedRevision: version })).rejects.toThrow(BadRequestException);
  });
  it.each([-1, 1.5, true, '1', null, Number.MAX_SAFE_INTEGER + 1])('拒绝非法代次 %s', (version) => {
    expect(() => parseProviderSaveInput({ enabled: false, expectedConfigVersion: version })).toThrow(BadRequestException);
  });

  it('原调用保持原输入，零代次可用于尚未保存的配置', () => {
    expect(parseProviderSaveInput({ enabled: false })).toEqual({ enabled: false });
    expect(parseProviderSaveInput({ enabled: false, expectedConfigVersion: 0 })).toEqual({
      enabled: false, expectedConfigVersion: 0,
    });
  });

  it('安全透传期望代次且不附带凭据或其他配置', async () => {
    const saveControlProvider = vi.fn().mockResolvedValue({ configVersion: 8, enabled: false });
    const service = new MarketControlService({} as PrismaService, { saveControlProvider } as unknown as DsaClient);
    await service.saveProvider('hithink', { requestId: 'cas-config', enabled: false, expectedConfigVersion: 7 });
    expect(saveControlProvider).toHaveBeenCalledExactlyOnceWith('hithink', {
      requestId: 'cas-config', enabled: false, expectedConfigVersion: 7,
    });
  });
});
