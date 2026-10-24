import type { AuthoringContent } from './strategy-authoring-content.js';
import { authoringStrategySchema } from './strategy-authoring-definition.js';
export function canGenerateAuthoringContent(content:AuthoringContent) {
  return Boolean(content.confirmation&&content.description.trim()&&content.requirements.length&&
    content.questions.every(q=>q.answerState==='confirmed')&&
    content.requirements.every(r=>!['unresolved','unsupported'].includes(r.state)));
}
export function canModifyAuthoringContent(content:AuthoringContent) {
  if(!canGenerateAuthoringContent(content))return false;
  return authoringStrategySchema.safeParse(content.definitionText).success;
}
