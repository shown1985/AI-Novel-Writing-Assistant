import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWorldAxiomsSavePayload,
  shouldResetWorldAxiomsOperation,
  shouldRetryWorldAxiomsSave,
} from "../src/pages/worlds/worldAxiomSave.ts";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readClientFile = (relativePath) => readFileSync(join(clientRoot, relativePath), "utf8");
const worldApi = readClientFile("src/api/world.ts");
const workspace = readClientFile("src/pages/worlds/WorldWorkspace.tsx");
const axiomsCard = readClientFile("src/pages/worlds/components/workspace/WorldAxiomsCard.tsx");

test("axioms save mock sends the current revision and reuses one operation id", async () => {
  const apiCalls = [];
  const updateWorldAxiomsMock = async (id, axioms, protection) => {
    apiCalls.push({ id, axioms, protection });
    return { success: true };
  };
  let generated = 0;
  const generateOperationId = () => `operation-${++generated}`;
  const first = createWorldAxiomsSavePayload(["规则 A"], 7, null, generateOperationId);
  await updateWorldAxiomsMock("world-a", first.axioms, first);
  const retry = createWorldAxiomsSavePayload(["规则 A"], 7, first.operationId, generateOperationId);
  await updateWorldAxiomsMock("world-a", retry.axioms, retry);

  assert.deepEqual(apiCalls.map((call) => call.protection), [
    { axioms: ["规则 A"], operationId: "operation-1", expectedContentRevision: 7 },
    { axioms: ["规则 A"], operationId: "operation-1", expectedContentRevision: 7 },
  ]);
  assert.equal(generated, 1, "网络重试不能生成第二个 operationId");
});

test("unknown/network responses retry once, while 409/428 reset the next save intent", () => {
  assert.equal(shouldRetryWorldAxiomsSave({ status: undefined }, 0), true);
  assert.equal(shouldRetryWorldAxiomsSave({ status: undefined }, 1), false);
  assert.equal(shouldRetryWorldAxiomsSave({ status: 503, details: { error: "COMMIT_RESULT_UNKNOWN" } }, 0), true);
  assert.equal(shouldRetryWorldAxiomsSave({ status: 409 }, 0), false);
  assert.equal(shouldResetWorldAxiomsOperation({ status: 409 }), true);
  assert.equal(shouldResetWorldAxiomsOperation({ status: 428 }), true);
  assert.equal(shouldResetWorldAxiomsOperation({ status: undefined }), false);
});

test("client wiring keeps drafts on conflict and isolates operation ids by world", () => {
  assert.match(worldApi, /axioms,\s*\.\.\.protection/);
  assert.match(workspace, /createWorldAxiomsSavePayload\(\s*axioms,\s*world\.contentRevision/s);
  assert.match(workspace, /axiomsOperationIdRef\.current = null/);
  assert.match(workspace, /shouldRetryWorldAxiomsSave/);
  assert.match(workspace, /shouldResetWorldAxiomsOperation/);
  assert.match(workspace, /payload\.worldId !== id/);
  assert.match(workspace, /axiomsOperationIdRef\.current !== payload\.operationId/);
  assert.match(workspace, /useEffect\(\(\) => \{\s*axiomsOperationIdRef\.current = null;\s*\}, \[id\]\)/s);
  assert.match(axiomsCard, /const \[draftAxioms, setDraftAxioms\]/);
  assert.match(axiomsCard, /onSave\(normalizedDrafts\)/);
  assert.doesNotMatch(axiomsCard, /onError|invalidateQueries/);
});
