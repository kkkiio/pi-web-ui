You can debug the web app on the tablet over Wi-Fi via wireless ADB, keeping its USB-C port free for MIDI input:

<box border radius="xl" padding={3} gap={2} align="center">
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center" gap={1}>
    <icon name="laptop" size="2xl"/>
    **Laptop**
    <text color="secondary" size="xs">Code editor · Dev server · Chrome DevTools</text>
  </box>
  <row align="center" gap={2}>
    <icon name="wifi" color="success"/>
    <text size="sm" weight="medium">Wi-Fi / Wireless ADB</text>
    <icon name="arrow-left-right" color="secondary"/>
  </row>
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center" gap={1}>
    <icon name="tablet" size="2xl"/>
    **Android Tablet**
    <text color="secondary" size="xs">Chrome running piano app · USB MIDI host</text>
  </box>
  <row align="center" gap={2}>
    <icon name="cable" color="secondary"/>
    <text size="sm">USB-C cable</text>
  </row>
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center" gap={1}>
    <icon name="piano" size="2xl"/>
    **MIDI Keyboard**
    <text color="secondary" size="xs">Key presses → MIDI events → Tablet</text>
  </box>
</box>

Inspect console logs, MIDI events, DOM/CSS, and network traffic directly from Chrome DevTools on the laptop.
