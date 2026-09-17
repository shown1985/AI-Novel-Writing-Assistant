import { z } from "zod";
import type {
  ModelRouteRequestProtocol,
  ModelRouteStructuredResponseFormat,
} from "./novel";

const DIAGNOSTIC_REQUEST_PROTOCOL_VALUES = [
  "auto",
  "openai_compatible",
  "anthropic",
] as const satisfies readonly ModelRouteRequestProtocol[];
const DIAGNOSTIC_STRUCTURED_RESPONSE_FORMAT_VALUES = [
  "auto",
  "json_schema",
  "json_object",
  "prompt_json",
] as const satisfies readonly ModelRouteStructuredResponseFormat[];

export const DIAGNOSTIC_CHECK_STATE_VALUES = [
  "not_checked",
  "healthy",
  "failed",
  "stale",
] as const;
export const diagnosticCheckStateSchema = z.enum(DIAGNOSTIC_CHECK_STATE_VALUES);
export type DiagnosticCheckState = z.infer<typeof diagnosticCheckStateSchema>;

export const DIAGNOSTIC_SCOPE_VALUES = ["model_routes", "rag"] as const;
export const diagnosticScopeSchema = z.enum(DIAGNOSTIC_SCOPE_VALUES);
export type DiagnosticScope = z.infer<typeof diagnosticScopeSchema>;

export const DIAGNOSTIC_TARGET_KIND_VALUES = [
  "model_route",
  "rag_embedding",
  "rag_vector_store",
] as const;
export const diagnosticTargetKindSchema = z.enum(DIAGNOSTIC_TARGET_KIND_VALUES);
export type DiagnosticTargetKind = z.infer<typeof diagnosticTargetKindSchema>;

export const DIAGNOSTIC_CAPABILITY_VALUES = [
  "plain",
  "structured",
  "embedding",
  "vector_store",
] as const;
export const diagnosticCapabilitySchema = z.enum(DIAGNOSTIC_CAPABILITY_VALUES);
export type DiagnosticCapability = z.infer<typeof diagnosticCapabilitySchema>;

export const diagnosticCapabilityResultSchema = z.object({
  capability: diagnosticCapabilitySchema,
  checkState: diagnosticCheckStateSchema,
  latencyMs: z.number().int().nonnegative().nullable(),
  errorSummary: z.string().trim().min(1).nullable(),
}).strict();
export type DiagnosticCapabilityResult = z.infer<typeof diagnosticCapabilityResultSchema>;

export const diagnosticRecommendationSchema = z.object({
  recommendationId: z.string().trim().min(1),
  requestProtocol: z.enum(DIAGNOSTIC_REQUEST_PROTOCOL_VALUES).nullable(),
  structuredResponseFormat: z.enum(DIAGNOSTIC_STRUCTURED_RESPONSE_FORMAT_VALUES).nullable(),
  reason: z.string().trim().min(1),
}).strict();
export type DiagnosticRecommendation = z.infer<typeof diagnosticRecommendationSchema>;

export const diagnosticTargetResultSchema = z.object({
  targetId: z.string().trim().min(1),
  targetKind: diagnosticTargetKindSchema,
  taskType: z.string().trim().min(1).nullable(),
  provider: z.string().trim().min(1).nullable(),
  model: z.string().trim().min(1).nullable(),
  checkState: diagnosticCheckStateSchema,
  checkedAt: z.string().datetime().nullable(),
  errorSummary: z.string().trim().min(1).nullable(),
  capabilities: z.array(diagnosticCapabilityResultSchema),
  recommendation: diagnosticRecommendationSchema.nullable(),
  revision: z.number().int().nonnegative(),
}).strict();
export type DiagnosticTargetResult = z.infer<typeof diagnosticTargetResultSchema>;

export const diagnosticReadinessReportSchema = z.object({
  diagnosticId: z.string().trim().min(1).nullable(),
  scope: diagnosticScopeSchema,
  checkState: diagnosticCheckStateSchema,
  checkedAt: z.string().datetime().nullable(),
  configurationFingerprint: z.string().trim().min(1),
  targets: z.array(diagnosticTargetResultSchema),
}).strict();
export type DiagnosticReadinessReport = z.infer<typeof diagnosticReadinessReportSchema>;

export const diagnosticRecommendationTargetSelectionSchema = z.object({
  targetId: z.string().trim().min(1),
  recommendationId: z.string().trim().min(1),
  expectedRevision: z.number().int().nonnegative(),
}).strict();
export type DiagnosticRecommendationTargetSelection = z.infer<
  typeof diagnosticRecommendationTargetSelectionSchema
>;

export const applyDiagnosticRecommendationsRequestSchema = z.object({
  source: z.literal("diagnostic_recommendation"),
  operationId: z.string().trim().min(1),
  diagnosticId: z.string().trim().min(1),
  expectedConfigurationFingerprint: z.string().trim().min(1),
  targets: z.array(diagnosticRecommendationTargetSelectionSchema).min(1),
}).strict().superRefine((request, context) => {
  const seen = new Set<string>();
  request.targets.forEach((target, index) => {
    if (seen.has(target.targetId)) {
      context.addIssue({
        code: "custom",
        message: "Each diagnostic target may be selected only once.",
        path: ["targets", index, "targetId"],
      });
    }
    seen.add(target.targetId);
  });
});
export type ApplyDiagnosticRecommendationsRequest = z.infer<
  typeof applyDiagnosticRecommendationsRequestSchema
>;

export const applyDiagnosticRecommendationsResultSchema = z.object({
  operationId: z.string().trim().min(1),
  status: z.enum(["applied", "replayed", "conflict"]),
  configurationFingerprint: z.string().trim().min(1),
  appliedTargetIds: z.array(z.string().trim().min(1)),
  conflictTargetIds: z.array(z.string().trim().min(1)),
}).strict();
export type ApplyDiagnosticRecommendationsResult = z.infer<
  typeof applyDiagnosticRecommendationsResultSchema
>;
