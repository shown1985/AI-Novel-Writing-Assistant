const OPEN_CODE_HOST_PATTERN = /(?:^|\.)opencode\.ai$/i;
const OPEN_CODE_GO_PATH_PATTERN = /(?:^|\/)zen\/go(?:\/|$)/i;

function normalizeBaseURL(baseURL?: string): string | undefined {
  const normalized = baseURL?.trim();
  return normalized || undefined;
}

function parseBaseURL(baseURL?: string): URL | undefined {
  const normalized = normalizeBaseURL(baseURL);
  if (!normalized) {
    return undefined;
  }
  try {
    return new URL(normalized);
  } catch {
    return undefined;
  }
}

export function isOpenCodeHost(baseURL?: string): boolean {
  const parsed = parseBaseURL(baseURL);
  return Boolean(parsed && OPEN_CODE_HOST_PATTERN.test(parsed.hostname));
}

/**
 * OpenCode Go uses an OpenAI-compatible gateway under /zen/go.  Keep this
 * capability separate from request identity so protocol and model behavior
 * can reuse the same trusted endpoint check without duplicating URL rules.
 */
export function isOpenCodeGoEndpoint(baseURL?: string): boolean {
  const parsed = parseBaseURL(baseURL);
  return Boolean(
    parsed
      && OPEN_CODE_HOST_PATTERN.test(parsed.hostname)
      && OPEN_CODE_GO_PATH_PATTERN.test(parsed.pathname),
  );
}
