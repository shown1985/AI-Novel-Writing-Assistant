# Model attempt evidence persistence boundary

`attempts/` contains the S2-04b0 contract and seam proof plus the S2-04b1
generic persistence repository for evidence about actual model transport
attempts. It is deliberately **not** exported from
`server/src/platform/llm/provenance/index.ts` and is not connected to the
application Prisma singleton, factory, structured invocation, usage tracking,
prompt runner, live broker, transport, or HTTP routes.

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

The in-memory adapter and coordinator under `prototype/` remain seam-proof
only. Production transport stories must use the production repository at the
real transport/validation seams rather than import the prototype.
