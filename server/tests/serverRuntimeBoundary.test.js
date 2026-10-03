const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp, resolveServerStartOptions } = require("../dist/app.js");

function withServerEnv(values, run) {
  const keys = ["ALLOW_LAN", "HOST", "PORT", "CORS_ORIGIN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return run();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("Release 1 server defaults to IPv4 loopback with LAN disabled", () => {
  withServerEnv({}, () => {
    assert.deepEqual(resolveServerStartOptions(), {
      host: "127.0.0.1",
      port: 3000,
      allowLan: false,
    });
  });
});

test("Release 1 accepts explicit loopback hosts and ports", () => {
  withServerEnv({ HOST: "::1", PORT: "43123", ALLOW_LAN: "false" }, () => {
    assert.deepEqual(resolveServerStartOptions(), {
      host: "::1",
      port: 43123,
      allowLan: false,
    });
  });
});

test("Release 1 rejects ALLOW_LAN before startup side effects", () => {
  withServerEnv({ ALLOW_LAN: "true" }, () => {
    assert.throws(
      () => resolveServerStartOptions(),
      /Release 1 only supports loopback access/,
    );
  });
});

test("Release 1 rejects wildcard and private-network bind hosts", () => {
  for (const host of ["0.0.0.0", "::", "192.168.1.20"]) {
    withServerEnv({ HOST: host, ALLOW_LAN: "false" }, () => {
      assert.throws(
        () => resolveServerStartOptions(),
        /Release 1 only supports loopback access/,
      );
    });
  }
});

test("Release 1 rejects non-loopback CORS origins", () => {
  for (const origin of ["http://192.168.1.20:5173", "https://novel.example.com"]) {
    withServerEnv({ CORS_ORIGIN: origin }, () => {
      assert.throws(
        () => resolveServerStartOptions(),
        /CORS_ORIGIN must stay on loopback/,
      );
    });
  }
});

test("Release 1 rejects non-loopback CORS when createApp is reused directly", () => {
  withServerEnv({ CORS_ORIGIN: "https://novel.example.com" }, () => {
    assert.throws(
      () => createApp(),
      /CORS_ORIGIN must stay on loopback/,
    );
  });
});
