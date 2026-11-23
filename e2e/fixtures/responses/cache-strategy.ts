import { fauxAssistantMessage } from "@earendil-works/pi-ai";

export default [
  fauxAssistantMessage(
    `
{@body const [serveStale, setServeStale] = DIL.useState(false, { key: "serve-stale" })}
{@body const responseColor = serveStale ? "#0f766e" : "#9a5b16"}
<box border radius="xl" padding={3} gap={3}>
  <title level="2" size="lg">When the cache expires</title>
  <radio-group direction="row" value={serveStale} onChange={setServeStale}>
    <radio value={false}>Wait for fresh data</radio>
    <radio value={true}>Serve stale and refresh</radio>
  </radio-group>
  <box background="surface-secondary" radius="lg" padding={2}>
    <svg viewBox="0 0 620 146" width="100%">
      <defs>
        <marker id="request" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M1 1 L7 4 L1 7" fill="none" stroke="#667085" strokeLinecap="round" strokeLinejoin="round"/>
        </marker>
        <marker id="return" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M1 1 L7 4 L1 7" fill="none" stroke={responseColor} strokeLinecap="round" strokeLinejoin="round"/>
        </marker>
      </defs>
      <rect x="10" y="30" width="116" height="44" rx="9" fill="#667085" fillOpacity=".07" stroke="#667085" strokeOpacity=".35"/>
      <text x="68" y="57" textAnchor="middle" fontSize="15" fontWeight="600" fill="currentColor">Visitor</text>
      <rect x="248" y="30" width="124" height="44" rx="9" fill={responseColor} fillOpacity=".09" stroke={responseColor} strokeOpacity=".55"/>
      <text x="310" y="57" textAnchor="middle" fontSize="15" fontWeight="600" fill="currentColor">Expired cache</text>
      <rect x="512" y="30" width="98" height="44" rx="9" fill="#667085" fillOpacity=".07" stroke="#667085" strokeOpacity=".35"/>
      <text x="561" y="57" textAnchor="middle" fontSize="15" fontWeight="600" fill="currentColor">Origin</text>
      <line x1="132" y1="52" x2="242" y2="52" stroke="#667085" strokeWidth="1.5" markerEnd="url(#request)"/>
      <text x="187" y="42" textAnchor="middle" fontSize="13" fill="currentColor">Page request</text>
      <line x1="378" y1="52" x2="506" y2="52" stroke="#667085" strokeWidth="1.5" strokeDasharray={serveStale ? "4 4" : "none"} markerEnd="url(#request)"/>
      <text x="442" y="42" textAnchor="middle" fontSize="13" fill="currentColor">{serveStale ? "Background refresh" : "Blocking refresh"}</text>
      <path d="M310 81 V123 Q310 134 299 134 H79 Q68 134 68 123 V81" fill="none" stroke={responseColor} strokeWidth="1.5" markerEnd="url(#return)"/>
      <text x="189" y="120" textAnchor="middle" fontSize="14" fontWeight="600" fill={responseColor}>{serveStale ? "Cached page immediately" : "Fresh page after refresh"}</text>
    </svg>
  </box>
  <text size="sm" color="secondary">{serveStale ? "Visitors see the previous version while the cache fetches a fresh copy." : "Visitors wait for the origin and receive the updated page."}</text>
  <row justify="end">
    <button onClick={() => GenUI.issueNewTurn("Plan this approach: " + (serveStale ? "Serve stale and refresh." : "Wait for fresh data."))}>Plan this approach</button>
  </row>
</box>
`.trim(),
  ),
  fauxAssistantMessage("I’ll sketch the changes to the cache policy and the tests for cache expiry."),
];
