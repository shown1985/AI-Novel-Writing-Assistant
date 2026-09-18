const test = require("node:test");
const assert = require("node:assert/strict");

const worldPrompts = require("../dist/prompting/prompts/world/world.prompts.js");

const expectedAssets = {
  worldReferenceInspirationPrompt: ["world.reference.inspiration", "v1"],
  worldVisualizationPrompt: ["world.visualization.generate", "v1"],
  worldInspirationConceptCardPrompt: ["world.inspiration.concept_card", "v1"],
  worldInspirationConceptCardLocalizationPrompt: ["world.inspiration.localize_concept_card", "v1"],
  worldPropertyOptionsPrompt: ["world.property_options.generate", "v1"],
  worldDeepeningQuestionsPrompt: ["world.deepening.questions", "v1"],
  worldConsistencyPrompt: ["world.consistency.check", "v1"],
  worldLayerGenerationPrompt: ["world.layer.generate", "v1"],
  worldLayerLocalizationPrompt: ["world.layer.localize", "v1"],
  worldImportExtractionPrompt: ["world.import.extract", "v1"],
  worldStructureBackfillPrompt: ["world.structure.backfill", "v1"],
  novelThemeWorldGenerationPrompt: ["novel.world.generate_from_theme", "v3"],
  worldStructureSectionPrompt: ["world.structure.generate", "v1"],
  worldAxiomSuggestionPrompt: ["world.axioms.suggest", "v1"],
};

test("world Prompt compatibility facade preserves all registered asset metadata", () => {
  assert.deepEqual(
    Object.keys(worldPrompts).sort(),
    Object.keys(expectedAssets).sort(),
  );

  for (const [exportName, [id, version]] of Object.entries(expectedAssets)) {
    const asset = worldPrompts[exportName];
    assert.equal(asset.id, id, `${exportName} id`);
    assert.equal(asset.version, version, `${exportName} version`);
    assert.equal(typeof asset.render, "function", `${exportName} render`);
    assert.equal(typeof asset.outputSchema?.safeParse, "function", `${exportName} outputSchema`);
  }
});
