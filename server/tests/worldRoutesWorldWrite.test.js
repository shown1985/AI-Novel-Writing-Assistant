const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { Router } = require("express");

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "world-route-cas-"));
process.env.DATABASE_URL = `file:${path.join(fixtureDir, "fixture.db")}`;
process.env.WORLD_WIZARD_ENABLED = "true";

const { registerCoreWorldRoutes } = require("../dist/modules/setup/world/http/worldCoreRoutes.js");
const { registerStructureWorldRoutes } = require("../dist/modules/setup/world/http/worldStructureRoutes.js");
const { worldService } = require("../dist/modules/setup/world/http/worldHttpContext.js");
const { WorldMaintenanceError } = require("../dist/services/world/maintenance/index.js");

function createApp() {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerCoreWorldRoutes(router);
  registerStructureWorldRoutes(router);
  app.use("/worlds", router);
  return app;
}

async function requestJson(app, method, route, body) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const address = server.address();
    const payload = JSON.stringify(body);
    return await new Promise((resolve, reject) => {
      const request = http.request({
        host: "127.0.0.1",
        port: address.port,
        path: route,
        method,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
      }, (response) => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { data += chunk; });
        response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
      });
      request.on("error", reject);
      request.end(payload);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("world write routes keep protection fields optional at parse time and map service 428/409", async () => {
  const originalUpdateWorld = worldService.updateWorld;
  const originalUpdateAxioms = worldService.updateAxioms;
  const seen = [];
  let coreError = new WorldMaintenanceError(428, "REVISION_REQUIRED", "世界保存需要当前版本。", {
    field: "expectedContentRevision",
  });
  let axiomsError = new WorldMaintenanceError(409, "OPERATION_ID_REUSED", "该操作标识已用于不同请求。");
  worldService.updateWorld = async (id, body) => {
    seen.push({ kind: "world", id, body });
    throw coreError;
  };
  worldService.updateAxioms = async (id, axioms, protection) => {
    seen.push({ kind: "axioms", id, axioms, protection });
    throw axiomsError;
  };

  try {
    const app = createApp();
    const missing = await requestJson(app, "PUT", "/worlds/world-route-fixture", { description: "缺保护字段" });
    assert.equal(missing.status, 428);
    assert.equal(missing.body.error, "REVISION_REQUIRED");
    assert.equal(seen[0].body.operationId, undefined);
    assert.equal(seen[0].body.expectedContentRevision, undefined);

    coreError = new WorldMaintenanceError(409, "CONTENT_REVISION_CONFLICT", "世界版本已变化。", {
      currentContentRevision: 8,
    });
    const conflict = await requestJson(app, "PUT", "/worlds/world-route-fixture", {
      description: "旧版本",
      operationId: "op-route-world",
      expectedContentRevision: 7,
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, "CONTENT_REVISION_CONFLICT");
    assert.equal(seen[1].body.operationId, "op-route-world");
    assert.equal(seen[1].body.expectedContentRevision, 7);

    const axiomsMissing = await requestJson(app, "PUT", "/worlds/world-route-fixture/axioms", { axioms: ["公理"] });
    assert.equal(axiomsMissing.status, 409);
    assert.equal(axiomsMissing.body.error, "OPERATION_ID_REUSED");
    assert.deepEqual(seen[2].protection, { operationId: undefined, expectedContentRevision: undefined });

    axiomsError = new WorldMaintenanceError(428, "REVISION_REQUIRED", "公理保存需要版本。", {
      field: "operationId",
    });
    const axiomsRequired = await requestJson(app, "PUT", "/worlds/world-route-fixture/axioms", {
      axioms: ["公理"],
      expectedContentRevision: 7,
    });
    assert.equal(axiomsRequired.status, 428);
    assert.equal(axiomsRequired.body.error, "REVISION_REQUIRED");
    assert.equal(seen[3].protection.operationId, undefined);
    assert.equal(seen[3].protection.expectedContentRevision, 7);
  } finally {
    worldService.updateWorld = originalUpdateWorld;
    worldService.updateAxioms = originalUpdateAxioms;
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
