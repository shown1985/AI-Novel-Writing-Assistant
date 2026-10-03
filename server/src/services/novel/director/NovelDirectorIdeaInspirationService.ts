import type {
  DirectorIdeaInspirationRequest,
  DirectorIdeaInspirationsResponse,
} from "@ai-novel/shared/types/novelDirector";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { directorIdeaInspirationPrompt } from "../../../prompting/prompts/novel/ideaInspiration.prompts";
import {
  resolveDirectorIdeaContext,
  shouldRetryDirectorIdeaWithOriginalContext,
} from "./idea/ideaContext";

const IDEA_INSPIRATION_MAX_TOKENS = 1_800;
const IDEA_INSPIRATION_RETRY_TEMPERATURE = 0.25;

function resolveIdeaInspirationTemperature(input: DirectorIdeaInspirationRequest): number {
  return Math.min(0.8, Math.max(0.55, input.temperature ?? 0.72));
}

async function runIdeaInspirationPrompt(input: DirectorIdeaInspirationRequest, temperature: number, contextSummary: string, liveItemKey?: string) {
  return runStructuredPrompt({
    asset: directorIdeaInspirationPrompt,
    promptInput: {
      contextSummary,
    },
    options: {
      provider: input.provider,
      model: input.model,
      temperature,
      maxTokens: IDEA_INSPIRATION_MAX_TOKENS,
      itemKey: liveItemKey,
    },
  });
}

export class NovelDirectorIdeaInspirationService {
  async generate(input: DirectorIdeaInspirationRequest, options: { liveItemKey?: string } = {}): Promise<DirectorIdeaInspirationsResponse> {
    const contextSummary = await resolveDirectorIdeaContext(input);
    let result: Awaited<ReturnType<typeof runIdeaInspirationPrompt>>;
    try {
      result = await runIdeaInspirationPrompt(input, resolveIdeaInspirationTemperature(input), contextSummary, options.liveItemKey);
    } catch (error) {
      if (!shouldRetryDirectorIdeaWithOriginalContext(error)) {
        throw error;
      }
      result = await runIdeaInspirationPrompt(input, IDEA_INSPIRATION_RETRY_TEMPERATURE, contextSummary, options.liveItemKey);
    }

    return {
      ideas: result.output.ideas.map((idea) => ({
        angle: idea.angle.trim(),
        text: idea.text.trim(),
        tags: idea.tags.map((tag) => tag.trim()).filter(Boolean),
      })),
    };
  }
}

export const novelDirectorIdeaInspirationService = new NovelDirectorIdeaInspirationService();
