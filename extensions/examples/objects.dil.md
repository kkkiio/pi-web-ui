Debug the piano web app over wireless ADB, keeping the tablet's USB-C port free for MIDI:

<box border radius="xl" padding={3}>
  <row align="center" justify="center" gap={2} wrap>
    <box background="surface-secondary" radius="lg" padding={3} flex="1" align="center" gap={1}>
      <icon name="laptop" size="2xl"/>
      **Laptop**
      <text color="secondary" size="xs" textAlign="center">Dev server · DevTools</text>
    </box>
    <col align="center" gap={1}>
      <icon name="wifi" color="success"/>
      <text size="2xs" color="secondary">Wireless ADB</text>
    </col>
    <box background="surface-secondary" radius="lg" padding={3} flex="1" align="center" gap={1}>
      <icon name="tablet" size="2xl"/>
      **Android Tablet**
      <text color="secondary" size="xs" textAlign="center">Chrome · USB MIDI host</text>
    </box>
    <col align="center" gap={1}>
      <icon name="cable" color="secondary"/>
      <text size="2xs" color="secondary">USB-C</text>
    </col>
    <box background="surface-secondary" radius="lg" padding={3} flex="1" align="center" gap={1}>
      <icon name="piano" size="2xl"/>
      **MIDI Keyboard**
      <text color="secondary" size="xs" textAlign="center">Key → MIDI events</text>
    </box>
  </row>
</box>
