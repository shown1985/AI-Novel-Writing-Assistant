# Model attempt evidence prototype

`attempts/` is the isolated S2-04b0 contract and seam proof for evidence about
actual model transport attempts. It is deliberately **not** exported from
`server/src/platform/llm/provenance/index.ts` and is not connected to the
factory, structured invocation, usage tracking, prompt runner, live broker,
Prisma, or HTTP routes.

The production boundary frozen here is:

- one product request has one stable `requestId` and one or more ordered
  `attemptId` records;
- every physical invoke or stream opened against a provider is an attempt;
- retry, repair, semantic retry, and fallback relationships are explicit via
  `parentAttemptId`, `attemptIndex`, `role`, and `routeTier`;
- `status` describes transport completion, while `finalAdoption` separately
  states whether that output became the caller's final result;
- null usage remains null and never suppresses the attempt;
- repository writes are observational. Their failure never repeats model
  generation or changes product workflow state;
- persisted records contain no API keys, endpoint URLs, auth headers, prompt
  text, model output, provider error bodies, or session credentials.

The in-memory adapter and coordinator under `prototype/` exist only to prove
the port is executable with mocked transport. Production stories must replace
them at the real transport/validation seams rather than import this prototype.
