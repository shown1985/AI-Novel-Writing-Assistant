export function shouldToastApiError(config: {errorPresentation?: "toast" | "inline"; silentErrorStatuses?: number[]; suppressErrorToast?: boolean}, status?: number): boolean {
  if (config.suppressErrorToast || config.errorPresentation === "inline") return false;
  return status === undefined || !config.silentErrorStatuses?.includes(status);
}
