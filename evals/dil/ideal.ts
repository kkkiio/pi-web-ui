/**
 * Hand-written "ideal" answers, one per case.
 *
 * They exist so the scorer can be tested without a model: each answer must pass every
 * check of its case, which keeps the checks both satisfiable and discriminating. They
 * also read as examples of the shape each prompt is asking for.
 */

export const IDEAL_ANSWERS: Record<string, string> = {
  states: `<col gap={2}>
  {#each [
    ["Untracked", "Staged", "git add"],
    ["Modified", "Staged", "git add"],
    ["Staged", "Committed", "git commit"],
    ["Committed", "Pushed", "git push"]
  ] as step}
    <row gap={2} align="center">
      <box border padding={1} width="120px"><text>{step[0]}</text></box>
      <icon name="arrow-right"/>
      <box border padding={1} width="120px"><text>{step[1]}</text></box>
      <code>{step[2]}</code>
    </row>
  {/each}
</col>`,
  quiz: `{@body const [first, setFirst] = DIL.useState("")}
{@body const [second, setSecond] = DIL.useState("")}
<box border padding={3} gap={3}>
  <title>数据库事务入门测验</title>
  <text>1. 一笔转账在同一个事务里扣款和入账。入账失败后，事务回滚了扣款。这体现了哪项 ACID 特性？</text>
  <radio-group value={first} onChange={setFirst}>
    <radio value="A">A. 原子性</radio>
    <radio value="B">B. 隔离性</radio>
    <radio value="C">C. 持久性</radio>
  </radio-group>
  <text>2. 数据库确认订单事务提交成功后进程崩溃，重启后仍能查到这笔订单。这体现了哪项 ACID 特性？</text>
  <radio-group value={second} onChange={setSecond}>
    <radio value="A">A. 隔离性</radio>
    <radio value="B">B. 持久性</radio>
    <radio value="C">C. 原子性</radio>
  </radio-group>
  {#if first && second}
    <button onClick={() => GenUI.issueNewTurn("请批改数据库事务测验。第 1 题：" + first + "；第 2 题：" + second)}>交卷</button>
  {/if}
</box>`,
  "codemode-sandbox": `<box border padding={2}>
  <badge>宿主进程</badge>
  <row gap={2}>
    <box border padding={2}><text>隔离环境中的模型代码</text></box>
    <icon name="arrow-right"/>
    <box background="surface-secondary" padding={2}><text>由宿主转发工具调用</text></box>
  </row>
</box>`,
  "pi-system-prompt-construct": `<row gap={0}>
  <box width="60%" padding={2} background="#dbeafe"><text>内置指令与工具定义 60%</text></box>
  <box width="40%" padding={2} background="#fce7f3"><text>项目与技能上下文 40%</text></box>
</row>`,
};
