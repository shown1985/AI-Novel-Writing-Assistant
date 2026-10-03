export type WorldPromptCompressionLevel = "normal" | "minimal";

function compactText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const suffixLength = Math.min(24, Math.floor(maxChars / 4));
  return `${normalized.slice(0, maxChars - suffixLength - 1)}…${normalized.slice(-suffixLength)}`;
}

function compactList(value: unknown, maxItems: number, itemMaxChars: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => compactText(item, itemMaxChars));
}

function compactRelation(value: unknown): Record<string, unknown> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id: typeof source.id === "string" ? source.id : "",
    ...(typeof source.sourceForceId === "string" ? { sourceForceId: source.sourceForceId } : {}),
    ...(typeof source.targetForceId === "string" ? { targetForceId: source.targetForceId } : {}),
    ...(typeof source.forceId === "string" ? { forceId: source.forceId } : {}),
    ...(typeof source.locationId === "string" ? { locationId: source.locationId } : {}),
    ...(typeof source.sourceLocationId === "string" ? { sourceLocationId: source.sourceLocationId } : {}),
    ...(typeof source.targetLocationId === "string" ? { targetLocationId: source.targetLocationId } : {}),
    ...(typeof source.relation === "string" ? { relation: compactText(source.relation, 48) } : {}),
    ...(typeof source.connectionType === "string" ? { connectionType: compactText(source.connectionType, 48) } : {}),
    ...(typeof source.tension === "string" ? { tension: compactText(source.tension, 64) } : {}),
    ...(typeof source.detail === "string" ? { detail: compactText(source.detail, 72) } : {}),
    ...(typeof source.distanceHint === "string" ? { distanceHint: compactText(source.distanceHint, 48) } : {}),
    ...(typeof source.narrativeUse === "string" ? { narrativeUse: compactText(source.narrativeUse, 72) } : {}),
  };
}

function compactWorldContext(context: Record<string, unknown>): Record<string, unknown> {
  const profile = context.profile && typeof context.profile === "object"
    ? context.profile as Record<string, unknown>
    : undefined;
  const rules = context.rules && typeof context.rules === "object"
    ? context.rules as Record<string, unknown>
    : undefined;

  const minimal: Record<string, unknown> = {
    forces: Array.isArray(context.forces)
      ? context.forces.slice(0, 16).map((value) => {
        const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return {
          id: typeof source.id === "string" ? source.id : "",
          name: compactText(source.name, 48),
          ...(typeof source.factionId === "string" ? { factionId: source.factionId } : {}),
          ...(Array.isArray(source.controlledLocationIds)
            ? { controlledLocationIds: source.controlledLocationIds.slice(0, 12) }
            : {}),
          ...(typeof source.currentObjective === "string" ? { currentObjective: compactText(source.currentObjective, 80) } : {}),
          ...(typeof source.pressure === "string" ? { pressure: compactText(source.pressure, 80) } : {}),
          ...(typeof source.narrativeRole === "string" ? { narrativeRole: compactText(source.narrativeRole, 72) } : {}),
        };
      })
      : [],
    locations: Array.isArray(context.locations)
      ? context.locations.slice(0, 20).map((value) => {
        const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return {
          id: typeof source.id === "string" ? source.id : "",
          name: compactText(source.name, 48),
          ...(typeof source.x === "number" ? { x: source.x } : {}),
          ...(typeof source.y === "number" ? { y: source.y } : {}),
          ...(typeof source.directionHint === "string" ? { directionHint: source.directionHint } : {}),
          ...(typeof source.narrativeFunction === "string"
            ? { narrativeFunction: compactText(source.narrativeFunction, 80) }
            : {}),
          ...(Array.isArray(source.controllingForceIds)
            ? { controllingForceIds: source.controllingForceIds.slice(0, 8) }
            : {}),
        };
      })
      : [],
  };

  if (profile) {
    minimal.profile = {
      summary: compactText(profile.summary, 180),
      identity: compactText(profile.identity, 120),
      ...(typeof profile.tone === "string" ? { tone: compactText(profile.tone, 80) } : {}),
      ...(Array.isArray(profile.themes) ? { themes: compactList(profile.themes, 3, 48) } : {}),
      coreConflict: compactText(profile.coreConflict, 140),
    };
  }

  if (rules) {
    minimal.rules = {
      summary: compactText(rules.summary, 140),
      axioms: Array.isArray(rules.axioms)
        ? rules.axioms.slice(0, 12).map((value) => {
          const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
          return {
            id: typeof source.id === "string" ? source.id : "",
            name: compactText(source.name, 48),
            summary: compactText(source.summary, 72),
            ...(typeof source.cost === "string" ? { cost: compactText(source.cost, 56) } : {}),
            ...(typeof source.boundary === "string" ? { boundary: compactText(source.boundary, 56) } : {}),
            ...(typeof source.enforcement === "string" ? { enforcement: compactText(source.enforcement, 56) } : {}),
          };
        })
        : [],
      ...(Array.isArray(rules.taboo) ? { taboo: compactList(rules.taboo, 4, 56) } : {}),
      ...(Array.isArray(rules.sharedConsequences)
        ? { sharedConsequences: compactList(rules.sharedConsequences, 4, 56) }
        : {}),
    };
  }

  if (Array.isArray(context.factions)) {
    minimal.factions = context.factions.slice(0, 12).map((value) => {
      const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
      return {
        id: typeof source.id === "string" ? source.id : "",
        name: compactText(source.name, 48),
        ...(Array.isArray(source.representativeForceIds)
          ? { representativeForceIds: source.representativeForceIds.slice(0, 8) }
          : {}),
        ...(typeof source.position === "string" ? { position: compactText(source.position, 64) } : {}),
        ...(Array.isArray(source.goals) ? { goals: compactList(source.goals, 2, 64) } : {}),
      };
    });
  }

  if (context.relations && typeof context.relations === "object") {
    const relations = context.relations as Record<string, unknown>;
    minimal.relations = {
      ...(Array.isArray(relations.forceRelations)
        ? { forceRelations: relations.forceRelations.slice(0, 24).map(compactRelation) }
        : {}),
      ...(Array.isArray(relations.locationControls)
        ? { locationControls: relations.locationControls.slice(0, 32).map(compactRelation) }
        : {}),
      ...(Array.isArray(relations.locationConnections)
        ? { locationConnections: relations.locationConnections.slice(0, 32).map(compactRelation) }
        : {}),
    };
  }

  return minimal;
}

export function compressWorldPromptContext<T extends Record<string, unknown>>(
  context: T,
  level: WorldPromptCompressionLevel,
): T {
  if (level === "normal") {
    return context;
  }
  return compactWorldContext(context) as T;
}

export function resolveWorldPromptInputLimits(level: WorldPromptCompressionLevel): {
  ideaMaxChars: number;
  blueprintMaxChars: number;
  referenceMaxChars: number;
} {
  return level === "minimal"
    ? { ideaMaxChars: 1_800, blueprintMaxChars: 1_200, referenceMaxChars: 1_200 }
    : { ideaMaxChars: 6_000, blueprintMaxChars: 3_200, referenceMaxChars: 3_200 };
}

export function resolveWorldStageOutputTokens(baseTokens: number, level: WorldPromptCompressionLevel): number {
  if (level === "normal") {
    return baseTokens;
  }
  return Math.max(1_024, Math.floor(baseTokens * 0.7));
}
