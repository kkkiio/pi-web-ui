/**
 * Hand-written "ideal" answers, one per case.
 *
 * They exist so the scorer can be tested without a model: each answer must pass every
 * check of its case, which keeps the checks both satisfiable and discriminating. They
 * also read as examples of the shape each prompt is asking for.
 */

export const IDEAL_ANSWERS: Record<string, string> = {
  states: `Git 工作区有五个主要状态：

<grid columns={2} gap={2}>
  <box><text>Untracked → Staged</text><code>git add</code></box>
  <box><text>Staged → Committed</text><code>git commit</code></box>
  <box><text>Modified → Staged</text><code>git add</code></box>
  <box><text>Committed → Pushed</text><code>git push</code></box>
</grid>

<badge color="success">可逆：Staged → Untracked</badge>`,
  "codemode-sandbox": `<box border padding={2}>
  <badge>宿主进程</badge>
  <row gap={2}>
    <box border padding={2}><text>隔离环境中的模型代码</text></box>
    <icon name="arrow-right"/>
    <text>由宿主转发工具调用</text>
  </row>
</box>`,
  "pi-system-prompt-construct": `<box padding={2}>
  <row justify="between"><text>内置指令与工具定义</text><text>60%</text></row>
  <box width="60%" background="muted"><text>基础指令</text></box>
  <row justify="between"><text>项目与技能上下文</text><text>40%</text></row>
  <box width="40%" background="muted"><text>项目上下文</text></box>
</box>`,
};
