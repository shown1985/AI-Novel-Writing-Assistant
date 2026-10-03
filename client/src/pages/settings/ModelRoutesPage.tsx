import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CopyCheck, RefreshCw, Save } from "lucide-react";
import type { StructuredFallbackSettings } from "@/api/settings";
import {
  getAPIKeySettings,
  getModelRouteReadiness,
  getModelRoutes,
  getStructuredFallbackConfig,
  saveModelRoute,
  saveStructuredFallbackConfig,
  testModelRouteConnectivity,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import ModelRouteFields from "./ModelRouteFields";
import { MODEL_ROUTE_LABELS } from "./modelRouteLabels";
import {
  buildRouteSavePayload,
  getPreferredModel,
  getProviderDisplayName,
  isSameRouteDraft,
  parseStructuredRetryCount,
  type RouteDraft,
  type RouteSavePayload,
  type StructuredFallbackDraft,
} from "./modelRoutes.utils";
import {
  createDiagnosticReadQueryPolicy,
  createExplicitDiagnosticCheckController,
  formatDiagnosticTargetStatus,
  getDiagnosticStateLabel,
  refreshDiagnosticReadinessAfterCheck,
  resetDiagnosticReadinessAfterConfigurationChange,
  resolveDiagnosticTargetState,
  resolveDiagnosticUiState,
  summarizeDiagnosticTargets,
  type DiagnosticUiState,
} from "./diagnostics";
import type { ModelRouteTaskType } from "@ai-novel/shared/types/novel";

function RouteStatusDot({ state }: { state: DiagnosticUiState }) {
  const colorClass = state === "healthy"
    ? "bg-emerald-500"
    : state === "failed"
      ? "bg-red-500"
      : state === "pending" || state === "loading"
        ? "bg-amber-400"
        : state === "error"
          ? "bg-orange-500"
          : state === "stale"
            ? "bg-sky-400"
            : "bg-slate-300";

  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorClass}`} aria-hidden="true" />;
}

export default function ModelRoutesPage() {
  const queryClient = useQueryClient();
  const [actionResult, setActionResult] = useState("");
  const [diagnosticNotice, setDiagnosticNotice] = useState("");
  const [routeDrafts, setRouteDrafts] = useState<Record<string, RouteDraft>>({});
  const [bulkDraft, setBulkDraft] = useState<RouteDraft | null>(null);
  const [structuredFallbackDraft, setStructuredFallbackDraft] = useState<StructuredFallbackDraft | null>(null);
  const checkModelRoutesController = useRef(
    createExplicitDiagnosticCheckController(testModelRouteConnectivity),
  );

  const apiKeySettingsQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
  });

  const modelRoutesQuery = useQuery({
    queryKey: queryKeys.settings.modelRoutes,
    queryFn: getModelRoutes,
  });

  const modelRouteReadinessQuery = useQuery({
    queryKey: queryKeys.settings.modelRouteReadiness,
    ...createDiagnosticReadQueryPolicy(getModelRouteReadiness),
    enabled: modelRoutesQuery.isSuccess,
  });

  const checkModelRoutesMutation = useMutation({
    mutationFn: () => checkModelRoutesController.current.run(),
    onMutate: () => setDiagnosticNotice(""),
    onSuccess: async () => {
      await refreshDiagnosticReadinessAfterCheck(queryClient, queryKeys.settings.modelRouteReadiness);
    },
    onError: (error) => {
      setDiagnosticNotice(error instanceof Error ? error.message : "模型路由检测失败，请稍后重试。");
    },
  });

  const structuredFallbackQuery = useQuery({
    queryKey: queryKeys.settings.structuredFallback,
    queryFn: getStructuredFallbackConfig,
    refetchOnWindowFocus: false,
  });

  const saveModelRouteMutation = useMutation({
    mutationFn: (payload: RouteSavePayload) => saveModelRoute(payload),
    onSuccess: async () => {
      setActionResult("保存完成，这个任务会使用新路由。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRoutes }),
        resetDiagnosticReadinessAfterConfigurationChange(queryClient, queryKeys.settings.modelRouteReadiness),
      ]);
    },
  });

  const saveAllModelRoutesMutation = useMutation({
    mutationFn: async (payloads: RouteSavePayload[]) => {
      await Promise.all(payloads.map((payload) => saveModelRoute(payload)));
      return payloads.length;
    },
    onSuccess: async (count) => {
      setActionResult(`保存完成，${count} 个任务会使用新路由。`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRoutes }),
        resetDiagnosticReadinessAfterConfigurationChange(queryClient, queryKeys.settings.modelRouteReadiness),
      ]);
    },
  });

  const saveStructuredFallbackMutation = useMutation({
    mutationFn: (payload: Partial<StructuredFallbackSettings>) => saveStructuredFallbackConfig(payload),
    onSuccess: async () => {
      setActionResult("结构化调用容错设置已保存。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.structuredFallback }),
        resetDiagnosticReadinessAfterConfigurationChange(queryClient, queryKeys.settings.modelRouteReadiness),
      ]);
    },
  });

  const providerConfigs = useMemo(() => apiKeySettingsQuery.data?.data ?? [], [apiKeySettingsQuery.data?.data]);
  const modelRoutes = modelRoutesQuery.data?.data;
  const modelRouteReadiness = modelRouteReadinessQuery.data?.data;
  const structuredFallback = structuredFallbackQuery.data?.data;
  const taskTypes = modelRoutes?.taskTypes ?? [];
  const providerOptions = useMemo(() => providerConfigs.map((item) => item.provider), [providerConfigs]);
  const routeMap = useMemo(() => new Map((modelRoutes?.routes ?? []).map((item) => [item.taskType, item])), [modelRoutes?.routes]);
  const diagnosticTargetMap = useMemo(
    () => new Map(
      (modelRouteReadiness?.targets ?? [])
        .filter((target) => target.targetKind === "model_route" && target.taskType)
        .map((target) => [target.taskType!, target]),
    ),
    [modelRouteReadiness?.targets],
  );
  const diagnosticSummary = useMemo(
    () => summarizeDiagnosticTargets(modelRouteReadiness?.targets ?? []),
    [modelRouteReadiness?.targets],
  );
  const diagnosticState = resolveDiagnosticUiState({
    report: modelRouteReadiness,
    isLoading: modelRouteReadinessQuery.isPending,
    isRefreshing: modelRouteReadinessQuery.isFetching,
    isError: modelRouteReadinessQuery.isError,
    isChecking: checkModelRoutesMutation.isPending,
  });
  const preferredProviderConfig = useMemo(
    () => providerConfigs.find((item) => item.isConfigured && item.isActive && getPreferredModel(item))
      ?? providerConfigs.find((item) => getPreferredModel(item))
      ?? providerConfigs[0],
    [providerConfigs],
  );
  const defaultProvider = preferredProviderConfig?.provider ?? "deepseek";
  const defaultModel = getPreferredModel(preferredProviderConfig);
  const dirtyTaskTypes = useMemo(
    () => taskTypes.filter((taskType) => {
      const draft = routeDrafts[taskType];
      return draft ? !isSameRouteDraft(draft, routeMap.get(taskType)) : false;
    }),
    [routeDrafts, routeMap, taskTypes],
  );
  const dirtyTaskTypeSet = useMemo(() => new Set(dirtyTaskTypes), [dirtyTaskTypes]);
  const failedTaskTypes = useMemo(
    () => taskTypes.filter((taskType) => diagnosticTargetMap.get(taskType)?.checkState === "failed"),
    [diagnosticTargetMap, taskTypes],
  );
  const emptyRouteTaskTypes = useMemo(
    () => taskTypes.filter((taskType) => {
      const route = routeMap.get(taskType);
      return !route?.provider || !route?.model;
    }),
    [routeMap, taskTypes],
  );
  const isSavingRoutes = saveModelRouteMutation.isPending || saveAllModelRoutesMutation.isPending;
  const isDiagnosticPending = diagnosticState === "pending";

  function getRouteDraft(taskType: ModelRouteTaskType): RouteDraft {
    const existing = routeDrafts[taskType];
    if (existing) {
      return existing;
    }
    const route = routeMap.get(taskType);
    return {
      provider: route?.provider ?? "deepseek",
      model: route?.model ?? "",
      temperature: route?.temperature != null ? String(route.temperature) : "0.7",
      maxTokens: route?.maxTokens != null ? String(route.maxTokens) : "",
      requestProtocol: route?.requestProtocol ?? "auto",
      structuredResponseFormat: route?.structuredResponseFormat ?? "auto",
    };
  }

  function getBulkDraft(): RouteDraft {
    if (bulkDraft) {
      return bulkDraft;
    }
    return {
      provider: defaultProvider,
      model: defaultModel,
      temperature: "0.7",
      maxTokens: "",
      requestProtocol: "auto",
      structuredResponseFormat: "auto",
    };
  }

  function patchDraft(taskType: ModelRouteTaskType, patch: Partial<RouteDraft>) {
    const current = getRouteDraft(taskType);
    setRouteDrafts((prev) => ({
      ...prev,
      [taskType]: {
        ...current,
        ...patch,
      },
    }));
  }

  function patchBulkDraft(patch: Partial<RouteDraft>) {
    const current = getBulkDraft();
    setBulkDraft({
      ...current,
      ...patch,
    });
  }

  function applyBulkDraftToRoutes(targetTaskTypes: ModelRouteTaskType[]) {
    if (targetTaskTypes.length === 0) {
      setActionResult("没有需要套用的任务。");
      return;
    }
    const draft = getBulkDraft();
    setRouteDrafts((prev) => {
      const next = { ...prev };
      targetTaskTypes.forEach((taskType) => {
        next[taskType] = { ...draft };
      });
      return next;
    });
    setActionResult(`模型设置填入 ${targetTaskTypes.length} 个任务，保存后生效。`);
  }

  function getStructuredFallbackDraft(): StructuredFallbackDraft {
    if (structuredFallbackDraft) {
      return structuredFallbackDraft;
    }
    return {
      enabled: structuredFallback?.enabled ?? false,
      provider: structuredFallback?.provider ?? "deepseek",
      model: structuredFallback?.model ?? "deepseek-chat",
      temperature: structuredFallback != null ? String(structuredFallback.temperature) : "0.2",
      maxTokens: structuredFallback?.maxTokens != null ? String(structuredFallback.maxTokens) : "",
      retryCount: structuredFallback != null ? String(structuredFallback.retryCount) : "1",
      requestProtocol: "auto",
      structuredResponseFormat: "auto",
    };
  }

  function patchStructuredFallbackDraft(patch: Partial<StructuredFallbackDraft>) {
    const current = getStructuredFallbackDraft();
    setStructuredFallbackDraft({
      ...current,
      ...patch,
    });
  }

  const fallbackDraft = getStructuredFallbackDraft();
  const routeBulkDraft = getBulkDraft();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>模型路由管理</CardTitle>
          <CardDescription>
            为不同创作任务指定合适模型，并检查 JSON 输出是否稳定。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>检测会覆盖普通对话和结构化输出；表单修改需要保存后参与检测。</div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-2">
                <RouteStatusDot state={diagnosticState} />
                {diagnosticState === "healthy"
                  ? `检测结果：健康 ${diagnosticSummary.healthy} 条`
                  : diagnosticState === "failed"
                    ? `检测结果：健康 ${diagnosticSummary.healthy} 条，失败 ${diagnosticSummary.failed} 条`
                    : diagnosticState === "stale"
                      ? "模型配置已变化，最近检测结果已过期"
                      : diagnosticState === "not_checked"
                        ? "尚未执行模型兼容性检测"
                        : diagnosticState === "pending"
                          ? "正在检测生效路由..."
                          : diagnosticState === "error"
                            ? "无法读取模型路由检测状态"
                            : "正在读取模型路由检测状态..."}
              </span>
              {modelRouteReadiness?.checkedAt ? (
                <span>检测时间：{new Date(modelRouteReadiness.checkedAt).toLocaleString()}</span>
              ) : null}
            </div>
            {diagnosticState === "stale" || diagnosticState === "not_checked" ? (
              <div className="text-xs text-muted-foreground">未检测或检测记录过期不会阻止按当前已保存配置创作。</div>
            ) : null}
            {diagnosticState === "error" ? (
              <div className="text-xs text-amber-700">读取失败不代表模型不可用，可先重新读取状态。</div>
            ) : null}
            {diagnosticNotice ? <div className="text-xs text-muted-foreground">{diagnosticNotice}</div> : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (diagnosticState === "error") {
                  setDiagnosticNotice("");
                  void modelRouteReadinessQuery.refetch();
                  return;
                }
                if (!isDiagnosticPending) {
                  checkModelRoutesMutation.mutate();
                }
              }}
              disabled={isDiagnosticPending || diagnosticState === "loading" || !modelRoutesQuery.isSuccess}
            >
              <RefreshCw className={`h-4 w-4 ${isDiagnosticPending || diagnosticState === "loading" ? "animate-spin" : ""}`} />
              {diagnosticState === "error"
                ? "重新读取状态"
                : isDiagnosticPending
                  ? "检测中..."
                  : modelRouteReadiness?.diagnosticId
                    ? "重新检测"
                    : "检测模型路由"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/settings">
                <ArrowLeft className="h-4 w-4" />
                返回系统设置
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CopyCheck className="h-5 w-5" />
            快速套用模型
          </CardTitle>
          <CardDescription>
            先选一套模型，再填入多个任务；统一保存后，后续创作会按新路由执行。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModelRouteFields
            draft={routeBulkDraft}
            providerConfigs={providerConfigs}
            providerOptions={providerOptions}
            onPatch={patchBulkDraft}
            temperaturePlaceholder="0.7"
            maxTokensPlaceholder="留空则使用系统默认"
            modelEmptyText="这个服务商没有可选模型"
            manualModelPlaceholder="也可以手动输入模型名"
            showProtocolFields={false}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              待保存任务 {dirtyTaskTypes.length} 个；检测异常任务 {failedTaskTypes.length} 个；空白路由 {emptyRouteTaskTypes.length} 个。
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => applyBulkDraftToRoutes(taskTypes)}
                disabled={!routeBulkDraft.provider.trim() || !routeBulkDraft.model.trim() || taskTypes.length === 0}
              >
                <CopyCheck className="h-4 w-4" />
                套用到全部任务
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => applyBulkDraftToRoutes(failedTaskTypes)}
                disabled={!routeBulkDraft.provider.trim() || !routeBulkDraft.model.trim() || failedTaskTypes.length === 0}
              >
                <CopyCheck className="h-4 w-4" />
                套用到异常任务
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => applyBulkDraftToRoutes(emptyRouteTaskTypes)}
                disabled={!routeBulkDraft.provider.trim() || !routeBulkDraft.model.trim() || emptyRouteTaskTypes.length === 0}
              >
                <CopyCheck className="h-4 w-4" />
                补齐空白任务
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => saveAllModelRoutesMutation.mutate(
                  dirtyTaskTypes.map((taskType) => buildRouteSavePayload(taskType, getRouteDraft(taskType))),
                )}
                disabled={isSavingRoutes || dirtyTaskTypes.length === 0}
              >
                <Save className="h-4 w-4" />
                {saveAllModelRoutesMutation.isPending ? "保存中..." : `保存全部修改${dirtyTaskTypes.length > 0 ? ` (${dirtyTaskTypes.length})` : ""}`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>结构化调用容错</CardTitle>
          <CardDescription>
            服务端繁忙、超时或连接中断时，会先按设置重试；仍未成功时可切换备用模型。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex flex-wrap items-center justify-between gap-3">
            <span className="space-y-1">
              <span className="block font-medium">服务端错误重试次数</span>
              <span className="block text-sm text-muted-foreground">
                0 表示不重试；每次重试都会重新发起一次模型调用，默认 1 次。
              </span>
            </span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="3"
                step="1"
                value={fallbackDraft.retryCount}
                onChange={(event) => patchStructuredFallbackDraft({ retryCount: event.target.value })}
                className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
                aria-label="服务端错误重试次数"
              />
              <span className="text-sm text-muted-foreground">次</span>
            </span>
          </label>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium">启用备用模型</div>
              <div className="text-sm text-muted-foreground">
                当前模型达到重试次数仍失败后，才会切到这套备用模型。
              </div>
            </div>
            <Switch
              checked={fallbackDraft.enabled}
              onCheckedChange={(checked) => patchStructuredFallbackDraft({ enabled: checked })}
            />
          </div>

          <ModelRouteFields
            draft={fallbackDraft}
            providerConfigs={providerConfigs}
            providerOptions={providerOptions}
            onPatch={patchStructuredFallbackDraft}
            temperaturePlaceholder="0.2"
            maxTokensPlaceholder="留空则使用系统默认"
            modelEmptyText="这个服务商没有可选模型"
            manualModelPlaceholder="也可以手动输入模型名"
          />

          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              onClick={() => saveStructuredFallbackMutation.mutate({
                enabled: fallbackDraft.enabled,
                provider: fallbackDraft.provider,
                model: fallbackDraft.model,
                temperature: Number(fallbackDraft.temperature || 0.2),
                maxTokens: fallbackDraft.maxTokens.trim() ? Number(fallbackDraft.maxTokens) : null,
                retryCount: parseStructuredRetryCount(fallbackDraft.retryCount),
              })}
              disabled={saveStructuredFallbackMutation.isPending || !fallbackDraft.provider.trim() || !fallbackDraft.model.trim()}
            >
              {saveStructuredFallbackMutation.isPending ? "保存中..." : "保存容错设置"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {taskTypes.map((taskType) => {
        const draft = getRouteDraft(taskType);
        const label = MODEL_ROUTE_LABELS[taskType];
        const providerName = getProviderDisplayName(providerConfigs, draft.provider);
        const diagnosticTarget = diagnosticTargetMap.get(taskType);
        const persistedTargetState = resolveDiagnosticTargetState(diagnosticTarget, diagnosticState);
        const isDirty = dirtyTaskTypeSet.has(taskType);
        const hasUnsavedRouteDiff = diagnosticTarget != null && isDirty;
        const targetState = hasUnsavedRouteDiff
          && persistedTargetState !== "loading"
          && persistedTargetState !== "error"
          && persistedTargetState !== "pending"
          ? "stale"
          : persistedTargetState;

        return (
          <Card key={taskType}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span>{label.title}</span>
                <span className="inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  <RouteStatusDot state={targetState} />
                  {getDiagnosticStateLabel(targetState)}
                </span>
                {isDirty ? <Badge variant="secondary">待保存</Badge> : null}
              </CardTitle>
              <CardDescription>
                {label.description}
                <span className="ml-2 text-xs">标识：{taskType}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ModelRouteFields
                draft={draft}
                providerConfigs={providerConfigs}
                providerOptions={providerOptions}
                onPatch={(patch) => patchDraft(taskType, patch)}
                temperaturePlaceholder="0.7"
                maxTokensPlaceholder="留空则使用系统默认"
                modelEmptyText="这个服务商没有可选模型"
                manualModelPlaceholder="也可以手动输入模型名"
              />

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>{isDirty ? "表单改动保存后生效。" : `任务使用：${providerName}。`}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RouteStatusDot state={targetState} />
                    <span>{formatDiagnosticTargetStatus(diagnosticTarget)}</span>
                  </div>
                  {diagnosticTarget?.recommendation ? (
                    <div>
                      检测记录包含兼容建议；检测不会自动修改路由。
                    </div>
                  ) : null}
                  {hasUnsavedRouteDiff ? (
                    <div>检测结果来自已保存的旧配置；保存后可按需重新检测。</div>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  onClick={() => saveModelRouteMutation.mutate(buildRouteSavePayload(taskType, draft))}
                  disabled={isSavingRoutes || !draft.provider.trim() || !draft.model.trim()}
                >
                  <Save className="h-4 w-4" />
                  保存路由
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {actionResult ? <div className="text-sm text-muted-foreground">{actionResult}</div> : null}
    </div>
  );
}
