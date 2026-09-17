import { createHmac, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveAppDataRoot } from "../../../runtime/appPaths";

/** Never persist this payload or expose it through the module facade. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export class ConfigurationFingerprint {
  constructor(private readonly directory = path.join(resolveAppDataRoot(), "diagnostics")) {}

  private async loadKey(): Promise<Buffer> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700).catch(() => undefined);
    const filename = path.join(this.directory, "fingerprint.key");
    try {
      await writeFile(filename, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const key = await readFile(filename);
    if (key.length !== 32) throw new Error("诊断指纹密钥不可用，请检查本机应用数据目录。");
    // Windows may not implement POSIX permissions; never emit paths or key bytes.
    await chmod(filename, 0o600).catch(() => undefined);
    return key;
  }

  async create(configuration: unknown): Promise<string> {
    const key = await this.loadKey();
    return `hmac-v1:${createHmac("sha256", key).update(JSON.stringify(canonicalize(configuration))).digest("hex")}`;
  }
}
