import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleAlert, CircleDashed, Clock3, Loader2 } from "lucide-react";
import type {
  APIKeyStatus,
  ModelRoutesResponse,
  RagSettingsStatus,
  StyleEngineRuntimeSettingsStatus,
} from "@/api/settings";
import type { DiagnosticReadinessReport } from "@ai-novel/shared/types/diagnostics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import {
  resolveSettingsReadinessDecision,
  resolveDiagnosticUiState,
  type DiagnosticUiState,
} from "../diagnostics";

type SettingsReadinessState = DiagnosticUiState | "ready" | "warning" | "optional";

export type SettingsReadinessItem = {
  key: "model" | "routes" | "rag" | "style";
  title: string;
  description: string;
  state: SettingsReadinessState;
};

function getReadinessIcon(state: SettingsReadinessItem["state"]) {
  if (state === "ready" || state === "healthy") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }
  if (state === "loading" || state === "pending") {
    return <Loader2 className="h-4 w-4 animate-spin text-amber-600" />;
  }
  if (state === "optional" || state === "not_checked" || state === "stale") {
    return <CircleDashed className="h-4 w-4 text-sky-600" />;
  }
  if (state === "error") {
    return <Clock3 className="h-4 w-4 text-amber-600" />;
  }
  return <CircleAlert className="h-4 w-4 text-amber-600" />;
}

function getReadinessBadge(state: SettingsReadinessItem["state"]) {
  switch (state) {
    case "ready":
      return "可用";
    case "loading":
      return "读取中";
    case "pending":
      return "检测中";
    case "optional":
      return "可选增强";
    case "not_checked":
      return "未检测";
    case "stale":
      return "配置已变";
    case "failed":
      return "检测失败";
    case "error":
      return "读取失败";
    case "healthy":
      return "可用";
    case "warning":
      return "需要处理";
  }
}

export function buildSettingsReadinessItems(input: {
  providers: APIKeyStatus[];
  ragSettings?: RagSettingsStatus | null;
  styleSettings?: StyleEngineRuntimeSettingsStatus | null;
  modelRoutes?: ModelRoutesResponse | null;
  modelRouteReadiness?: DiagnosticReadinessReport | null;
  isModelRoutesLoading: boolean;
  isModelRoutesError: boolean;
  isStyleSettingsLoaded: boolean;
}): SettingsReadinessItem[] {
  const {
    providers,
    ragSettings,
    styleSettings,
    modelRoutes,
    modelRouteReadiness,
    isModelRoutesLoading,
    isModelRoutesError,
    isStyleSettingsLoaded,
  } = input;
  const runnableProviders = providers.filter((item) => item.isConfigured && item.isActive && item.currentModel);
  const currentRagProvider = ragSettings?.providers.find((item) => item.provider === ragSettings.embeddingProvider);
  const routeState = resolveDiagnosticUiState({
    report: modelRouteReadiness,
    isLoading: isModelRoutesLoading,
    isError: isModelRoutesError,
  });
  const routeCount = modelRoutes?.taskTypes.length ?? 0;
  const styleTimeout = styleSettings?.styleExtractionTimeoutMs;
  const styleReady = Boolean(styleSettings)
    && typeof styleTimeout === "number"
    && styleTimeout >= styleSettings!.minStyleExtractionTimeoutMs
    && styleTimeout <= styleSettings!.maxStyleExtractionTimeoutMs;

  return [
    {
      key: "model",
      title: "正文模型",
      state: runnableProviders.length > 0 ? "ready" : "warning",
      description: runnableProviders.length > 0
        ? `已可使用 ${runnableProviders[0].name} 进行正文与规划生成。`
        : "先配置一个可用模型，就可以开始开书和生成章节。",
    },
    {
      key: "routes",
      title: "模型路由",
      state: routeState,
      description: routeState === "healthy"
        ? `${routeCount} 类创作任务已有最近一次可用检测记录。`
        : routeState === "failed"
          ? "最近一次模型路由检测未通过，请到模型路由页查看具体任务。"
          : routeState === "stale"
            ? "模型配置已变化；不影响按当前配置创作，可按需重新检测。"
            : routeState === "not_checked"
              ? "尚未检测模型路由；基础配置完整时仍可开始创作。"
              : routeState === "pending"
                ? "正在检测模型路由，页面会自动读取完成结果。"
                : routeState === "error"
                  ? "暂时无法读取检测记录；这不代表模型配置不可用。"
                  : "正在读取已有的模型路由检测记录。",
    },
    {
      key: "rag",
      title: "知识库增强",
      state: ragSettings?.enabled && currentRagProvider?.isConfigured && currentRagProvider?.isActive ? "ready" : "optional",
      description: ragSettings?.enabled && currentRagProvider?.isConfigured && currentRagProvider?.isActive
        ? "知识库检索已启用，可帮助长篇写作保持资料和设定连续。"
        : "不配置也可以开始创作；启用后会增强设定、资料和上下文召回。",
    },
    {
      key: "style",
      title: "写法引擎",
      state: !isStyleSettingsLoaded ? "loading" : styleReady ? "ready" : "optional",
      description: styleReady
        ? "写法提取等待时间在可用范围内，可用于学习样本文风。"
        : "不影响先开始创作；需要提取样本文风时，请确认等待时间在可用范围内。",
    },
  ];
}

export default function SettingsReadinessCard(props: {
  items: SettingsReadinessItem[];
}) {
  const { items } = props;
  const { canStart, primaryAction } = resolveSettingsReadinessDecision(items);

  return (
    <Card className="min-w-0 overflow-hidden border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle>创作可用性检查</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            先确认开始写小说必需的模型和路由是否可用；知识库属于增强项，可以稍后再补。
          </CardDescription>
        </div>
        <Button asChild className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}>
          <Link to={primaryAction.to}>
            {primaryAction.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.key} className="min-w-0 rounded-md border bg-background/80 p-3">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {getReadinessIcon(item.state)}
                  <div className="min-w-0 font-medium">{item.title}</div>
                </div>
                <Badge variant={item.state === "ready" || item.state === "healthy" ? "default" : "outline"}>
                  {getReadinessBadge(item.state)}
                </Badge>
              </div>
              <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                {item.description}
              </div>
            </div>
          ))}
        </div>
        <div className={`text-sm ${canStart ? "text-emerald-700" : "text-muted-foreground"} ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          {canStart
            ? "基础创作链路已经可用，可以开始创建或继续推进小说。"
            : "先处理标记为“需要处理”的项目，完成后再进入自动导演或章节生产会更稳。"}
        </div>
      </CardContent>
    </Card>
  );
}
