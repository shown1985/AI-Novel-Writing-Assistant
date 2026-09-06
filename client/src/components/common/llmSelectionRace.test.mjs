import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const commonRoot = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFileSync(join(commonRoot, relativePath), "utf8");

test("global model selection waits for provider refresh before normalizing", () => {
  const selector = readSource("LLMSelector.tsx");
  const bootstrap = readSource("../layout/LLMSelectionBootstrap.tsx");
  const quickSetup = readSource("../onboarding/QuickSetupDialog.tsx");

  assert.match(selector, /if \(apiKeySettingsQuery\.isFetching\) \{\s*return;/);
  assert.match(bootstrap, /selectionQuery\.isFetching \|\| apiKeySettingsQuery\.isFetching/);

  const providerRefresh = quickSetup.indexOf(
    'queryClient.refetchQueries({ queryKey: queryKeys.settings.apiKeys, type: "active" })',
  );
  const selectionWrite = quickSetup.indexOf("llmStore.setSelection({", providerRefresh);
  assert.ok(providerRefresh >= 0, "quick setup must refresh provider metadata");
  assert.ok(selectionWrite > providerRefresh, "selection must be written after provider refresh");
});
