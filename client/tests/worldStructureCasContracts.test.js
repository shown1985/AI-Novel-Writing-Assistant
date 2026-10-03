import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorldStructureSaveIntent,
  isCurrentWorldStructureRead,
  isCurrentWorldStructureResponse,
  shouldAdoptWorldStructurePayload,
  structurePayloadKey,
  worldStructurePayloadKeyFromPersistedWorld,
  shouldRetryWorldStructureSave,
  worldStructureSaveGuardForError,
} from "../src/pages/worlds/worldStructureSave.ts";

function structure(summary) {
  return {
    profile: { summary, identity: "边境世界", tone: "克制", themes: [], coreConflict: "" },
    rules: { summary: "", axioms: [], taboo: [], sharedConsequences: [] },
    factions: [],
    forces: [],
    locations: [],
    relations: { forceRelations: [], locationControls: [], locationConnections: [] },
    metadata: { schemaVersion: 1 },
  };
}

const bindingSupport = {
  recommendedEntryPoints: [],
  highPressureForces: [],
  suggestedLocationClusters: [],
  compatibleConflicts: [],
  forbiddenCombinations: [],
};

function saveInput(worldId, summary, currentContentRevision) {
  return {
    worldId,
    structure: structure(summary),
    bindingSupport,
    currentContentRevision,
  };
}

test("a retry reuses the original operation id, payload intent, and expected revision", () => {
  const generatedIds = ["structure-op-1", "structure-op-2"];
  const generateOperationId = () => generatedIds.shift();
  const first = createWorldStructureSaveIntent(saveInput("world-a", "初稿", 7), null, generateOperationId);
  const retry = createWorldStructureSaveIntent(saveInput("world-a", "初稿", 8), first.pending, generateOperationId);

  assert.equal(retry.payload.operationId, "structure-op-1");
  assert.equal(retry.payload.expectedContentRevision, 7);
  assert.deepEqual(retry.payload.structure, first.payload.structure);
  assert.equal(generatedIds.length, 1, "同一保存意图不能生成第二个 operationId");

  const changed = createWorldStructureSaveIntent(saveInput("world-a", "修改后的草稿", 8), retry.pending, generateOperationId);
  assert.equal(changed.payload.operationId, "structure-op-2");
  assert.equal(changed.payload.expectedContentRevision, 8);
});

test("409 and unknown outcomes preserve the draft while network/unknown retry once", () => {
  assert.equal(worldStructureSaveGuardForError({ status: 409 }), "conflict");
  assert.equal(worldStructureSaveGuardForError({ status: 503, details: { error: "COMMIT_RESULT_UNKNOWN" } }), "unknown");
  assert.equal(worldStructureSaveGuardForError({ status: 428 }), "read_required");
  assert.equal(shouldRetryWorldStructureSave({ status: undefined }, 0), true);
  assert.equal(shouldRetryWorldStructureSave({ status: 503, details: { error: "COMMIT_RESULT_UNKNOWN" } }, 0), true);
  assert.equal(shouldRetryWorldStructureSave({ status: 409 }, 0), false);
  assert.equal(shouldRetryWorldStructureSave({ status: undefined }, 1), false);
});

test("same-world refresh does not replace a draft after conflict or unknown result", () => {
  const initial = structurePayloadKey(structure("初始"), bindingSupport);
  const serverChanged = structurePayloadKey(structure("其他作者已保存"), bindingSupport);
  assert.equal(
    worldStructurePayloadKeyFromPersistedWorld({
      structureJson: JSON.stringify(structure("其他作者已保存")),
      bindingSupportJson: JSON.stringify(bindingSupport),
    }),
    serverChanged,
  );

  for (const saveGuard of ["conflict", "unknown", "read_required"]) {
    assert.equal(
      shouldAdoptWorldStructurePayload({
        syncedWorldId: "world-a",
        incomingWorldId: "world-a",
        incomingPayloadKey: initial,
        draftPayloadKey: initial,
        syncedPayloadKey: initial,
        saveGuard,
      }),
      false,
      `guard=${saveGuard} 时即使草稿未变也不能被后台刷新覆盖`,
    );
  }

  assert.equal(
    shouldAdoptWorldStructurePayload({
      syncedWorldId: "world-a",
      incomingWorldId: "world-a",
      incomingPayloadKey: initial,
      draftPayloadKey: initial,
      syncedPayloadKey: initial,
      saveGuard: "none",
    }),
    true,
  );
  assert.equal(
    shouldAdoptWorldStructurePayload({
      syncedWorldId: "world-a",
      incomingWorldId: "world-a",
      incomingPayloadKey: initial,
      draftPayloadKey: initial,
      syncedPayloadKey: initial,
      saveGuard: "none",
      replayServerPayloadKey: serverChanged,
      replaySyncConsumed: false,
    }),
    false,
    "replay 读取到旧 A 时不能把旧 initialPayload 当作服务器事实",
  );
  assert.equal(
    shouldAdoptWorldStructurePayload({
      syncedWorldId: "world-a",
      incomingWorldId: "world-a",
      incomingPayloadKey: serverChanged,
      draftPayloadKey: initial,
      syncedPayloadKey: initial,
      saveGuard: "none",
      replayServerPayloadKey: serverChanged,
      replaySyncConsumed: false,
    }),
    true,
    "replay 只有读到当前服务器 B 才能采用",
  );
  assert.equal(
    shouldAdoptWorldStructurePayload({
      syncedWorldId: "world-a",
      incomingWorldId: "world-a",
      incomingPayloadKey: serverChanged,
      draftPayloadKey: structurePayloadKey(structure("作者继续编辑"), bindingSupport),
      syncedPayloadKey: serverChanged,
      saveGuard: "replayed",
      replayServerPayloadKey: serverChanged,
      replaySyncConsumed: true,
    }),
    false,
    "读取 B 后再次编辑，后台 refresh 不能覆盖新草稿",
  );
  assert.equal(
    shouldAdoptWorldStructurePayload({
      syncedWorldId: "world-a",
      incomingWorldId: "world-a",
      incomingPayloadKey: initial,
      draftPayloadKey: initial,
      syncedPayloadKey: initial,
      saveGuard: "none",
      explicitReadPayloadKey: serverChanged,
      explicitReadConsumed: false,
    }),
    false,
    "显式重读完成前仍不能采用旧缓存",
  );
  assert.equal(
    shouldAdoptWorldStructurePayload({
      syncedWorldId: "world-a",
      incomingWorldId: "world-a",
      incomingPayloadKey: serverChanged,
      draftPayloadKey: initial,
      syncedPayloadKey: initial,
      saveGuard: "none",
      explicitReadPayloadKey: serverChanged,
      explicitReadConsumed: false,
    }),
    true,
    "显式重读允许作者确认后替换草稿",
  );
  assert.equal(serverChanged === initial, false);
});

test("a world switch adopts the new world, while a late response from the old world is ignored", () => {
  const initial = structurePayloadKey(structure("初始"), bindingSupport);
  const newWorld = structurePayloadKey(structure("新世界"), bindingSupport);
  assert.equal(
    shouldAdoptWorldStructurePayload({
      syncedWorldId: "world-a",
      incomingWorldId: "world-b",
      incomingPayloadKey: newWorld,
      draftPayloadKey: initial,
      syncedPayloadKey: initial,
      saveGuard: "conflict",
    }),
    true,
  );
  assert.equal(isCurrentWorldStructureResponse("world-b", "world-a"), false);
  assert.equal(isCurrentWorldStructureResponse("world-b", "world-b"), true);
  assert.notEqual(newWorld, initial);
  assert.equal(
    isCurrentWorldStructureRead({
      currentWorldId: "world-b",
      requestedWorldId: "world-a",
      currentRequestToken: 2,
      requestToken: 1,
    }),
    false,
    "切 world 后旧 reload 回包不得清理新 world 状态",
  );
  assert.equal(
    isCurrentWorldStructureRead({
      currentWorldId: "world-b",
      requestedWorldId: "world-b",
      currentRequestToken: 3,
      requestToken: 3,
    }),
    true,
  );
  assert.equal(
    isCurrentWorldStructureRead({
      currentWorldId: "world-b",
      requestedWorldId: "world-b",
      currentRequestToken: 4,
      requestToken: 3,
    }),
    false,
    "同一 world 的旧 reload 也不得清理更新后的状态",
  );
});
