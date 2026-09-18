/**
 * Compatibility facade for world Prompt assets.
 *
 * Capability ownership lives in the explicit submodules below. Runtime services and
 * the Prompt Registry keep importing this file so asset moves do not leak across
 * module boundaries.
 */
export {
  worldInspirationConceptCardLocalizationPrompt,
  worldInspirationConceptCardPrompt,
  worldPropertyOptionsPrompt,
  worldReferenceInspirationPrompt,
} from "./inspiration/worldInspiration.prompts";
export {
  worldVisualizationPrompt,
} from "./presentation/worldPresentation.prompts";
export {
  worldConsistencyPrompt,
  worldDeepeningQuestionsPrompt,
  worldStructureBackfillPrompt,
} from "./maintenance/worldMaintenance.prompts";
export {
  worldAxiomSuggestionPrompt,
  worldLayerGenerationPrompt,
  worldLayerLocalizationPrompt,
  worldStructureSectionPrompt,
} from "./structure/worldStructure.prompts";
export {
  worldImportExtractionPrompt,
} from "./transfer/worldTransfer.prompts";
export {
  novelThemeWorldGenerationPrompt,
} from "./generation/worldGeneration.prompts";
