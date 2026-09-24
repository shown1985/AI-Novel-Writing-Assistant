/**
 * World prompt facade. Prompt assets are owned by generation stage under `./stages/`:
 * - `stages/inspiration.prompts.ts`: reference inspiration, concept cards, property options.
 * - `stages/layers.prompts.ts`: deepening questions, consistency check, layer generation/localization, axiom suggestions.
 * - `stages/structure.prompts.ts`: structured world data (import extraction, backfill, novel-theme generation,
 *   structure sections) and visualization.
 * External modules and the prompt registry keep importing from this file.
 */
export {
  worldReferenceInspirationPrompt,
  worldInspirationConceptCardPrompt,
  worldInspirationConceptCardLocalizationPrompt,
  worldPropertyOptionsPrompt,
} from "./stages/inspiration.prompts";
export {
  worldDeepeningQuestionsPrompt,
  worldConsistencyPrompt,
  worldLayerGenerationPrompt,
  worldLayerLocalizationPrompt,
  worldAxiomSuggestionPrompt,
} from "./stages/layers.prompts";
export {
  worldVisualizationPrompt,
  worldImportExtractionPrompt,
  worldStructureBackfillPrompt,
  novelThemeWorldGenerationPrompt,
  worldStructureSectionPrompt,
} from "./stages/structure.prompts";
