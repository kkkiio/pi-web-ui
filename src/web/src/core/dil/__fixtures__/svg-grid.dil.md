<box border radius="lg" padding={3} gap={2}>
  <text size="sm" color="secondary">4 × 8 的 tile 布局，奇偶列交替着色</text>
  <svg viewBox="0 0 300 120" width="100%" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0 0 L6 3 L0 6 Z" fill="currentColor"/>
      </marker>
    </defs>
    {#each Array.from({length: 4}, (_, r) => r) as r}
      {#each Array.from({length: 8}, (_, c) => c) as c}
        <rect x={30 + c * 32} y={10 + r * 24} width="28" height="20" rx="3"
              fill={c % 2 === 0 ? "#83b4e2" : "#abcbed"} fillOpacity=".85"/>
      {/each}
    {/each}
    <line x1="20" y1="108" x2="280" y2="108" stroke="currentColor" markerEnd="url(#arrow)"/>
  </svg>
</box>
