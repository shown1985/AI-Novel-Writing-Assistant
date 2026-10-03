export type SettingsReadinessPolicyItem = {
  key: "model" | "routes" | "rag" | "style";
  state: string;
};

export type SettingsReadinessDecision = {
  canStart: boolean;
  primaryAction: {
    label: string;
    to: string;
  };
};

export function resolveSettingsReadinessDecision(
  items: SettingsReadinessPolicyItem[],
): SettingsReadinessDecision {
  const modelItem = items.find((item) => item.key === "model");
  const routesItem = items.find((item) => item.key === "routes");
  const hasModel = modelItem?.state === "ready";
  const routeFailed = routesItem?.state === "failed";
  const canStart = hasModel && !routeFailed;

  if (!hasModel) {
    return {
      canStart,
      primaryAction: { label: "配置正文模型", to: "/settings/models" },
    };
  }
  if (routeFailed) {
    return {
      canStart,
      primaryAction: { label: "查看模型路由", to: "/settings/model-routes" },
    };
  }
  return {
    canStart,
    primaryAction: { label: "开始创建小说", to: "/novels/create" },
  };
}
