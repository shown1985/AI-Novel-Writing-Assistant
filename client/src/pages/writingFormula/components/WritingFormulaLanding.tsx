import type { KeyboardEvent, ReactNode } from "react";
import { BookOpenText, FlaskConical, Pencil, Plus, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LandingProfileItem } from "../writingFormulaLandingItems";

interface WritingFormulaLandingProps {
  onOpenCreate: () => void;
  onSelectProfile: (profileId: string) => void;
  onEditProfile: (profileId: string) => void;
  onOpenWorkbench: (profileId: string) => void;
  onUseProfileForClean: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onOpenPromptLab: () => void;
  deletePending: boolean;
  profileItems: LandingProfileItem[];
  selectedProfileId: string;
}

function truncateText(value: string | null | undefined, maxLength: number): string {
  const text = value?.trim() ?? "";
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function handleSelectableKeyDown(event: KeyboardEvent<HTMLDivElement>, onSelect: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelect();
}

function SectionHeading(props: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
      {props.description ? <p className="text-xs leading-5 text-muted-foreground">{props.description}</p> : null}
    </div>
  );
}

function MetaItem(props: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 py-3">
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="mt-1 break-words text-sm font-medium leading-6 text-foreground">{props.value}</dd>
    </div>
  );
}

function RulePanel(props: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="max-w-4xl space-y-5 py-2">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">{props.title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{props.description}</p>
      </div>
      <div className="rounded-xl bg-muted/40 px-5 py-4 text-sm leading-7 text-foreground [overflow-wrap:anywhere]">
        {props.children}
      </div>
    </div>
  );
}

function ProfileListItem(props: { profile: LandingProfileItem; selected: boolean; onSelect: () => void }) {
  const { profile, selected, onSelect } = props;
  const originLabel = profile.isStarter ? "官方起步" : profile.originLabel;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => handleSelectableKeyDown(event, onSelect)}
      className={`cursor-pointer rounded-xl px-3.5 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
        selected
          ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
          : "text-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{profile.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className={profile.isStarter ? "bg-primary/10 text-primary" : ""}>
              {originLabel}
            </Badge>
            {profile.category ? <span className="text-xs text-muted-foreground">{profile.category}</span> : null}
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {profile.bindingCount > 0 ? `已用 ${profile.bindingCount}` : "未应用"}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
        {truncateText(profile.summaryLine, 86) || "还没有补充读感说明。"}
      </p>
      {profile.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {profile.tags.slice(0, 3).map((tag) => <span key={`${profile.id}-${tag}`}>#{tag}</span>)}
        </div>
      ) : null}
    </div>
  );
}

function ProfileListSection(props: {
  title: string;
  description: string;
  profiles: LandingProfileItem[];
  selectedProfileId: string;
  onSelectProfile: (profileId: string) => void;
  empty?: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-start justify-between gap-3 px-1">
        <SectionHeading title={props.title} description={props.description} />
        <span className="shrink-0 text-xs text-muted-foreground">{props.profiles.length} 套</span>
      </div>
      {props.profiles.length > 0 ? (
        <div className="space-y-1.5">
          {props.profiles.map((profile) => (
            <ProfileListItem
              key={profile.id}
              profile={profile}
              selected={profile.id === props.selectedProfileId}
              onSelect={() => props.onSelectProfile(profile.id)}
            />
          ))}
        </div>
      ) : props.empty ? (
        <div className="rounded-xl bg-background/70 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
          {props.empty}
        </div>
      ) : null}
    </section>
  );
}

function ProfileDetail(props: {
  profile: LandingProfileItem;
  onEdit: () => void;
  onOpenWorkbench: () => void;
  onUseForClean: () => void;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const { profile } = props;
  const originLabel = profile.isStarter ? "官方起步写法" : profile.originLabel;
  const sourceLabel = profile.isStarter ? "官方预置" : profile.sourceTypeLabel;
  const maturityLabel = profile.extractedFeatureCount > 0
    ? `已细化 ${profile.extractedFeatureCount} 项特征`
    : profile.isStarter
      ? "可直接使用的起步骨架"
      : "基础写法，可继续细化";

  return (
    <section className="flex min-w-0 flex-col" aria-labelledby="selected-style-profile-title">
      <header className="border-b border-border/70 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className={profile.isStarter ? "bg-primary/10 text-primary" : ""}>
            {originLabel}
          </Badge>
          <Badge variant="outline">{sourceLabel}</Badge>
          {profile.category ? <Badge variant="outline">{profile.category}</Badge> : null}
        </div>
        <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 max-w-3xl space-y-2">
            <h2 id="selected-style-profile-title" className="break-words text-2xl font-semibold tracking-tight text-foreground">
              {profile.name}
            </h2>
            <p className="text-sm leading-7 text-muted-foreground [overflow-wrap:anywhere]">{profile.description}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={props.onEdit}>
              <Pencil className="h-4 w-4" aria-hidden="true" />编辑设定
            </Button>
            <Button type="button" size="sm" onClick={props.onOpenWorkbench}>
              <FlaskConical className="h-4 w-4" aria-hidden="true" />应用与测试
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={props.onUseForClean}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />去 AI 味
            </Button>
          </div>
        </div>
      </header>

      <Tabs key={profile.id} defaultValue="overview" className="min-w-0 flex-1">
        <div className="overflow-x-auto border-b border-border/70 px-5 sm:px-7">
          <TabsList className="h-11 w-max justify-start rounded-none bg-transparent p-0">
            {[
              ["overview", "概览"],
              ["narrative", "剧情推进"],
              ["character", "人物表达"],
              ["language", "语言质感"],
              ["rhythm", "节奏控制"],
              ["anti-ai", "反 AI 约束"],
            ].map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-11 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <TabsContent value="overview" className="mt-0">
            <div className="max-w-5xl space-y-7">
              <section className="space-y-3">
                <SectionHeading title="这套写法会带来什么读感" description="先确认它是否符合你想让读者获得的体验，再决定应用到小说。" />
                <div className="rounded-xl bg-primary/[0.055] px-5 py-4 text-sm leading-7 text-foreground [overflow-wrap:anywhere]">
                  {profile.summaryLine || profile.description}
                </div>
                {profile.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.tags.map((tag) => <Badge key={`${profile.id}-overview-${tag}`} variant="outline">{tag}</Badge>)}
                  </div>
                ) : null}
              </section>

              <section className="space-y-2">
                <SectionHeading title="资产状态" description="帮助你判断它是否已经适合投入当前作品。" />
                <dl className="grid divide-y divide-border/70 sm:grid-cols-2 sm:gap-x-8 sm:[&>*:nth-child(2n)]:border-l sm:[&>*:nth-child(2n)]:pl-8">
                  <MetaItem label="成熟度" value={maturityLabel} />
                  <MetaItem label="绑定情况" value={profile.bindingCount > 0 ? `已应用到 ${profile.bindingCount} 个目标` : "还没有应用到作品"} />
                  <MetaItem label="适用题材" value={profile.applicableGenres.length > 0 ? profile.applicableGenres.join(" / ") : "未指定题材"} />
                  <MetaItem label="最近使用" value={profile.recentNovelTitle || "还没有绑定到小说"} />
                  <MetaItem label="当前预设" value={profile.selectedPresetLabel || "沿用默认规则"} />
                  <MetaItem label="最近更新" value={profile.updatedAtLabel} />
                </dl>
              </section>

              {profile.sourceContentPreview ? (
                <details className="group border-t border-border/70 pt-4">
                  <summary className="cursor-pointer text-sm font-medium text-foreground marker:text-muted-foreground">查看来源样本片段</summary>
                  <p className="mt-3 rounded-xl bg-muted/40 px-5 py-4 text-sm leading-7 text-muted-foreground [overflow-wrap:anywhere]">
                    {profile.sourceContentPreview}
                  </p>
                </details>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
                <p className="text-xs leading-5 text-muted-foreground">
                  {profile.isStarter ? "官方起步写法可以编辑成更适合当前作品的版本。" : "删除后无法恢复，请确认这套写法不再需要。"}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  disabled={props.deletePending}
                  onClick={props.onDelete}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {props.deletePending ? "删除中..." : "删除这套写法"}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="narrative" className="mt-0">
            <RulePanel title="剧情推进" description="控制场景如何变化、冲突怎样升级，以及每一段给读者什么进展。">{profile.narrativeSummary}</RulePanel>
          </TabsContent>
          <TabsContent value="character" className="mt-0">
            <RulePanel title="人物表达" description="控制角色如何说话、行动和外露情绪，让人物反应保持一致。">{profile.characterSummary}</RulePanel>
          </TabsContent>
          <TabsContent value="language" className="mt-0">
            <RulePanel title="语言质感" description="控制句式、措辞和细节密度，决定文字读起来是什么触感。">{profile.languageSummary}</RulePanel>
          </TabsContent>
          <TabsContent value="rhythm" className="mt-0">
            <RulePanel title="节奏控制" description="控制段落密度、推进速度和停顿，让章节张弛符合预期。">{profile.rhythmSummary}</RulePanel>
          </TabsContent>
          <TabsContent value="anti-ai" className="mt-0">
            <div className="max-w-4xl space-y-6 py-2">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">反 AI 约束</h3>
                <p className="text-sm leading-6 text-muted-foreground">这些约束会在检测和修正文稿时，优先处理最容易破坏真实读感的问题。</p>
              </div>
              {profile.antiAiFocus.length > 0 ? (
                <div className="space-y-2 rounded-xl bg-amber-500/[0.08] px-5 py-4">
                  {profile.antiAiFocus.map((line) => (
                    <div key={`${profile.id}-${line}`} className="flex gap-3 text-sm leading-7 text-foreground">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                      <span className="[overflow-wrap:anywhere]">{line}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-muted/40 px-5 py-4 text-sm leading-7 text-muted-foreground">
                  这套写法还没有明确的反 AI 约束，可以在“编辑设定”中补充。
                </div>
              )}
              {profile.antiAiRuleNames.length > 0 ? (
                <div className="space-y-3">
                  <SectionHeading title="已启用规则" />
                  <div className="flex flex-wrap gap-2">
                    {profile.antiAiRuleNames.map((ruleName) => <Badge key={`${profile.id}-${ruleName}`} variant="secondary">{ruleName}</Badge>)}
                  </div>
                </div>
              ) : null}
              {profile.extractionAntiAiRecommendationCount > 0 ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  提取阶段还建议了 {profile.extractionAntiAiRecommendationCount} 条规则，可在编辑时继续确认。
                </p>
              ) : null}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

export default function WritingFormulaLanding(props: WritingFormulaLandingProps) {
  const customProfiles = props.profileItems.filter((item) => !item.isStarter);
  const starterProfiles = props.profileItems.filter((item) => item.isStarter);
  const selectedProfile = props.profileItems.find((item) => item.id === props.selectedProfileId) ?? props.profileItems[0] ?? null;

  return (
    <div className="space-y-5">
      <section className="space-y-5 rounded-2xl bg-card px-5 py-6 sm:px-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary">
              <WandSparkles className="h-4 w-4" aria-hidden="true" />我的写法资产
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">先选写法，再让 AI 按这套方式创作</h1>
            <p className="text-sm leading-7 text-muted-foreground">
              左侧选择一套写法，右侧查看它的读感和规则。确认合适后，可以应用到小说或先试写一段。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={props.onOpenPromptLab}>
              <BookOpenText className="h-4 w-4" aria-hidden="true" />正文效果实验室
            </Button>
            <Button type="button" onClick={props.onOpenCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />新建一套写法
            </Button>
          </div>
        </div>
        <div className="flex gap-3 rounded-xl bg-primary/[0.055] px-4 py-3 text-sm leading-6 text-muted-foreground">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>为整本小说设置默认写法，请从小说基础信息进入；这里用于挑选、维护和试写写法资产。</span>
        </div>
      </section>

      {props.profileItems.length === 0 ? (
        <section className="rounded-2xl bg-card px-6 py-12 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <WandSparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">创建第一套写法</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
            只需要描述想要的读感，AI 会帮你整理剧情、人物、语言和节奏规则。
          </p>
          <Button type="button" className="mt-5" onClick={props.onOpenCreate}>新建一套写法</Button>
        </section>
      ) : (
        <div className="grid min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-background lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="border-b border-border/70 bg-muted/20 lg:border-b-0 lg:border-r" aria-label="写法资产列表">
            <div className="border-b border-border/70 px-4 py-4">
              <h2 className="text-sm font-semibold text-foreground">选择写法</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">切换左侧资产，右侧内容会随之更新。</p>
            </div>
            <div className="max-h-[420px] space-y-6 overflow-y-auto px-3 py-4 lg:max-h-[calc(100vh-17rem)] lg:min-h-[560px]">
              <ProfileListSection
                title="我的写法"
                description="你创建、提取或从拆书生成的写法"
                profiles={customProfiles}
                selectedProfileId={selectedProfile?.id ?? ""}
                onSelectProfile={props.onSelectProfile}
                empty={(
                  <button type="button" className="text-left text-primary hover:underline" onClick={props.onOpenCreate}>
                    还没有自己的写法，创建一套或先使用下方官方起步写法。
                  </button>
                )}
              />
              <ProfileListSection
                title="官方起步写法"
                description="随应用提供，可直接使用和调整"
                profiles={starterProfiles}
                selectedProfileId={selectedProfile?.id ?? ""}
                onSelectProfile={props.onSelectProfile}
              />
            </div>
          </aside>

          {selectedProfile ? (
            <ProfileDetail
              profile={selectedProfile}
              onEdit={() => props.onEditProfile(selectedProfile.id)}
              onOpenWorkbench={() => props.onOpenWorkbench(selectedProfile.id)}
              onUseForClean={() => props.onUseProfileForClean(selectedProfile.id)}
              onDelete={() => props.onDeleteProfile(selectedProfile.id)}
              deletePending={props.deletePending}
            />
          ) : (
            <section className="flex min-h-[420px] items-center justify-center px-6 py-12 text-center">
              <div className="max-w-md">
                <WandSparkles className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <h2 className="mt-3 text-lg font-semibold text-foreground">选择一套写法查看详情</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">你会在这里看到读感定位、写法规则、反 AI 约束和应用情况。</p>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
