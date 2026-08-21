import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { assetIdentitySourceSchema, assetIdentityStatusSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';
import {
  assetTypeForInstrument,
  CONFIRMABLE_INSTRUMENT_TYPES,
  isConfirmableInstrument,
  SUPPORTED_PORTFOLIO_MARKETS,
  symbolForInstrument,
} from './instrument-search.js';

const CONFIRMED_IDENTITY_STATUS = assetIdentityStatusSchema.enum.confirmed;
const CATALOG_IDENTITY_SOURCE = assetIdentitySourceSchema.enum.catalog;

@Injectable()
export class InstrumentAssociationService {
  constructor(private readonly prisma: PrismaService) {}

  async confirm(instrumentId: string) {
    const instrument = await this.prisma.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument) throw new NotFoundException('目录标的不存在');
    if (!CONFIRMABLE_INSTRUMENT_TYPES.has(instrument.instrumentType))
      throw new BadRequestException('该标的类型当前不可建立 Asset 关联');
    if (!SUPPORTED_PORTFOLIO_MARKETS.has(instrument.market))
      throw new BadRequestException('该市场当前不支持建立 Portfolio Asset');
    const symbol = symbolForInstrument(instrument);
    const assetType = assetTypeForInstrument(instrument.instrumentType);
    const asset = await this.prisma.$transaction(async (transaction) => {
      const existingAssociation = await transaction.instrumentAssetAssociation.findUnique({
        where: { symbol },
      });
      if (
        existingAssociation &&
        existingAssociation.instrumentId !== instrument.id &&
        existingAssociation.status === 'active' &&
        existingAssociation.confirmedAt !== null
      )
        throw new BadRequestException('该 Asset 已由用户确认关联到其他 Instrument');
      const existing = await transaction.asset.findUnique({ where: { symbol } });
      const savedAsset = existing
        ? await transaction.asset.update({
            where: { symbol },
            data: {
              identityStatus: CONFIRMED_IDENTITY_STATUS,
              identitySource: CATALOG_IDENTITY_SOURCE,
            },
          })
        : await transaction.asset.create({
            data: {
              symbol,
              name: instrument.displayName,
              market: instrument.market,
              assetType,
              currency: 'CNY',
              identityStatus: CONFIRMED_IDENTITY_STATUS,
              identitySource: CATALOG_IDENTITY_SOURCE,
            },
          });
      await transaction.instrumentAssetAssociation.upsert({
        where: { symbol },
        update: {
          instrumentId: instrument.id,
          status: 'active',
          source: CATALOG_IDENTITY_SOURCE,
          confirmedAt: new Date(),
          lastSeenAt: new Date(),
        },
        create: {
          instrumentId: instrument.id,
          symbol,
          status: 'active',
          source: CATALOG_IDENTITY_SOURCE,
          confirmedAt: new Date(),
        },
      });
      return savedAsset;
    });
    return { instrument, asset, associationSource: CATALOG_IDENTITY_SOURCE };
  }

  async requireConfirmed(instrumentId: string) {
    const instrument = await this.prisma.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument) throw new NotFoundException('目录标的不存在');
    if (!isConfirmableInstrument(instrument.instrumentType, instrument.market))
      throw new BadRequestException('该标的当前不支持进入 Portfolio');
    const association = await this.prisma.instrumentAssetAssociation.findUnique({
      where: { symbol: symbolForInstrument(instrument) },
    });
    if (
      !association ||
      association.instrumentId !== instrument.id ||
      association.status !== 'active'
    )
      throw new BadRequestException('标的尚未确认，不能用于新增持仓');
    return {
      ...instrument,
      symbol: symbolForInstrument(instrument),
      assetType: assetTypeForInstrument(instrument.instrumentType),
    };
  }

  associations(symbol?: string) {
    return this.prisma.instrumentAssetAssociation.findMany({
      ...(symbol ? { where: { symbol } } : {}),
      include: { instrument: true, asset: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }
}
