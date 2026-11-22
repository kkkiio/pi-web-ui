{@body const options = ["Mark overwrites", "Show new files only", "Fail if a file exists"]}
{@body const [choice, setChoice] = DIL.useState(0, { key: "overwrite" })}
<box border radius="xl" padding={3} gap={2}>
  <title>What should `--dry-run` report when a file already exists?</title>
  <radio-group value={choice} onChange={setChoice}>
    {#each options as option, i}
      <radio value={i}>{option}{i === 0 ? " (Recommended)" : ""}</radio>
    {/each}
  </radio-group>
  <box background="muted" radius="md" padding={2} gap={1}>
    <caption>Example output</caption>
    {#if choice === 2}
      <text>`error: reports/summary.csv already exists`</text>
    {:else}
      {#if choice === 0}<text>`reports/summary.csv  overwrite`</text>{/if}
      <text>`reports/orders.json  new`</text>
    {/if}
  </box>
  <button onClick={() => GenUI.issueNewTurn(`Dry-run behavior for existing export files: ${options[choice]}.`)}>Submit choice</button>
</box>
