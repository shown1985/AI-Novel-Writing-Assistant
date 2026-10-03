import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Loader2 } from "lucide-react";
import type { LLMProvider, ReasoningEffort } from "@ai-novel/shared/types/llm";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { type APIKeyStatus, getAPIKeySettings, saveAPIKeySetting } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { resetDiagnosticReadinessAfterConfigurationChange } from "@/pages/settings/diagnostics";

const EFFORTS: ReasoningEffort[] = ["low", "high", "max"];
const LABELS = ["关闭", "低", "高", "最大"] as const;

interface Props {
  provider: LLMProvider | null;
  selectedModel: string | null;
  onReconfigure: () => void;
}

export default function CurrentModelReasoningSettings({ provider, selectedModel, onReconfigure }: Props) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const config = settingsQuery.data?.data?.find((item) => item.provider === provider);
  const savedValue = config?.reasoningEnabled
    ? config.supportsReasoningEffort ? Math.max(1, EFFORTS.indexOf(config.reasoningEffort ?? "high") + 1) : 1
    : 0;
  const [value, setValue] = useState(savedValue);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);
  const editingRef = useRef(false);
  const savedValueRef = useRef(savedValue);
  savedValueRef.current = savedValue;

  useEffect(() => {
    if (!busyRef.current && !editingRef.current) setValue(savedValue);
  }, [provider, savedValue]);

  const commit = async (nextValue: number) => {
    if (!config || busyRef.current) return;
    editingRef.current = false;
    if (nextValue === savedValueRef.current) return;
    busyRef.current = true;
    setSaving(true);
    setMessage("");
    try {
      const response = await saveAPIKeySetting(config.provider, {
        reasoningEnabled: nextValue > 0,
        ...(config.supportsReasoningEffort && nextValue > 0
          ? { reasoningEffort: EFFORTS[nextValue - 1] }
          : {}),
      });
      if (!response.data) throw new Error("没有收到保存结果，请重试。");
      await queryClient.cancelQueries({ queryKey: queryKeys.settings.apiKeys });
      savedValueRef.current = response.data.reasoningEnabled
        ? response.data.supportsReasoningEffort
          ? Math.max(1, EFFORTS.indexOf(response.data.reasoningEffort ?? "high") + 1)
          : 1
        : 0;
      setValue(savedValueRef.current);
      queryClient.setQueryData<ApiResponse<APIKeyStatus[]>>(queryKeys.settings.apiKeys, (previous) => previous?.data
          ? {
              ...previous,
              data: previous.data.map((item) => item.provider === config.provider
                ? {
                    ...item,
                    reasoningEnabled: response.data!.reasoningEnabled,
                    reasoningEffort: response.data!.reasoningEffort,
                    supportsReasoningEffort: response.data!.supportsReasoningEffort,
                  }
                : item),
            }
          : previous);
      setMessage("推理强度已保存。");
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeyBalances }),
        queryClient.invalidateQueries({ queryKey: queryKeys.llm.providers }),
        resetDiagnosticReadinessAfterConfigurationChange(queryClient, queryKeys.settings.modelRouteReadiness),
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? `保存失败：${error.message}` : "保存失败，请重试。");
      try {
        const refreshed = await settingsQuery.refetch();
        const current = refreshed.data?.data?.find((item) => item.provider === config.provider);
        if (current) {
          setValue(current.reasoningEnabled
            ? current.supportsReasoningEffort ? Math.max(1, EFFORTS.indexOf(current.reasoningEffort ?? "high") + 1) : 1
            : 0);
        } else {
          setValue(savedValueRef.current);
        }
      } catch {
        setValue(savedValueRef.current);
      }
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">当前模型</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {config?.name ?? provider ?? "未选择厂商"} · {selectedModel || config?.currentModel || "未选择模型"}
        </p>
        {config && selectedModel && selectedModel !== config.currentModel ? (
          <p className="mt-1 text-xs text-muted-foreground">推理强度档位以连接中的 {config.currentModel} 为准。</p>
        ) : null}
      </div>
      {settingsQuery.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> 正在读取推理强度</p>
      ) : settingsQuery.isError ? (
        <div className="space-y-2 text-sm text-destructive">
          <p>读取推理强度失败，请重试。</p>
          <Button variant="outline" size="sm" onClick={() => void settingsQuery.refetch()}>重新读取</Button>
        </div>
      ) : !config ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><CircleAlert className="h-4 w-4" /> 当前厂商没有可用配置，请重新配置模型连接。</p>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="current-model-reasoning" className="text-sm font-medium">推理强度</label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {config.supportsReasoningEffort
                ? "选择用于这个模型连接的推理强度，松开后自动保存。"
                : "这个模型连接支持开启或关闭推理，松开后自动保存。"}
            </p>
          </div>
          <input
            id="current-model-reasoning"
            type="range"
            min={0}
            max={config.supportsReasoningEffort ? 3 : 1}
            step={1}
            value={value}
            disabled={saving}
            aria-valuetext={config.supportsReasoningEffort ? LABELS[value] : value ? "开启" : "关闭"}
            className="w-full accent-primary"
            onChange={(event) => { editingRef.current = true; setValue(Number(event.target.value)); setMessage(""); }}
            onPointerUp={(event) => void commit(Number(event.currentTarget.value))}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                void commit(Number(event.currentTarget.value));
              }
            }}
            onBlur={(event) => void commit(Number(event.currentTarget.value))}
          />
          <div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
            {(config.supportsReasoningEffort ? LABELS : ["关闭", "开启"]).map((label) => <span key={label}>{label}</span>)}
          </div>
          <p className="min-h-5 text-xs" role="status" aria-live="polite">
            {saving ? "正在保存…" : message}
          </p>
        </div>
      )}
      <div className="border-t pt-4">
        <Button variant="outline" disabled={saving} onClick={onReconfigure}>重新配置模型连接</Button>
      </div>
    </div>
  );
}
