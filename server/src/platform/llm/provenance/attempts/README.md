# Model attempt evidence persistence boundary

`attempts/` contains the S2-04b0 contract, the S2-04b1 generic persistence
repository, and the S2-04b3 production recorder for evidence about actual
model transport attempts. The recorder is exported only through the internal
provenance facade and is connected to the production transport seams; it is
not an HTTP/shared DTO or a replacement for usage tracking, live broker, or
workflow state.

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

`PersistedModelAttemptRepository` applies idempotency, lineage, terminal
immutability, unique-adoption, redacted mapping, and aggregate reconstruction
over an injected `ModelAttemptStore`. Database-specific adapters must provide
request-serializable transactions and atomic unique-key/CAS operations.
`PrismaModelAttemptStore` supplies that adapter for either synchronized Prisma
schema through an injected client; it never imports or opens the application
database singleton itself.

Production wiring rules:

- text prompt invoke/stream and structured invoke/stream start one attempt
  immediately before the provider transport opens;
- structured strategy/transport/fallback/repair/semantic calls use the same
  request scope and explicit lineage role; post-validation decides adoption;
- stream callbacks re-enter the captured request scope so deferred consumers
  cannot lose the request id or leave a started row without a terminal write;
- recorder start/finalize failures are evidence issues only and never alter
  model results or retry/fallback decisions.

The in-memory adapter and coordinator under `prototype/` remain seam-proof
only. Production code uses the recorder and repository provider at the real
transport/validation seams rather than importing the prototype.
