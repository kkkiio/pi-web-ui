{@body const [expanded,setExpanded] = DIL.useState(false)}
{@body const steps = [{name:"解析",ms:12},{name:"核验",ms:7},{name:"落库",ms:5}]}

<box border radius="lg" padding={3} gap={2}>
  <list marker="number">
    {#each steps as step, i}
      <list-item>
        <row justify="between">
          <text>{i + 1}. {step.name}</text>
          <text color="secondary" tabularNums>{step.ms} ms</text>
        </row>
      </list-item>
    {/each}
  </list>
  {#if expanded}
    <caption>共 {steps.length} 步，总计 24 ms</caption>
  {:else}
    <button onClick={() => setExpanded(true)}>展开明细</button>
  {/if}
</box>
