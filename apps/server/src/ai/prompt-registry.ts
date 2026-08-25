import { Injectable } from '@nestjs/common';
import type { PromptTemplate } from './contracts.js';

@Injectable()
export class PromptVersionRegistry {
  private readonly prompts = new Map<string, PromptTemplate[]>();

  register(prompt: PromptTemplate) {
    const versions = this.prompts.get(prompt.name) ?? [];
    if (versions.some((item) => item.version === prompt.version)) {
      throw new Error(`Prompt 版本已存在: ${prompt.name}@${prompt.version}`);
    }
    versions.push(prompt);
    this.prompts.set(prompt.name, versions);
    return prompt;
  }

  latest(name: string) {
    const versions = this.prompts.get(name) ?? [];
    return versions.at(-1);
  }

  history(name: string) {
    return [...(this.prompts.get(name) ?? [])];
  }
}
