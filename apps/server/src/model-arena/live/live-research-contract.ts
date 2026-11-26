import { z } from 'zod';
import {
  aiGenerationContracts,
  arenaLiveResearchStepSchema,
  arenaResearchToolRequestSchema,
  type ArenaLiveProtocol,
  type ArenaResearchToolRequest,
} from '@thesis-ledger/schemas';

/** 当前阶段的接入能力；具体资料仍由工具和执行证据门禁核验。 */
export function liveResearchContract(input: {
  protocol: Pick<ArenaLiveProtocol, 'allowWebSearch'>;
  replay: boolean;
}) {
  const tools: ArenaResearchToolRequest['name'][] = [
    'search_instruments',
    'quote',
    'bars',
    'indicators',
  ];
  if (!input.replay) {
    tools.push('news');
    if (input.protocol.allowWebSearch) tools.push('web_search');
  }
  const variants = arenaResearchToolRequestSchema.options
    .filter((tool) => tools.includes(tool.shape.name.value))
    .map((tool) => {
      if (input.replay && 'timeframe' in tool.shape)
        return tool.extend({ timeframe: tool.shape.timeframe.exclude(['1d']) });
      return tool;
    });
  const first = variants[0];
  if (!first) throw new Error('研究工具能力不能为空');
  const requestSchema = z.discriminatedUnion('name', [first, ...variants.slice(1)]);
  const [toolStep, decisionStep] = arenaLiveResearchStepSchema.options;
  return {
    ref: aiGenerationContracts.arenaLiveResearch.ref,
    capabilities: {
      tools: variants.map((tool) => tool.shape.name.value),
      timeframes: [
        ...new Set(
          variants.flatMap((tool) =>
            'timeframe' in tool.shape ? tool.shape.timeframe.options : [],
          ),
        ),
      ],
    },
    schema: z.discriminatedUnion('action', [
      toolStep.extend({ requests: z.array(requestSchema).min(1).max(5) }),
      decisionStep,
    ]),
  };
}
