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
  quiz: `{@body const [first, setFirst] = DIL.useState("")}
{@body const [second, setSecond] = DIL.useState("")}
<box border padding={3} gap={3}>
  <title>JavaScript 原型链</title>
  <text>1. 读取一个对象自身没有的属性时，接下来去哪里找？</text>
  <radio-group value={first} onChange={setFirst}>
    <radio value="A">A. 沿对象的原型链查找</radio>
    <radio value="B">B. 在全局对象上查找</radio>
  </radio-group>
  <text>2. 用 Object.create(null) 创建的对象，其原型是什么？</text>
  <radio-group value={second} onChange={setSecond}>
    <radio value="A">A. Object.prototype</radio>
    <radio value="B">B. null</radio>
  </radio-group>
  {#if first && second}
    <button onClick={() => GenUI.issueNewTurn("请批改原型链测验。第 1 题：" + first + "；第 2 题：" + second)}>交卷</button>
  {/if}
</box>`,
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
