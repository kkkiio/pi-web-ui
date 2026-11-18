{@body const [window,setWindow] = DIL.useState("5m")}

<box border radius="lg" padding={3} gap={3}>
  <row align="center" justify="between">
    <text weight="medium">本周实验</text>
    <badge color="success">进行中</badge>
  </row>
  <grid columns={3} gap={2}>
    <grid-item><box background="surface-secondary" padding={2} gap={1}>
      <caption>曝光</caption>
      <title size="lg">{exposure}</title>
    </box></grid-item>
    <grid-item><box background="surface-secondary" padding={2} gap={1}>
      <caption>点击率</caption>
      <title size="lg">{ctr}%</title>
    </box></grid-item>
    <grid-item><box background="surface-secondary" padding={2} gap={1}>
      <caption>样本</caption>
      <title size="lg">{samples}</title>
    </box></grid-item>
  </grid>
  <row align="center" gap={2}>
    <icon name="clock" color="tertiary"/>
    <text size="xs" color="secondary">统计窗口 {window}</text>
    <button onClick={() => setWindow(window === "5m" ? "1h" : "5m")}>切换</button>
  </row>
</box>
