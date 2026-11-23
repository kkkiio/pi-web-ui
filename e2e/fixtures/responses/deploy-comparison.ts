import { fauxAssistantMessage } from "@earendil-works/pi-ai";

export default [
  fauxAssistantMessage(
    `
<grid columns="auto" gap={3}>
  <grid-item>
    <box border radius="xl" padding={4} gap={3} height="100%">
      <box gap={1}>
        <title size="lg">Rolling deploy</title>
        <text size="sm" color="secondary">Replace instances in the same pool.</text>
      </box>
      <box background="muted" radius="lg" padding={3} gap={2}>
        {#each [["Start", ["v1", "v1", "v1"]], ["Mid-rollout", ["v2", "v1", "v1"]], ["Done", ["v2", "v2", "v2"]]] as [stage, versions]}
          <row align="center" gap={2}>
            <text size="xs" weight="medium" width="76px">{stage}</text>
            <row gap={1} flex={1}>
              {#each versions as version}
                <box background={version === "v1" ? "info" : "success"} border={{color: version === "v1" ? "info" : "success"}} radius="sm" align="center" justify="center" flex={1} minHeight="32px">
                  <text size="xs" weight="semibold">{version}</text>
                </box>
              {/each}
            </row>
          </row>
        {/each}
      </box>
      <text size="sm">Old and new versions can serve traffic during the rollout.</text>
    </box>
  </grid-item>
  <grid-item>
    <box border radius="xl" padding={4} gap={3} height="100%">
      <box gap={1}>
        <title size="lg">Blue-green deploy</title>
        <text size="sm" color="secondary">Bring up a second pool before switching.</text>
      </box>
      <box background="muted" radius="lg" padding={3} gap={2}>
        <row align="center" gap={2}>
          <text size="xs" weight="medium" width="76px">Blue pool</text>
          <row gap={1} flex={1}>
            {#each [1, 2, 3] as instance}
              <box background="info" border={{color: "info"}} radius="sm" align="center" justify="center" flex={1} minHeight="32px">
                <text size="xs" weight="semibold">v1</text>
              </box>
            {/each}
          </row>
        </row>
        <row align="center" justify="center" gap={1} minHeight="32px">
          <icon name="arrow-down" size="sm"/>
          <text size="xs" weight="semibold">Switch traffic</text>
        </row>
        <row align="center" gap={2}>
          <text size="xs" weight="medium" width="76px">Green pool</text>
          <row gap={1} flex={1}>
            {#each [1, 2, 3] as instance}
              <box background="success" border={{color: "success"}} radius="sm" align="center" justify="center" flex={1} minHeight="32px">
                <text size="xs" weight="semibold">v2</text>
              </box>
            {/each}
          </row>
        </row>
      </box>
      <text size="sm">Both pools are ready when traffic moves from blue to green.</text>
    </box>
  </grid-item>
</grid>
`.trim(),
  ),
];
