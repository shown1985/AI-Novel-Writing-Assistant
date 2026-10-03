const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const diagnostics = require("../dist/modules/diagnostics/index.js");
const { ragServices } = require("../dist/services/rag/index.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("GET and POST /api/llm/model-routes/connectivity separate passive reads from explicit checks", async () => {
  const originalGet = diagnostics.getModelRouteReadiness;
  const originalCheck = diagnostics.checkModelRouteReadiness;
  let reads = 0;
  let checks = 0;
  const report = {
    diagnosticId: "diagnostic-1",
    scope: "model_routes",
    checkState: "healthy",
    checkedAt: new Date().toISOString(),
    configurationFingerprint: "hmac-v1:test",
    targets: [{
      targetId: "model-route:repair",
      targetKind: "model_route",
      taskType: "repair",
      provider: "deepseek",
      model: "deepseek-chat",
      checkState: "healthy",
      checkedAt: new Date().toISOString(),
      errorSummary: null,
      capabilities: [{
        capability: "plain",
        checkState: "healthy",
        latencyMs: 128,
        errorSummary: null,
        requestProtocol: "openai_compatible",
        structuredDetails: null,
      }, {
        capability: "structured",
        checkState: "healthy",
        latencyMs: 140,
        errorSummary: null,
        requestProtocol: "anthropic",
        structuredDetails: {
          strategy: "prompt_json",
          reasoningForcedOff: true,
          fallbackAvailable: true,
          fallbackUsed: false,
          errorCategory: null,
          nativeJsonObject: false,
          nativeJsonSchema: false,
          profileFamily: "custom_openai_compatible",
        },
      }],
      recommendation: {
        recommendationId: "compatibility:model-route:repair:1",
        requestProtocol: "anthropic",
        structuredResponseFormat: "prompt_json",
        reason: "请确认后再应用。",
      },
      revision: 1,
    }],
  };
  diagnostics.getModelRouteReadiness = async () => { reads += 1; return report; };
  diagnostics.checkModelRouteReadiness = async () => { checks += 1; return report; };

  const server = http.createServer(createApp());
  const port = await listen(server);
  try {
    const passiveResponse = await fetch(`http://127.0.0.1:${port}/api/llm/model-routes/connectivity`);
    assert.equal(passiveResponse.status, 200);
    const passivePayload = await passiveResponse.json();
    assert.equal(passivePayload.success, true);
    assert.equal(passivePayload.data.targets[0].taskType, "repair");
    assert.equal(reads, 1);
    assert.equal(checks, 0);

    const response = await fetch(`http://127.0.0.1:${port}/api/llm/model-routes/connectivity`, { method: "POST" });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.statuses[0].taskType, "repair");
    assert.equal(payload.data.statuses[0].ok, true);
    assert.equal(payload.data.statuses[0].requestProtocol, "openai_compatible");
    assert.equal(payload.data.statuses[0].plain.requestProtocol, "openai_compatible");
    assert.equal(payload.data.statuses[0].structured.requestProtocol, "anthropic");
    assert.equal(payload.data.statuses[0].structured.strategy, "prompt_json");
    assert.equal(payload.data.statuses[0].structured.reasoningForcedOff, true);
    assert.equal(payload.data.statuses[0].structured.fallbackAvailable, true);
    assert.equal(payload.data.statuses[0].structured.profileFamily, "custom_openai_compatible");
    assert.equal(reads, 1);
    assert.equal(checks, 1);
  } finally {
    diagnostics.getModelRouteReadiness = originalGet;
    diagnostics.checkModelRouteReadiness = originalCheck;
    await close(server);
  }
});

test("RAG readiness GET and legacy health projection stay passive while POST checks explicitly", async () => {
  const originalGet = diagnostics.getRagReadiness;
  const originalCheck = diagnostics.checkRagReadiness;
  const originalEmbeddingHealth = ragServices.embeddingService.healthCheck;
  const originalVectorHealth = ragServices.vectorStoreService.healthCheck;
  let reads = 0;
  let checks = 0;
  let transports = 0;
  const report = {
    diagnosticId: "rag-diagnostic-1",
    scope: "rag",
    checkState: "healthy",
    checkedAt: new Date().toISOString(),
    configurationFingerprint: "hmac-v1:rag-test",
    targets: [{
      targetId: "rag:embedding",
      targetKind: "rag_embedding",
      taskType: null,
      provider: "openai",
      model: "text-embedding-3-small",
      checkState: "healthy",
      checkedAt: new Date().toISOString(),
      errorSummary: null,
      capabilities: [],
      recommendation: null,
      revision: 0,
    }, {
      targetId: "rag:vector-store",
      targetKind: "rag_vector_store",
      taskType: null,
      provider: "qdrant",
      model: "ai_novel_chunks_v1",
      checkState: "healthy",
      checkedAt: new Date().toISOString(),
      errorSummary: null,
      capabilities: [],
      recommendation: null,
      revision: 0,
    }],
  };
  diagnostics.getRagReadiness = async () => { reads += 1; return report; };
  diagnostics.checkRagReadiness = async () => { checks += 1; return report; };
  ragServices.embeddingService.healthCheck = async () => { transports += 1; return { ok: true }; };
  ragServices.vectorStoreService.healthCheck = async () => { transports += 1; return { ok: true }; };

  const server = http.createServer(createApp());
  const port = await listen(server);
  try {
    const readinessResponse = await fetch(`http://127.0.0.1:${port}/api/rag/readiness`);
    assert.equal(readinessResponse.status, 200);
    assert.equal((await readinessResponse.json()).data.checkState, "healthy");
    const legacyResponse = await fetch(`http://127.0.0.1:${port}/api/rag/health`);
    assert.equal(legacyResponse.status, 200);
    const legacy = await legacyResponse.json();
    assert.equal(legacy.data.ok, true);
    assert.equal(legacy.data.checkState, "healthy");
    assert.equal(transports, 0);
    assert.equal(reads, 2);
    assert.equal(checks, 0);

    const checkResponse = await fetch(`http://127.0.0.1:${port}/api/rag/readiness`, { method: "POST" });
    assert.equal(checkResponse.status, 200);
    assert.equal((await checkResponse.json()).data.checkState, "healthy");
    assert.equal(checks, 1);
  } finally {
    diagnostics.getRagReadiness = originalGet;
    diagnostics.checkRagReadiness = originalCheck;
    ragServices.embeddingService.healthCheck = originalEmbeddingHealth;
    ragServices.vectorStoreService.healthCheck = originalVectorHealth;
    await close(server);
  }
});
