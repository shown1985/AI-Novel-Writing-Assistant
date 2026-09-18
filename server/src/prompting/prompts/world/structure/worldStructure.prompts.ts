import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import { worldStructureSectionOutputSchema } from "../../../../services/world/worldSchemas";
import { buildStructureSectionInstructions } from "../../../../services/world/worldServiceShared";
import type {
  WorldAxiomSuggestionPromptInput,
  WorldLayerGenerationPromptInput,
  WorldLayerLocalizationPromptInput,
  WorldStructureSectionPromptInput,
} from "../world.promptTypes";
import {
  worldAxiomSuggestionSchema,
  worldLooseObjectSchema,
} from "../world.promptSchemas";

function sanitizeLooseWorldObject(value: unknown, allowedKeys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须返回 JSON 对象。`);
  }

  const record = value as Record<string, unknown>;
  const normalizedAllowedKeys = new Set(allowedKeys.map((key) => key.trim()).filter(Boolean));
  if (normalizedAllowedKeys.size === 0) {
    throw new Error(`${label} 缺少允许字段配置。`);
  }

  const filteredEntries = Object.entries(record).filter(([key, fieldValue]) => {
    if (!normalizedAllowedKeys.has(key)) {
      return false;
    }
    return fieldValue != null;
  });

  if (filteredEntries.length === 0) {
    throw new Error(`${label} 没有返回任何允许字段。`);
  }

  return Object.fromEntries(filteredEntries);
}

function normalizeWorldStructureSectionPayload(
  value: z.infer<typeof worldStructureSectionOutputSchema>,
  input: WorldStructureSectionPromptInput,
): z.infer<typeof worldStructureSectionOutputSchema> {
  const arraySections = new Set(["locations"]);
  const shouldReturnArray = arraySections.has(input.section);

  if (shouldReturnArray) {
    if (!Array.isArray(value)) {
      throw new Error(`world.structure.generate 在 section=${input.section} 时必须返回数组。`);
    }
    return value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`world.structure.generate 在 section=${input.section} 时必须返回对象。`);
  }
  if (input.section === "factions") {
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.factions) && !Array.isArray(record.forces)) {
      throw new Error("world.structure.generate 在 section=factions 时必须返回包含 factions 或 forces 数组的对象。");
    }
  }
  return value;
}

export const worldLayerGenerationPrompt: PromptAsset<
  WorldLayerGenerationPromptInput,
  z.infer<typeof worldLooseObjectSchema>
> = {
  id: "world.layer.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldLooseObjectSchema,
  render: (input) => [
    new SystemMessage(
      [
        `你是世界观分层构建器，当前只负责生成 layer=${input.layerKey} 对应字段。`,
        "你的任务不是重写整套世界观，而是在既有世界基础上，为当前层补出可直接用于小说创作的结构化设定。",
        "",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
        `输出字段只能来自：${input.targetFields.join(", ")}。`,
        "不得新增字段，不得输出目标字段之外的任何键。",
        "每个字段的值必须是可直接展示给作者阅读的简体中文文本字符串。",
        "禁止把字段值写成 JSON 对象、数组、嵌套结构、键值表或代码式结构。",
        "如果某层天然包含多个条目，请在同一个字符串内用自然语言分段或换行表达，不要输出嵌套对象。",
        "",
        "全局硬规则：",
        "1. 必须严格遵守：世界公理、模板约束、用户前置蓝图选择、既有已生成内容。",
        "2. 只能在现有基础上做补全与细化，不得推翻前面层已成立的设定。",
        "3. 若输入信息不足，必须做保守补全，优先给出低风险、可成立的设定，不要胡乱发散。",
        "4. 所有字段值必须使用简体中文。",
        "5. 输出必须是可直接落入世界设定库的结果，而不是分析说明或摘要。",
        "",
        "生成原则：",
        "1. 当前层必须与前面层形成因果关系、结构关联或运行关联，不能写成孤立描述。",
        "2. 每个字段都应回答“这个世界具体是怎么运作的”，而不是只写概念标签。",
        "3. 优先生成对后续剧情、人物、冲突、资源流动、秩序运转真正有作用的设定。",
        "4. 不要写空泛表达，如“社会复杂”“文化多元”“势力纷争”。必须具体说明复杂在哪里、多元在哪里、如何纷争。",
        "",
        "一致性要求：",
        "1. 不得与 existing 中已有内容冲突。",
        "2. 若某项设定必须承接 blueprint 或 summary 中的方向，必须明确体现承接关系。",
        "3. 若 classicElements 可参考，应吸收其有效结构，但不能机械复读模板说明。",
        "4. 若 pitfalls 已指出常见坑点，必须主动避开这些问题，不要把风险直接写进设定。",
        "",
        "质量要求：",
        "1. 每个字段都要具体、清楚、可用于写作，不要停留在百科式空描述。",
        "2. 设定应体现世界的运行逻辑、约束边界和叙事价值。",
        "3. 如果当前层天然依赖上层设定，必须显式体现这种依赖，而不是另起炉灶。",
        "",
        "边界规则：",
        "1. 不要输出总结段、前言、后记或解释说明。",
        "2. 不要补写 targetFields 之外的附加设定。",
        "3. 不要因为信息不足而留空字段；应尽量给出稳妥可用的内容。",
      ].join("\n")
    ),
    new HumanMessage(
      [
        `name=${input.worldName}`,
        `worldType=${input.worldType}`,
        `template=${input.templateName}`,
        `templateDescription=${input.templateDescription}`,
        `classicElements=${input.classicElements.join(" | ") || "none"}`,
        `pitfalls=${input.pitfalls.join(" | ") || "none"}`,
        `axioms=${input.axioms || "none"}`,
        `summary=${input.summary || "none"}`,
        "blueprint=",
        input.blueprintPromptBlock,
        `existing=${input.existingJson}`,
        `ragContext=${input.ragContext || "none"}`,
        "",
        `请只生成当前 layer=${input.layerKey} 所需字段，并确保字段仅来自：${input.targetFields.join(", ")}。`,
      ].join("\n")
    ),
  ],
  postValidate: (output, input) =>
    sanitizeLooseWorldObject(
      output,
      input.targetFields,
      `world.layer.generate(${input.layerKey})`,
    ),
};

export const worldLayerLocalizationPrompt: PromptAsset<
  WorldLayerLocalizationPromptInput,
  z.infer<typeof worldLooseObjectSchema>
> = {
  id: "world.layer.localize",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldLooseObjectSchema,
  render: (input) => [
    new SystemMessage(
      [
        "你是世界观设定文本本地化助手。",
        "你的任务是将输入 JSON 对象中所有“展示给用户看的字段值”改写为自然、准确、可直接使用的简体中文。",
        "",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "",
        "结构硬规则：",
        "1. 必须保持字段名完全不变。",
        "2. 不得新增字段、删除字段或调整层级结构。",
        `3. 输出字段只能来自当前层允许字段：${input.layerFields.join(", ")}。`,
        "",
        "内容规则：",
        "1. 必须保留原设定语义，不得改变世界规则、结构关系、因果逻辑或设定边界。",
        "2. 必须保留专有名词含义；若原专有名词已有合理中文形式，应优先使用自然中文表达。",
        "3. 不得补写新设定，不得删减已有有效信息。",
        "4. 不得把模糊表述擅自具体化为新的世界事实。",
        "",
        "本地化要求：",
        "1. 所有字段值都必须改写为简体中文。",
        "2. 不是机械翻译，而是要转写成符合中文小说世界设定语境的自然表达。",
        "3. 若原文存在英文思维、生硬直译、重复或不通顺表达，应在不改变原意前提下优化。",
        "4. 数组中的每一项也必须本地化，但要保持原有数量与对应关系不变。",
        "",
        "质量要求：",
        "1. 输出结果必须像可直接进入世界设定库的中文成稿，而不是翻译稿。",
        "2. 各字段值之间必须保持一致，不得出现术语前后不统一。",
        "3. 不要输出空泛润色，优先保证准确、稳定、可复用。",
        "",
        "边界规则：",
        "1. 如果输入中某些值本来已经是自然中文，可保留或仅做轻微润色，不要为了改而改。",
        "2. 如果某些 ID、代码式字段值属于结构标识而非展示文本，不要误翻。",
      ].join("\n")
    ),
    new HumanMessage(
      [
        `layer=${input.layerKey}`,
        `fields=${input.layerFields.join(",")}`,
        `input=${input.sourcePayloadJson}`,
      ].join("\n")
    ),
  ],
  postValidate: (output, input) =>
    sanitizeLooseWorldObject(
      output,
      input.layerFields,
      `world.layer.localize(${input.layerKey})`,
    ),
};


export const worldStructureSectionPrompt: PromptAsset<
  WorldStructureSectionPromptInput,
  z.infer<typeof worldStructureSectionOutputSchema>
> = {
  id: "world.structure.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldStructureSectionOutputSchema,
  render: (input) => [
    new SystemMessage(
      [
        `你是世界结构化补全器，当前只负责补全 section=${input.section} 对应的 JSON。`,
        "你的任务不是重写整套世界结构，而是在现有结构基础上，为指定 section 补出可直接落库的结构化内容。",
        "",
        "只输出一个合法 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "",
        buildStructureSectionInstructions(input.section),
        "",
        "全局硬规则：",
        "1. 只能补全当前 section 对应的数据，不得输出其他 section 的内容。",
        "2. 不要破坏已有 ID；如果沿用现有实体，必须复用当前结构中的 id。",
        "3. 不得编造与输入文本、当前结构或绑定建议明显冲突的信息。",
        "4. 如果信息不足，必须做保守补全，优先补“低风险、可成立、能落地”的结构，不要硬造复杂设定。",
        "5. 所有文本值必须使用简体中文。",
        "",
        "一致性要求：",
        "1. 输出内容必须与当前结构保持连续，不得推翻已成立的世界规则、阵营关系、地点功能或既有绑定。",
        "2. 若当前 section 涉及实体复用，优先延续现有命名、归属与关系网络。",
        "3. 若当前绑定建议给出了优先连接方向，应尽量沿用，除非与输入文本明显冲突。",
        "",
        input.stageConstraints?.trim() ? [
          "本次阶段的硬约束：",
          input.stageConstraints.trim(),
        ].join("\n") : "",
        "section 补全规则：",
        "1. 如果 section=factions，必须同时考虑 factions 和 forces 的区分与联动。",
        "2. 禁止把社会压力机制、行业规则、人际法则、默认秩序、普遍代价这类世界默认机制写进 factions / forces；这些内容属于 rules。",
        "3. faction 写抽象阵营、立场、路线；force 写具体组织、部门、圈层、公司、帮会、机构、网络等行动主体。",
        "4. 如果 section=locations，必须填写 narrativeFunction、risk、entryConstraint、exitCost，且内容必须具体可用，不能空泛。",
        "5. 如果 section=relations，只允许输出 forceRelations 和 locationControls，不得新增其他关系块。",
        "6. relations 必须只连接真正有依据的实体，不要机械连边。",
        "",
        "质量要求：",
        "1. 输出必须像可直接进入世界结构库的成稿，而不是分析说明。",
        "2. 每个字段都要具体、稳定、可供后续创作使用，避免“势力复杂”“地点危险”“关系紧张”这类空话。",
        "3. 优先补足真正影响世界运行和叙事推进的硬结构，不要被零碎细节带偏。",
        "4. 若当前 section 天然依赖其他 section，必须体现这种结构关联，而不是孤立书写。",
      ].join("\n")
    ),
    new HumanMessage(
      [
        input.promptSource,
        "",
        "当前结构：",
        JSON.stringify(input.currentStructure, null, 2),
        "",
        "当前绑定建议：",
        JSON.stringify(input.currentBindingSupport, null, 2),
      ].join("\n"),
    ),
  ],
  postValidate: (output, input) => normalizeWorldStructureSectionPayload(output, input),
};

export const worldAxiomSuggestionPrompt: PromptAsset<
  WorldAxiomSuggestionPromptInput,
  z.infer<typeof worldAxiomSuggestionSchema>
> = {
  id: "world.axioms.suggest",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldAxiomSuggestionSchema,
  render: (input) => [
    new SystemMessage([
      "你是世界公理设计器。",
      "你的任务是为当前世界生成 5 条“核心公理”，作为后续世界构建、设定补全和剧情展开的最高约束层。",
      "",
      "只输出一个合法 JSON 数组，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "数组元素必须全部是字符串，且全部使用简体中文。",
      "必须精确输出 5 条，不能多也不能少。",
      "",
      "全局硬规则：",
      "1. 每条公理都必须是“能约束后续生成”的硬规则，而不是口号、主题句或世界简介。",
      "2. 公理必须能直接影响后续世界搭建，例如限制代价、规定秩序、定义冲突来源、划定边界条件、明确默认后果。",
      "3. 只能基于输入中的世界类型、模板说明、世界摘要和蓝图约束来生成，不得脱离这些信息另起一套世界。",
      "4. 如果信息不足，优先生成低风险、通用但有约束力的公理，不要空泛发散。",
      "",
      "公理设计要求：",
      "1. 至少应覆盖以下关键约束中的大部分：代价、秩序、冲突来源、边界条件、默认后果、资源约束、权力限制、公开与隐秘规则。",
      "2. 每条公理都应回答“这个世界默认怎么运作，违反后会怎样，哪些事不能无代价发生”。",
      "3. 公理必须具体，例如可以约束力量使用、身份流动、资源获取、组织秩序、信息传播、社会压迫、越界代价等。",
      "4. 不要写成‘世界很残酷’‘人心复杂’‘强者为尊’这类空泛判断，除非它被具体化为可执行约束。",
      "5. 5 条公理之间尽量分工明确，不要换说法重复同一个意思。",
      "",
      "表达要求：",
      "1. 每条公理尽量写成一句完整、清楚、可直接引用的约束句。",
      "2. 不要写得太长，但必须足够具体，能拿去约束后续世界生成。",
      "3. 语言要像世界设定中的底层规则，而不是宣传文案或文学抒情。",
      "",
      "质量要求：",
      "1. 看完这 5 条，应该能大致理解这个世界的运行底线。",
      "2. 这些公理要能帮助后续自动生成避免跑偏、避免设定失真、避免无代价乱开。",
      "3. 不要生成互相冲突的公理。",
    ].join("\n")),
    new HumanMessage([
      `世界名=${input.worldName}`,
      `世界类型=${input.worldType}`,
      `模板=${input.templateName}`,
      `模板说明=${input.templateDescription}`,
      `世界摘要=${input.description}`,
      "蓝图约束：",
      input.blueprintPromptBlock,
    ].join("\n")),
  ],
};
