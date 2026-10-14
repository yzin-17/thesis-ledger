import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { authoringDraftReadSchema, type IdentityPrincipal } from '@thesis-ledger/schemas';
import { IdentityGuard, CurrentIdentity } from '../identity/identity.guard.js';
import { AuthoringDraftRepository, type AuthoringDraft } from './authoring-draft.repository.js';

const listQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    beforeUpdatedAt: z.iso.datetime().optional(),
    beforeId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.beforeUpdatedAt) === Boolean(value.beforeId),
    '分页游标必须完整',
  );
const draftView = (draft: AuthoringDraft) =>
  authoringDraftReadSchema.parse({
    ...draft,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  });
const discard = z.object({ expectedRevision: z.number().int().positive() }).strict();

@Controller('strategy-authoring/drafts')
@UseGuards(IdentityGuard)
export class AuthoringDraftController {
  constructor(private readonly drafts: AuthoringDraftRepository) {}
  @Post()
  async create(@CurrentIdentity() user: IdentityPrincipal, @Body() input: unknown) {
    return draftView(await this.drafts.create(user.id, input));
  }
  @Get()
  async list(@CurrentIdentity() user: IdentityPrincipal, @Query() raw: unknown) {
    const query = listQuery.parse(raw);
    const page = await this.drafts.list(user.id, {
      ...(query.limit ? { limit: query.limit } : {}),
      ...(query.beforeId && query.beforeUpdatedAt
        ? { before: { id: query.beforeId, updatedAt: query.beforeUpdatedAt } }
        : {}),
    });
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }
  @Get(':id')
  async read(@CurrentIdentity() user: IdentityPrincipal, @Param('id') id: string) {
    return draftView(await this.drafts.read(user.id, id));
  }
  @Patch(':id')
  async update(
    @CurrentIdentity() user: IdentityPrincipal,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return draftView(await this.drafts.update(user.id, id, input));
  }
  @Post(':id/discard')
  async discard(
    @CurrentIdentity() user: IdentityPrincipal,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return draftView(await this.drafts.discard(user.id, id, discard.parse(input).expectedRevision));
  }
}
