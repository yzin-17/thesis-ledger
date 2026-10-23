import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  researchScopeSnapshotV2Schema,
  researchSubmissionReceiptV2Schema,
  researchScopeInstrumentsV2,
  researchCapabilitiesV2Schema,
  type ResearchFrozenEvidenceV2,
  type ResearchSubmissionV2,
  type ResearchScopeSnapshotV2,
} from '@thesis-ledger/schemas';
import { AiRunService } from '../ai/ai-run.service.js';
import { AiResearchExecutor } from '../ai/ai-research.executor.js';
import { PromptVersionRegistry } from '../ai/prompt-registry.js';
import { normalizeResearchSubmissionV2 } from '../ai/ai-research-submission-identity-v2.js';
import { sealAiFrozenResearchV2 } from '../ai/ai-research-frozen-integrity-v2.js';
import { MarketService } from '../market/market.service.js';
import { MarketNewsReader } from '../market/market-news-reader.js';
import { ResearchScopeReader } from './research-scope-reader.js';
import { ResearchPreparationBudget } from './research-preparation-budget.js';
import { missingResearchEvidence, newsResearchEvidence } from './research-public-evidence.js';
import { finalizeResearchMaterials } from './research-material-preparation.js';
import { readResearchPrice } from './research-price-material.js';
import { researchV2WritesEnabled } from '../ai/ai-research-v2-write-policy.js';

type Run = NonNullable<Awaited<ReturnType<AiRunService['findResearchSubmissionV2']>>>;
const receipt = (run: Run, reused: boolean) =>
  researchSubmissionReceiptV2Schema.parse({
    version: 2,
    runId: run.id,
    submissionId: run.researchSubmissionId,
    status: run.status,
    reused,
    scopeSnapshot: researchScopeSnapshotV2Schema.parse(run.researchScopeSnapshot),
  });

@Injectable()
export class ResearchSubmissionService {
  constructor(
    @Inject(AiRunService) private readonly runs: AiRunService,
    @Inject(AiResearchExecutor) private readonly executor: AiResearchExecutor,
    @Inject(PromptVersionRegistry) private readonly prompts: PromptVersionRegistry,
    @Inject(ResearchScopeReader) private readonly scopes: ResearchScopeReader,
    @Inject(MarketService) private readonly market: MarketService,
    @Inject(MarketNewsReader) private readonly news: MarketNewsReader,
  ) {}
  capabilities(ownerId: string) {
    return researchCapabilitiesV2Schema.parse({
      version: 'research-capabilities-v2',
      canCreate: researchV2WritesEnabled(),
      scopes: this.scopes.allowedScopes(ownerId),
    });
  }

  async submit(ownerId: string, raw: unknown, signal?: AbortSignal) {
    const input = normalizeResearchSubmissionV2(raw);
    const budget = new ResearchPreparationBudget(signal);
    try {
      return await budget.run(() => this.prepareAndSubmit(ownerId, input, budget));
    } finally {
      budget.close();
    }
  }
  async find(ownerId: string, raw: unknown) {
    const input = normalizeResearchSubmissionV2(raw);
    const run = await this.runs.findResearchSubmissionV2(ownerId, input, this.scopes);
    if (!run) throw new NotFoundException('研究提交不存在');
    return receipt(run, true);
  }
  async cancel(ownerId: string, raw: unknown) {
    const run = await this.runs.cancelResearchSubmissionV2(
      ownerId,
      normalizeResearchSubmissionV2(raw),
      this.scopes,
    );
    if (run.status === 'cancelled') this.executor.cancelActive(run.id);
    return receipt(run, true);
  }

  private async prepareAndSubmit(
    ownerId: string,
    input: ResearchSubmissionV2,
    budget: ResearchPreparationBudget,
  ) {
    const existing = await this.runs.findResearchSubmissionV2(ownerId, input, this.scopes);
    if (existing) return receipt(existing, true);
    const context = await this.scopes.resolve(ownerId, input);
    budget.assertActive();
    await this.runs.researchV2Default(input.researchSettingsRevision);
    const template = input.templateId ?? 'primary-risks';
    const prompt = this.prompts.latest(`research-v2:${template}`);
    if (!prompt) throw new BadRequestException('研究模板尚未配置');
    const scope = context.scopeSnapshot;
    const instruments = researchScopeInstrumentsV2(scope);
    const priceRequired = scope.scope === 'instrument' || scope.scope === 'position';
    const reads = await Promise.all(
      instruments.map((instrument) =>
        this.publicEvidence(instrument, template, budget, priceRequired),
      ),
    );
    const { evidence, scopeSnapshot } = finalizeResearchMaterials(
      context,
      reads,
      template === 'recent-changes' || template === 'counter-evidence',
    );
    budget.assertActive();
    const missing = evidence.filter((entry) => entry.required && !entry.usable);
    if (missing.length)
      throw new BadRequestException({
        code: 'RESEARCH_REQUIRED_EVIDENCE_UNAVAILABLE',
        message: '必需研究材料不足，未创建模型任务',
        reasons: [...new Set(missing.flatMap((entry) => entry.reasons))],
      });
    const preparedAt = new Date().toISOString();
    const reasons = [...new Set(evidence.flatMap((entry) => entry.reasons))].slice(0, 100);
    const frozen = sealAiFrozenResearchV2({
      version: 'frozen-research-v2',
      resultVersion: 2,
      request: input,
      scopeSnapshot,
      prompt: { version: prompt.version, template: prompt.template },
      researchSettingsRevision: input.researchSettingsRevision,
      preparedAt,
      dataCutoffAt: preparedAt,
      inputFingerprint: '0'.repeat(64),
      evidence,
      quality: { status: reasons.length ? 'partial' : 'complete', reasons },
    });
    budget.assertActive();
    const saved = await this.runs.startResearchV2(ownerId, frozen, this.scopes, budget.signal);
    if (budget.signal.aborted) {
      await this.runs.cancelResearchSubmissionV2(ownerId, input, this.scopes);
      budget.assertActive();
    }
    if (!saved.reused) this.executor.dispatch(saved.run.id);
    return receipt(saved.run, saved.reused);
  }

  private async publicEvidence(
    instrument: Extract<ResearchScopeSnapshotV2, { scope: 'instrument' }>['instrument'],
    template: NonNullable<ResearchSubmissionV2['templateId']>,
    budget: ResearchPreparationBudget,
    priceRequired: boolean,
  ) {
    const newsRequired = template === 'recent-changes' || template === 'counter-evidence';
    const publishedEnd = new Date().toISOString();
    const instrumentRequest = {
      market: instrument.market,
      assetType: instrument.assetType,
      symbol: instrument.symbol,
    };
    const [price, news] = await Promise.allSettled([
      readResearchPrice(this.market, instrument, budget),
      this.news.read(
        {
          instrument: instrumentRequest,
          publishedStart: new Date(Date.parse(publishedEnd) - 7 * 86_400_000).toISOString(),
          publishedEnd,
          limit: 10,
          cursor: null,
          requestBudgetMs: budget.remainingMs(),
        },
        budget.signal,
      ),
    ]);
    budget.assertActive();
    const cutoff = new Date().toISOString();
    const resolvedInstrument = price.status === 'fulfilled' ? price.value.instrument : instrument;
    const evidence: ResearchFrozenEvidenceV2[] = [
      price.status === 'fulfilled'
        ? price.value.evidence
        : missingResearchEvidence('quote', true, 'quote_unavailable'),
    ];
    if (news.status === 'fulfilled')
      evidence.push(...newsResearchEvidence(news.value, newsRequired, cutoff));
    else evidence.push(missingResearchEvidence('news', newsRequired, 'news_unavailable'));
    evidence[0]!.required = priceRequired;
    return { instrument: resolvedInstrument, evidence };
  }
}
