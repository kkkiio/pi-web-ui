Classic Linux IPv4 packet traversal through Netfilter hooks and routing (excluding XDP/tc):

<box border radius="xl" padding={3} gap={2}>
  <text weight="medium" textAlign="center">Linux IPv4 Packet Path</text>
  <box background="surface-secondary" radius="md" padding={2} align="center">
    <text weight="medium" size="sm">NIC receives IP packet</text>
  </box>
  <row justify="center"><icon name="arrow-down" color="secondary"/></row>
  <box border={{size: 1, color: "info"}} radius="md" padding={3} align="center" gap={1}>
    **PREROUTING Hook**
    <text size="xs" color="secondary">conntrack, DNAT, raw/mangle rules</text>
  </box>
  <row justify="center"><icon name="arrow-down" color="secondary"/></row>
  <box background="success" border={{size: 1, color: "success"}} radius="md" padding={3} align="center" gap={1}>
    **Routing Decision**
    <text size="xs">Policy Routing → Routing Table Lookup</text>
    <text size="xs" color="secondary">Local delivery or forward?</text>
  </box>
  <grid columns={2} gap={3}>
    <grid-item>
      <col align="center" gap={2}>
        <row align="center" gap={1}>
          <icon name="arrow-down" size="sm" color="secondary"/>
          <text size="xs">Local</text>
        </row>
        <box border={{size: 1, color: "info"}} radius="md" padding={3} width="100%" align="center" gap={1}>
          **INPUT Hook**
          <text color="secondary" size="xs" textAlign="center">Inbound filter rules</text>
        </box>
        <icon name="arrow-down" color="secondary"/>
        <box background="surface-secondary" radius="md" padding={3} width="100%" align="center">
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
        <box border={{size: 1, color: "info"}} radius="md" padding={3} width="100%" align="center" gap={1}>
          **FORWARD Hook**
          <text color="secondary" size="xs" textAlign="center">Forwarding rules</text>
        </box>
        <icon name="arrow-down" color="secondary"/>
        <box border={{size: 1, color: "info"}} radius="md" padding={3} width="100%" align="center" gap={1}>
          **POSTROUTING Hook**
          <text color="secondary" size="xs" textAlign="center">SNAT / masquerade</text>
        </box>
        <icon name="arrow-down" color="secondary"/>
        <box background="surface-secondary" radius="md" padding={3} width="100%" align="center">
          <text size="sm" weight="medium">Egress NIC</text>
        </box>
      </col>
    </grid-item>
  </grid>
  <row align="center" justify="center" gap={3} wrap>
    <row align="center" gap={1}>
      <box background="info" border={{size: 1, color: "info"}} radius="sm" width="12px" height="12px"/>
      <text color="secondary" size="xs">Netfilter Hook</text>
    </row>
    <row align="center" gap={1}>
      <box background="success" border={{size: 1, color: "success"}} radius="sm" width="12px" height="12px"/>
      <text color="secondary" size="xs">Routing</text>
    </row>
  </row>
</box>
