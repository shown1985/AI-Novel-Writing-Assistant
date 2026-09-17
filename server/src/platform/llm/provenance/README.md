# Model selection provenance

This module owns the sanitized evidence produced while model settings are resolved.
It records field-level sources and deterministic parameter adjustments without
copying connection details from `ResolvedLLMClientOptions`.

The `server/src/llm/factory.ts` facade is the runtime producer. Later persistence
or UI work must consume the public provenance shape through `index.ts`; it must
not reconstruct historical provenance from current settings.

This module does not persist attempts, generate attempt identifiers, invoke a
model, or change route and fallback precedence.
