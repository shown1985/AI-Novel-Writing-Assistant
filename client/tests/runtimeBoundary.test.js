import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "vite";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Release 1 Vite server binds only to IPv4 loopback", async () => {
  const config = await resolveConfig(
    { root: clientRoot, configFile: path.join(clientRoot, "vite.config.ts") },
    "serve",
  );

  assert.equal(config.server.host, "127.0.0.1");
});
