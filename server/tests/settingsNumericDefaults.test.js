const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

const NUMERIC_ENV_KEYS = [
  "DATABASE_URL",
  "RAG_ENABLED",
  "RAG_CHUNK_SIZE",
  "RAG_CHUNK_OVERLAP",
  "RAG_VECTOR_CANDIDATES",
  "RAG_KEYWORD_CANDIDATES",
  "RAG_FINAL_TOP_K",
  "EMBEDDING_BATCH_SIZE",
  "RAG_EMBEDDING_TIMEOUT_MS",
  "RAG_EMBEDDING_MAX_RETRIES",
  "RAG_RETRIEVAL_TRACE_SAMPLE_RATE",
  "LLM_REQUEST_TIMEOUT_MS",
  "STYLE_EXTRACTION_LLM_TIMEOUT_MS",
  "QDRANT_COLLECTION",
];

const scenarioScript = String.raw`
const path = require("node:path");

async function main() {
  const repoRoot = process.cwd();
  const records = JSON.parse(process.env.S1_SETTING_RECORDS_JSON || "[]");
  const counters = {
    appSettingWrites: 0,
    transactions: 0,
    indexCreates: 0,
  };

  global.prisma = {
    appSetting: {
      findMany: async ({ where }) => {
        const allowedKeys = new Set(where.key.in);
        return records
          .filter((record) => allowedKeys.has(record.key))
          .map((record) => ({ ...record }));
      },
      findUnique: async ({ where }) => records.find((record) => record.key === where.key) ?? null,
      upsert: async () => {
        counters.appSettingWrites += 1;
        return {};
      },
    },
    knowledgeChunk: { findFirst: async () => null },
    knowledgeDocument: { findFirst: async () => null },
    ragIndexJob: {
      findFirst: async () => null,
      create: async () => {
        counters.indexCreates += 1;
        return {};
      },
    },
    $transaction: async () => {
      counters.transactions += 1;
      return [];
    },
  };

  const { ragConfig } = require(path.join(repoRoot, "server", "dist", "config", "rag.js"));
  const initialEnabled = ragConfig.enabled;
  const { getRagEmbeddingSettings } = require(path.join(
    repoRoot,
    "server",
    "dist",
    "services",
    "settings",
    "RagSettingsService.js",
  ));
  const { getRagRuntimeSettings } = require(path.join(
    repoRoot,
    "server",
    "dist",
    "services",
    "settings",
    "RagRuntimeSettingsService.js",
  ));
  const { getStyleEngineRuntimeSettings } = require(path.join(
    repoRoot,
    "server",
    "dist",
    "services",
    "settings",
    "StyleEngineRuntimeSettingsService.js",
  ));

  const embedding = await getRagEmbeddingSettings();
  const runtime = await getRagRuntimeSettings();
  const style = await getStyleEngineRuntimeSettings();

  console.log(JSON.stringify({
    config: {
      enabled: ragConfig.enabled,
      chunkSize: ragConfig.chunkSize,
      chunkOverlap: ragConfig.chunkOverlap,
      vectorCandidates: ragConfig.vectorCandidates,
      keywordCandidates: ragConfig.keywordCandidates,
      finalTopK: ragConfig.finalTopK,
      embeddingBatchSize: ragConfig.embeddingBatchSize,
      embeddingTimeoutMs: ragConfig.embeddingTimeoutMs,
      embeddingMaxRetries: ragConfig.embeddingMaxRetries,
      retrievalTraceSampleRate: ragConfig.retrievalTraceSampleRate,
    },
    initialEnabled,
    embedding,
    runtime,
    style,
    records,
    counters,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

function runScenario({ envOverrides = {}, records = [] } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-s1-01-"));
  const databasePath = path.join(tempDir, "settings.db");
  const env = { ...process.env };
  for (const key of NUMERIC_ENV_KEYS) {
    delete env[key];
  }
  Object.assign(env, envOverrides, {
    DATABASE_URL: `file:${databasePath}`,
    S1_SETTING_RECORDS_JSON: JSON.stringify(records),
  });

  try {
    const result = childProcess.spawnSync(process.execPath, ["-e", scenarioScript], {
      cwd: repoRoot,
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim());
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertReadOnly(result, expectedRecords) {
  assert.deepEqual(result.records, expectedRecords);
  assert.deepEqual(result.counters, {
    appSettingWrites: 0,
    transactions: 0,
    indexCreates: 0,
  });
  assert.equal(result.config.enabled, result.initialEnabled);
}

function assertRecommendedDefaults(result) {
  assert.equal(result.runtime.chunkSize, 800);
  assert.equal(result.runtime.chunkOverlap, 120);
  assert.equal(result.runtime.vectorCandidates, 40);
  assert.equal(result.runtime.keywordCandidates, 40);
  assert.equal(result.runtime.finalTopK, 8);
  assert.equal(result.embedding.embeddingBatchSize, 64);
  assert.equal(result.embedding.embeddingTimeoutMs, 30_000);
  assert.equal(result.embedding.embeddingMaxRetries, 2);
  assert.equal(result.config.retrievalTraceSampleRate, 1);
  assert.equal(result.style.styleExtractionTimeoutMs, 600_000);
}

test("unconfigured numeric settings use the declared recommendations without writes", () => {
  const result = runScenario();

  assertRecommendedDefaults(result);
  assertReadOnly(result, []);
});

test("blank, null, and malformed env or database values use declared defaults", () => {
  const records = [
    { key: "rag.enabled", value: "   " },
    { key: "rag.chunkSize", value: " " },
    { key: "rag.chunkOverlap", value: "" },
    { key: "rag.vectorCandidates", value: "not-a-number" },
    { key: "rag.keywordCandidates", value: null },
    { key: "rag.finalTopK", value: "\t" },
    { key: "rag.embeddingBatchSize", value: "" },
    { key: "rag.embeddingTimeoutMs", value: "bad" },
    { key: "rag.embeddingMaxRetries", value: null },
    { key: "styleEngine.styleExtractionTimeoutMs", value: "  " },
  ];
  const result = runScenario({
    envOverrides: {
      RAG_ENABLED: " ",
      RAG_CHUNK_SIZE: " ",
      RAG_CHUNK_OVERLAP: "",
      RAG_VECTOR_CANDIDATES: "bad",
      RAG_KEYWORD_CANDIDATES: "\t",
      RAG_FINAL_TOP_K: "NaN",
      EMBEDDING_BATCH_SIZE: " ",
      RAG_EMBEDDING_TIMEOUT_MS: "bad",
      RAG_EMBEDDING_MAX_RETRIES: "\t",
      RAG_RETRIEVAL_TRACE_SAMPLE_RATE: " ",
      LLM_REQUEST_TIMEOUT_MS: "",
      STYLE_EXTRACTION_LLM_TIMEOUT_MS: "bad",
    },
    records,
  });

  assertRecommendedDefaults(result);
  assertReadOnly(result, records);
});

test("blank database values preserve the effective env defaults and a paused RAG state", () => {
  const records = [
    { key: "rag.enabled", value: "   " },
    { key: "rag.chunkSize", value: "" },
    { key: "rag.chunkOverlap", value: "\t" },
    { key: "rag.embeddingBatchSize", value: " " },
    { key: "rag.embeddingMaxRetries", value: null },
    { key: "styleEngine.styleExtractionTimeoutMs", value: "" },
  ];
  const result = runScenario({
    envOverrides: {
      RAG_ENABLED: "false",
      RAG_CHUNK_SIZE: "777",
      RAG_CHUNK_OVERLAP: "7",
      EMBEDDING_BATCH_SIZE: "17",
      RAG_EMBEDDING_MAX_RETRIES: "0",
      STYLE_EXTRACTION_LLM_TIMEOUT_MS: "720000",
    },
    records,
  });

  assert.equal(result.runtime.enabled, false);
  assert.equal(result.runtime.chunkSize, 777);
  assert.equal(result.runtime.chunkOverlap, 7);
  assert.equal(result.embedding.embeddingBatchSize, 17);
  assert.equal(result.embedding.embeddingMaxRetries, 0);
  assert.equal(result.style.styleExtractionTimeoutMs, 720_000);
  assertReadOnly(result, records);
});

test("legal low env values and allowed zero values remain unchanged", () => {
  const result = runScenario({
    envOverrides: {
      RAG_CHUNK_SIZE: "200",
      RAG_CHUNK_OVERLAP: "0",
      RAG_VECTOR_CANDIDATES: "1",
      RAG_KEYWORD_CANDIDATES: "1",
      RAG_FINAL_TOP_K: "1",
      EMBEDDING_BATCH_SIZE: "1",
      RAG_EMBEDDING_TIMEOUT_MS: "5000",
      RAG_EMBEDDING_MAX_RETRIES: "0",
      RAG_RETRIEVAL_TRACE_SAMPLE_RATE: "0",
      STYLE_EXTRACTION_LLM_TIMEOUT_MS: "180000",
    },
  });

  assert.equal(result.runtime.chunkSize, 200);
  assert.equal(result.runtime.chunkOverlap, 0);
  assert.equal(result.runtime.vectorCandidates, 1);
  assert.equal(result.runtime.keywordCandidates, 1);
  assert.equal(result.runtime.finalTopK, 1);
  assert.equal(result.embedding.embeddingBatchSize, 1);
  assert.equal(result.embedding.embeddingTimeoutMs, 5_000);
  assert.equal(result.embedding.embeddingMaxRetries, 0);
  assert.equal(result.config.retrievalTraceSampleRate, 0);
  assert.equal(result.style.styleExtractionTimeoutMs, 180_000);
  assertReadOnly(result, []);
});

test("saved legal low values override defaults without being rewritten", () => {
  const records = [
    { key: "rag.chunkSize", value: "200" },
    { key: "rag.chunkOverlap", value: "0" },
    { key: "rag.vectorCandidates", value: "1" },
    { key: "rag.keywordCandidates", value: "1" },
    { key: "rag.finalTopK", value: "1" },
    { key: "rag.embeddingBatchSize", value: "1" },
    { key: "rag.embeddingTimeoutMs", value: "5000" },
    { key: "rag.embeddingMaxRetries", value: "0" },
    { key: "styleEngine.styleExtractionTimeoutMs", value: "180000" },
  ];
  const result = runScenario({ records });

  assert.equal(result.runtime.chunkSize, 200);
  assert.equal(result.runtime.chunkOverlap, 0);
  assert.equal(result.runtime.vectorCandidates, 1);
  assert.equal(result.runtime.keywordCandidates, 1);
  assert.equal(result.runtime.finalTopK, 1);
  assert.equal(result.embedding.embeddingBatchSize, 1);
  assert.equal(result.embedding.embeddingTimeoutMs, 5_000);
  assert.equal(result.embedding.embeddingMaxRetries, 0);
  assert.equal(result.style.styleExtractionTimeoutMs, 180_000);
  assertReadOnly(result, records);
});

test("finite out-of-range values keep the existing clamp behavior", () => {
  const result = runScenario({
    envOverrides: {
      RAG_CHUNK_SIZE: "100",
      RAG_CHUNK_OVERLAP: "-1",
      RAG_VECTOR_CANDIDATES: "999",
      RAG_KEYWORD_CANDIDATES: "999",
      RAG_FINAL_TOP_K: "999",
      EMBEDDING_BATCH_SIZE: "999",
      RAG_EMBEDDING_TIMEOUT_MS: "1",
      RAG_EMBEDDING_MAX_RETRIES: "9",
      RAG_RETRIEVAL_TRACE_SAMPLE_RATE: "2",
      STYLE_EXTRACTION_LLM_TIMEOUT_MS: "1",
    },
  });

  assert.equal(result.runtime.chunkSize, 200);
  assert.equal(result.runtime.chunkOverlap, 0);
  assert.equal(result.runtime.vectorCandidates, 200);
  assert.equal(result.runtime.keywordCandidates, 200);
  assert.equal(result.runtime.finalTopK, 50);
  assert.equal(result.embedding.embeddingBatchSize, 256);
  assert.equal(result.embedding.embeddingTimeoutMs, 5_000);
  assert.equal(result.embedding.embeddingMaxRetries, 8);
  assert.equal(result.config.retrievalTraceSampleRate, 1);
  assert.equal(result.style.styleExtractionTimeoutMs, 180_000);
  assertReadOnly(result, []);
});

test("saved finite out-of-range values are clamped without rewriting the records", () => {
  const records = [
    { key: "rag.chunkSize", value: "100" },
    { key: "rag.chunkOverlap", value: "-1" },
    { key: "rag.vectorCandidates", value: "999" },
    { key: "rag.keywordCandidates", value: "999" },
    { key: "rag.finalTopK", value: "999" },
    { key: "rag.embeddingBatchSize", value: "999" },
    { key: "rag.embeddingTimeoutMs", value: "1" },
    { key: "rag.embeddingMaxRetries", value: "9" },
    { key: "styleEngine.styleExtractionTimeoutMs", value: "1" },
  ];
  const result = runScenario({ records });

  assert.equal(result.runtime.chunkSize, 200);
  assert.equal(result.runtime.chunkOverlap, 0);
  assert.equal(result.runtime.vectorCandidates, 200);
  assert.equal(result.runtime.keywordCandidates, 200);
  assert.equal(result.runtime.finalTopK, 50);
  assert.equal(result.embedding.embeddingBatchSize, 256);
  assert.equal(result.embedding.embeddingTimeoutMs, 5_000);
  assert.equal(result.embedding.embeddingMaxRetries, 8);
  assert.equal(result.style.styleExtractionTimeoutMs, 180_000);
  assertReadOnly(result, records);
});
