import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import {
  type WorldAxiomSuggestionPromptInput,
  type WorldConsistencyPromptInput,
  type WorldDeepeningQuestionsPromptInput,
  type WorldLayerGenerationPromptInput,
  type WorldLayerLocalizationPromptInput,
} from "../world.promptTypes";
import {
  worldAxiomSuggestionSchema,
  worldConsistencyIssuesSchema,
  worldDeepeningQuestionsSchema,
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

export const worldDeepeningQuestionsPrompt: PromptAsset<
  WorldDeepeningQuestionsPromptInput,
  z.infer<typeof worldDeepeningQuestionsSchema>
> = {
  id: "world.deepening.questions",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldDeepeningQuestionsSchema,
  render: (input) => [
    new SystemMessage([
      "你是世界观补全提问器。",
      "你的任务是基于当前世界设定，挑出最值得优先追问的 2-3 个关键补全问题，帮助后续世界生成继续往下走。",
      "",
      "只输出一个合法 JSON 数组，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "每个数组项必须严格使用以下结构：",
      "{",
      '  "priority":"required|recommended|optional",',
      '  "question":"...",',
      '  "quickOptions":["...", "...", "..."],',
      '  "targetLayer":"foundation|power|society|culture|history|conflict",',
      '  "targetField":"..."',
      "}",
      "",
      "全局硬规则：",
      "1. 只能输出 2-3 个问题，不得少于 2 个，不得多于 3 个。",
      "2. 所有文本必须使用简体中文。",
      "3. 只能基于输入中的世界名称、描述、已有数据和可用参考素材来提问，不得凭空发散到无关方向。",
      "4. 问题必须是“继续生成世界前最值得先问的缺口”，而不是泛泛聊天问题。",
      "",
      "问题设计要求：",
      "1. 每个问题都必须指向一个真正会影响后续世界搭建方向的关键缺口。",
      "2. 优先提问最能决定世界走向、规则形态、社会结构、冲突来源或历史底板的问题。",
      "3. 不要问太宽的问题，例如“你还想补充什么”“这个世界还有什么特点”。",
      "4. 不要问角色动机、具体剧情桥段、感情推进这类故事层问题，除非它直接影响世界层结构。",
      "",
      "priority 规则：",
      "1. required：缺了这个问题，后续世界生成容易跑偏或塌掉。",
      "2. recommended：补上会明显提升世界完整度与可写性，但短期缺失仍可继续。",
      "3. optional：属于锦上添花型补充，不是当前最硬缺口。",
      "",
      "question 规则：",
      "1. 必须写成用户一看就能回答的自然问题。",
      "2. 问法要具体、清楚，不要用抽象术语。",
      "3. 每个问题都应尽量只问一个核心点，不要把多个问题塞进一句话。",
      "",
      "quickOptions 规则：",
      "1. 必须提供 2-4 个简洁候选答案，全部使用简体中文。",
      "2. quickOptions 应该帮助用户快速选择方向，而不是重复 question。",
      "3. 不同选项之间必须体现真实分叉，不能只是同义改写。",
      "4. 选项要短、准、可直接点选，不要写成长句分析。",
      "",
      "targetLayer 规则：",
      "1. 只能从 foundation、power、society、culture、history、conflict 中选择。",
      "2. 必须准确对应这个问题主要作用于哪一层世界结构。",
      "",
      "targetField 规则：",
      "1. 必须写清这个问题要补的是哪个具体字段或决策点。",
      "2. targetField 要简洁稳定，适合后续系统消费，例如“规则公开程度”“力量来源”“社会控制方式”“历史断层原因”。",
      "",
      "选择优先级原则：",
      "1. 优先挑“最少提问、最大增益”的问题。",
      "2. 若已有 dataJson 已经较完整，就不要重复问已明确的信息。",
      "3. 若 ragContext 提供了强参考方向，可以优先追问那些会决定参考素材如何落地的关键分叉。",
      "4. 2-3 个问题之间尽量分布在不同层级，不要全部挤在同一层，除非某一层确实是当前最大缺口。",
      "",
      "质量要求：",
      "1. 输出的问题要让用户感觉“这几个问题确实问到了点子上”。",
      "2. 不要为了凑数量提价值很低的问题。",
      "3. 整体结果必须能直接用于下一步世界补全流程。",
    ].join("\n")),
    new HumanMessage([
      `世界名称：${input.worldName}`,
      `世界描述：${input.description || "无"}`,
      `当前数据：${input.dataJson}`,
      `可用参考素材：${input.ragContext || "无"}`,
    ].join("\n")),
  ],
};

export const worldConsistencyPrompt: PromptAsset<
  WorldConsistencyPromptInput,
  z.infer<typeof worldConsistencyIssuesSchema>
> = {
  id: "world.consistency.check",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldConsistencyIssuesSchema,
  render: (input) => [
    new SystemMessage([
      "你是世界观一致性审校器。",
      "你的任务是检查当前世界设定是否存在明确冲突、规则打架或高风险不一致点，并输出结构化问题列表。",
      "",
      "只输出一个合法 JSON 数组，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "如果没有问题，只输出 []。",
      "",
      "每项结构必须严格为：",
      '{"severity":"warn|error","code":"...","message":"中文问题概述","detail":"中文详细说明","targetField":"description|background|geography|cultures|magicSystem|politics|races|religions|technology|conflicts|history|economy|factions"}',
      "",
      "全局硬规则：",
      "1. message 和 detail 必须使用简体中文。",
      "2. 只能基于给定世界公理、核心设定和检索补充进行判断，不得脑补未提供的设定。",
      "3. 只指出真正的冲突或明显风险，不要泛泛而谈，不要为了凑数量制造问题。",
      "4. 如果证据不足，不要强行判定为问题。",
      "",
      "审校重点：",
      "1. 世界公理与具体设定是否冲突。",
      "2. 不同字段之间是否存在规则打架、因果断裂或层级不兼容。",
      "3. 设定是否会导致明显不可运行、不可持续或互相抵消的结构风险。",
      "4. 地理、政治、经济、宗教、种族、技术、魔法、历史、冲突体系之间是否存在显著不自洽。",
      "",
      "severity 规则：",
      "1. error：存在明确冲突、无法同时成立、或会直接破坏世界运行逻辑的问题。",
      "2. warn：当前未必绝对冲突，但存在明显高风险、解释缺口或后续极易写崩的点。",
      "",
      "字段要求：",
      "1. code：使用简洁稳定、可复用的英文或下划线风格问题编码，不要写成长句。",
      "2. message：一句话点明问题核心，让人一眼看懂哪里冲突。",
      "3. detail：具体说明为什么这是问题，冲突发生在哪两层或哪几个字段之间。",
      "4. targetField：必须从以下字段中选择最主要的问题落点：description、background、geography、cultures、magicSystem、politics、races、religions、technology、conflicts、history、economy、factions。",
      "",
      "质量要求：",
      "1. 优先输出最关键、最会影响后续世界生成和写作的问题。",
      "2. 若多个问题本质相同，应合并，不要重复报同一类风险。",
      "3. detail 必须具体，不能只重复 message。",
      "4. 输出结果必须可直接供后续修正流程使用。",
    ].join("\n")),
    new HumanMessage([
      `世界名：${input.worldName}`,
      `世界公理：${input.axioms || "无"}`,
      `核心设定：${input.coreSettingsJson}`,
      `检索补充：${input.ragContext || "无"}`,
    ].join("\n")),
  ],
};

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
