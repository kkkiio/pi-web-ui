In stateless serverless architectures, concurrent requests hit independent workers and must coordinate through an external database:

<box border radius="xl" padding={3} gap={2}>
  <text weight="medium" size="sm">Stateless Serverless: Compute Separated from Shared State</text>
  <svg viewBox="0 0 340 188" width="100%">
    <defs>
      <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0 0 L6 3 L0 6" fill="#94a3b8"/>
      </marker>
    </defs>
    {#each [0, 1, 2] as i}
      <rect x={14 + i * 116} y="8" width="80" height="28" rx="8" fill="#64748b" fillOpacity=".15" stroke="#94a3b8"/>
      <text x={54 + i * 116} y="26" fontSize="11" textAnchor="middle" fill="currentColor">Player {["A", "B", "C"][i]}</text>
      <path d={`M${54 + i * 116} 36 V54`} stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow)"/>
      <rect x={14 + i * 116} y="57" width="80" height="34" rx="7" stroke="#64748b" fill="#64748b" fillOpacity=".12"/>
      <text x={54 + i * 116} y="78" fontSize="11" textAnchor="middle" fill="currentColor">Worker</text>
      <path d={`M${54 + i * 116} 91 V111 L170 131`} stroke="#94a3b8" strokeWidth="1.4" fill="none"/>
    {/each}
    <rect x="79" y="132" width="182" height="45" rx="9" fill="#0d9488" fillOpacity=".13" stroke="#0d9488" strokeWidth="1.5"/>
    <text x="170" y="151" fontSize="12" fontWeight="600" textAnchor="middle" fill="currentColor">Shared Database</text>
    <text x="170" y="166" fontSize="10" textAnchor="middle" fill="currentColor">Transactions & conflict handling</text>
  </svg>
  <caption>Requests from the same room may land on different workers with no shared in-memory state.</caption>
</box>

If Players A and B both try to pick up the same item at once, two workers can read `owner = null` simultaneously and both believe they succeeded unless the database serializes the write.
