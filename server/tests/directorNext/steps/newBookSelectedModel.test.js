const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRuntimeSource } = require("../../novelProduction/sourceHarness.cjs");

// Exercise the real new-book adapter without loading the production DB or any model adapter.
const chapterCountHelpers = loadRuntimeSource("../director/runtime/novelDirectorHelpers.ts", {
  "node:crypto": require("node:crypto"),
  "@ai-novel/shared/types/novelDirector": require("@ai-novel/shared/types/novelDirector"),
  "@ai-novel/shared/types/autoDirectorApproval": require("@ai-novel/shared/types/autoDirectorApproval"),
  "@ai-novel/shared/types/directorCompletion": require("@ai-novel/shared/types/directorCompletion"),
  "../../../title/TitleGenerationService": {},
  "../../../title/titleGeneration.shared": {},
  "../../bookContract": {},
});

function loadNewBook({ selected }) {
  const created = [], commands = [];
  const { launchNewDirectorBook } = loadRuntimeSource("../../../app/director/newBook.ts", {
    "../../db/prisma": {
      prisma: {
        novel: { findUnique: async () => null, update: async () => {} },
        creationStudioConfirmation: {
          findUniqueOrThrow: async () => ({ id: "confirmation-1", novelId: null }),
          update: async () => {},
        },
      },
    },
    "../../services/novel/NovelCoreService": {
      NovelCoreService: class {
        async createNovel(input) { created.push(input); return { id: input.id }; }
      },
    },
    "../../services/settings/LLMSelectionSettingsService": {
      getLLMSelectionSettings: async () => selected,
    },
    "./services": {
      getDirectorProductionServices: () => ({
        http: { commandService: { execute: async command => { commands.push(command); return { runId: "run-1" }; } } },
      }),
    },
    "../../middleware/errorHandler": { AppError: Error },
    "../../services/styleEngine/StyleBindingService": { StyleBindingService: class { async ensureNovelDefault() {} } },
    "../../modules/novel/director-routing": { assertNovelDirectorVersion: async () => {} },
    "../../services/novel/director/runtime/novelDirectorHelpers": chapterCountHelpers,
  });
  return { launchNewDirectorBook, created, commands };
}

const confirmInput = {
  idea: "在压力下寻找真相",
  candidate: { workingTitle: "夜航", logline: "寻找失踪者", targetChapterCount: 12 },
  title: "夜航",
  estimatedChapterCount: 12,
  runMode: "stage_review",
};

test("creation studio handoff freezes the model captured at confirm time into the run contract", async () => {
  const { launchNewDirectorBook, created, commands } = loadNewBook({
    selected: { provider: "openai", model: "switched-after-confirm", temperature: 0.3 },
  });
  await launchNewDirectorBook({ ...confirmInput, provider: "ollama", model: "qwen3:8b" }, "creation-task", "creation_studio");
  assert.equal(created.length, 1);
  assert.equal(commands.length, 1);
  assert.equal(commands[0].type, "open_run");
  assert.equal(commands[0].launchInput.provider, "ollama");
  assert.equal(commands[0].launchInput.model, "qwen3:8b");
  assert.equal(commands[0].launchInput.temperature, 0.3, "temperature keeps its existing fallback");
  const { createDirectorProductionOptions } = require("../../../dist/app/director/productionComposition");
  const contract = createDirectorProductionOptions().contractFactory({
    runId: "run-1", novelId: "director-book-confirmation-1", driver: "auto", stepIdsInScope: null,
    launchInput: commands[0].launchInput,
  });
  assert.equal(contract.modelConfig.route, "ollama");
  assert.equal(contract.modelConfig.model, "qwen3:8b");
  assert.equal(contract.launchInput.model, "qwen3:8b");
});

test("entries without a captured identity still use the stored top selection", async () => {
  const { launchNewDirectorBook, commands } = loadNewBook({
    selected: { provider: "deepseek", model: "deepseek-flash", temperature: 0.5 },
  });
  await launchNewDirectorBook({ ...confirmInput }, "opening-task", "original_opening");
  assert.equal(commands[0].launchInput.provider, "deepseek");
  assert.equal(commands[0].launchInput.model, "deepseek-flash");
});
