const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRuntimeSource } = require('../../novelProduction/sourceHarness.cjs');
const budget = require('../../../dist/platform/llm/retries');

function fixture() {
  const events = [];
  const noop = () => {};
  const exports = loadRuntimeSource('../../../prompting/core/execution/textPromptExecution.ts', {
    '@langchain/core/messages': { HumanMessage: class { constructor(content) { this.content = content; } }, SystemMessage: class { constructor(content) { this.content = content; } } },
    '../../../llm/factory': { getResolvedLLMClientOptionsFromInstance: () => ({provider:'openai',model:'fixture',maxTokens:6000}), getLLM: async () => { events.push('factory'); return { stream: async () => {
      events.push('stream'); return { async *[Symbol.asyncIterator]() { yield { content: '正文' }; } };
    } }; } },
    '../../../llm/reasoning': { ReasoningStreamCollector: class { push() { return ''; } flush() { return ''; } } },
    '../../../llm/structuredInvoke': { formatLivePrompt: () => '' },
    '../../../llm/usageTracking': { extractLlmTokenUsage: () => null, mergeStreamTokenUsage: () => null },
    '../../../services/novel/novelP0Utils': { toText: value => value || '' },
    '../../../platform/llm/live/llmLiveSession': { beginLlmLiveSession: () => ({ phase: noop, observe: call => call(), delta: noop, reasoning: noop, usage: noop, complete: noop, fail: noop }) },
    '../../../platform/llm/retries': budget,
    '../../../platform/llm/provenance': {
      buildPromptInvocationAttribution: () => ({}),
      getModelAttemptExecutionEvidence: () => null,
      getModelAttemptRequestState: () => null,
      runWithModelAttemptRequestContext: (_s, run) => run(),
      runWithModelAttemptRequestState: (_s, run) => run(),
      startModelTransportAttempt: async () => ({ finalizeSucceeded: noop, finalizeFailed: noop, finalizeCancelled: noop }),
    },
    '../../templates/templateRuntime': { resolveAdvancedPromptMessages: async input => input.officialMessages },
    '../contextSelection': { selectContextBlocks: () => ({ selectedBlocks: [], droppedBlocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedTokens: 1, compressionLogs: [] }) },
    './promptExecutionContext': {
      buildPromptInvocationMeta: () => ({ semanticRetryUsed: false, semanticRetryAttempts: 0, repairUsed: false, repairAttempts: 0 }),
      preparePromptExecution: (input) => ({ context: { estimatedInputTokens: 1 }, messages: [], invocation: { semanticRetryUsed: false, semanticRetryAttempts: 0 } }),
      resolvePromptOverlaysForAsset: async (input) => ({ blocks: input.contextBlocks ?? [], resolvedSlots: null }),
    },
    './structuredPromptExecution': { applyPromptPostValidate: ({ rawOutput }) => rawOutput },
  });
  const buildResult = (input) => ({ output: input.output, context: input.context, invocation: input.invocation, tokenUsage: input.tokenUsage });
  const mockedFactory = async () => { events.push('factory'); return { stream: async () => {
    events.push('stream'); return { async *[Symbol.asyncIterator]() { yield { content: '正文' }; } };
  } }; };
  const dependencies = { llmFactory: mockedFactory, buildResult, recordFailure: noop };
  return {
    events,
    runTextPrompt: (input) => exports.executeTextPrompt(input, dependencies),
    streamTextPrompt: (input) => exports.executeTextPromptStream(input, dependencies),
    asset: { id: 'test.text', version: 'v1', mode: 'text', taskType: 'writer', render: () => [{ content: '写作' }] },
  };
}
for (const method of ['runTextPrompt', 'streamTextPrompt']) {
  test(`${method} reserves before its physical text request`, async () => {
    const f = fixture();
    const result = await budget.withModelRequestBudget({ remaining: () => 1, beforeRequest: async () => { f.events.push('reserve'); } },
      () => f[method]({ asset: f.asset, promptInput: {} }));
    if (method === 'streamTextPrompt') { for await (const chunk of result.stream) {} await result.complete; }
    assert.deepEqual(f.events, ['factory', 'reserve', 'stream']);
  });
  test(`${method} cannot send a request when reservation fails`, async () => {
    const f = fixture();
    await assert.rejects(budget.withModelRequestBudget({ remaining: () => 0, beforeRequest: async () => { throw new Error('no budget'); } },
      () => f[method]({ asset: f.asset, promptInput: {} })), /no budget/);
    assert.equal(f.events.includes('stream'), false);
  });
}
test('text requests without a budget context retain their existing behavior', async () => {
  const f = fixture();
  assert.equal((await f.runTextPrompt({ asset: f.asset, promptInput: {} })).output, '正文');
  assert.deepEqual(f.events, ['factory', 'stream']);
});
