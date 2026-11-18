import { fauxAssistantMessage } from "@earendil-works/pi-ai";

/**
 * A parametric SVG diagram: `{#each}` rows and columns with arithmetic coordinates, a
 * marker declared in `<defs>` and referenced from a `<line>`. It is the shape `#47`
 * promises, so the scenario can assert geometry, not just "some layout appeared".
 */
const diagram = () =>
  fauxAssistantMessage(
    [
      "## Tile 布局",
      "",
      '<svg viewBox="0 0 300 130" width="100%">',
      "  <defs>",
      '    <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">',
      '      <path d="M0 0 L6 3 L0 6 Z" fill="currentColor"/>',
      "    </marker>",
      "  </defs>",
      "  {#each Array.from({ length: 4 }) as r}",
      "    {#each Array.from({ length: 8 }) as c}",
      '      <rect x={30 + c * 32} y={10 + r * 24} width="28" height="20" rx="3" fill={c % 2 === 0 ? "#83b4e2" : "#abcbed"} fillOpacity=".85"/>',
      "    {/each}",
      "  {/each}",
      '  <line x1="20" y1="108" x2="280" y2="108" stroke="currentColor" markerEnd="url(#arrow)"/>',
      '  <text x="150" y="124" fontSize="9" textAnchor="middle" fill="currentColor">4 × 8 tiles</text>',
      "</svg>",
    ].join("\n"),
  );

/** Two answers, so the scenario can prove that two diagrams do not share an id namespace. */
export default [diagram(), diagram()];
