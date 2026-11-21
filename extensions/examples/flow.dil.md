Incoming IPv4 packets traverse Netfilter hooks and routing (excluding XDP/tc):

<box border radius="xl" padding={3} gap={2}>
  <title textAlign="center">Linux IPv4 Packet Path</title>
  <box border={{size: 1, color: "info"}} radius="md" padding={{x: 3, y: 2}} align="center" gap={1}>
    **PREROUTING Hook**
    <text size="xs" color="secondary">conntrack, DNAT, raw/mangle</text>
  </box>
  <row justify="center"><icon name="arrow-down" color="secondary"/></row>
  <box background="success" border={{size: 1, color: "success"}} radius="md" padding={{x: 3, y: 2}} align="center" gap={1}>
    **Routing Decision**
    <text size="xs" color="secondary">Local delivery or forward?</text>
  </box>
  <grid columns={2} gap={3}>
    <grid-item>
      <col align="center" gap={2}>
        <row align="center" gap={1}>
          <icon name="arrow-down" size="sm" color="secondary"/>
          <text size="xs">Local</text>
        </row>
        <box border={{size: 1, color: "info"}} radius="md" padding={2} width="100%" align="center" gap={1}>
          **INPUT Hook**
          <text color="secondary" size="xs" textAlign="center">Inbound filter</text>
        </box>
        <icon name="arrow-down" color="secondary"/>
        <box background="surface-secondary" radius="md" padding={2} width="100%" align="center">
          <text size="sm" weight="medium">Local Socket / App</text>
        </box>
      </col>
    </grid-item>
    <grid-item>
      <col align="center" gap={2}>
        <row align="center" gap={1}>
          <icon name="arrow-down" size="sm" color="secondary"/>
          <text size="xs">Forward</text>
        </row>
        <box border={{size: 1, color: "info"}} radius="md" padding={2} width="100%" align="center" gap={1}>
          **FORWARD → POSTROUTING**
          <text color="secondary" size="xs" textAlign="center">Filter, SNAT / masquerade</text>
        </box>
        <icon name="arrow-down" color="secondary"/>
        <box background="surface-secondary" radius="md" padding={2} width="100%" align="center">
          <text size="sm" weight="medium">Egress NIC</text>
        </box>
      </col>
    </grid-item>
  </grid>
</box>
