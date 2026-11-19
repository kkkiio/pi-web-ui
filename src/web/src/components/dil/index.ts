/**
 * DIL renderer entry point.
 *
 * `DilRenderer` is the component the message view mounts; everything else is exported so
 * later slices (#47 SVG, #48 controls, #49 document/data primitives) can extend the
 * catalog without reaching into internals.
 */

export type { DilRendererProps } from "./dil-renderer";
export { DilRenderer, useThrottledText } from "./dil-renderer";
export * from "./primitives/content";
export { ControlButton, ControlLabel, ControlRadio, ControlRadioGroup, ControlTextarea } from "./primitives/controls";
export { Box, Col, Divider, Grid, GridItem, Row } from "./primitives/layout";
export { Badge, Bold, Caption, Icon, InlineCode, Italic, Text, Title } from "./primitives/typography";
export type { ResolvedNode, ResolvedProps } from "./resolve";
export { resolveAttributes, resolveNodes } from "./resolve";
export type { DilHost } from "./runtime";
export { DilHostContext } from "./runtime-context";
export type { Skin } from "./tokens";
export { iconComponentName, layoutSkin, safeLinkUrl, textSkin } from "./tokens";
