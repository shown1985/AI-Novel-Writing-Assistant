import { prisma } from "../../../../../db/prisma";
import { PersistedModelAttemptRepository } from "../PersistedModelAttemptRepository";
import { PrismaModelAttemptStore } from "../PrismaModelAttemptStore";
import type { ModelAttemptRepository } from "../repository";

let repositoryOverride: ModelAttemptRepository | null = null;
let productionRepository: ModelAttemptRepository | null = null;

export function getModelAttemptRepository(): ModelAttemptRepository {
  if (repositoryOverride) {
    return repositoryOverride;
  }
  productionRepository ??= new PersistedModelAttemptRepository(
    new PrismaModelAttemptStore(prisma),
  );
  return productionRepository;
}

export function setModelAttemptRepositoryForTests(repository?: ModelAttemptRepository): void {
  repositoryOverride = repository ?? null;
}
