// 开发环境私有种子：把宿主机 magpie 网关注册为自定义模型厂商，并设为默认模型选择。
// 仅在 AI_NOVEL_DEV_SEED_MAGPIE=true 时生效；值全部来自环境变量（server/.env，不入仓库），
// 因此本脚本可提交，密钥与地址不会打包或外发。幂等：重复执行只更新同一条记录。
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";

const PROVIDER_ID = "custom_magpie";

async function main(): Promise<void> {
  if (process.env.AI_NOVEL_DEV_SEED_MAGPIE !== "true") {
    return;
  }
  const baseURL = process.env.MAGPIE_BASE_URL?.trim();
  const apiKey = process.env.MAGPIE_API_KEY?.trim();
  const defaultModel = process.env.MAGPIE_DEFAULT_MODEL?.trim();
  if (!baseURL || !apiKey || !defaultModel) {
    console.log("[dev-seed] magpie 配置不完整，跳过种子。");
    return;
  }

  await prisma.aPIKey.upsert({
    where: { provider: PROVIDER_ID },
    update: {
      displayName: "Magpie (dev)",
      key: apiKey,
      baseURL,
      authMode: "bearer",
      isActive: true,
      model: defaultModel,
      availableModels: JSON.stringify([defaultModel]),
    },
    create: {
      id: randomUUID(),
      provider: PROVIDER_ID,
      displayName: "Magpie (dev)",
      key: apiKey,
      baseURL,
      authMode: "bearer",
      isActive: true,
      model: defaultModel,
      availableModels: JSON.stringify([defaultModel]),
    },
  });

  const selectionValue = JSON.stringify({
    provider: PROVIDER_ID,
    model: defaultModel,
    temperature: 0.7,
  });
  await prisma.appSetting.upsert({
    where: { key: "llm.currentSelection" },
    update: { value: selectionValue },
    create: { key: "llm.currentSelection", value: selectionValue },
  });

  console.log(`[dev-seed] magpie 已注册为开发默认厂商：${PROVIDER_ID} → ${defaultModel}`);
}

main()
  .catch((error) => {
    console.error("[dev-seed] magpie 种子写入失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
