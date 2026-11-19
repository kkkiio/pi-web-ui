import { fauxAssistantMessage } from "@earendil-works/pi-ai";

/**
 * A DIL follow-up card, then the answer it earns (`#48`).
 *
 * The card is the corpus' MIDI self-check message (`generative-ui-research/dil/L12-M24`):
 * `DIL.useState` with an explicit `{ key }`, a `radio-group` whose `onChange` is the raw
 * setter, a `label` + `textarea` pair, and a `button` that builds its prompt from both
 * slots inside `GenUI.issueNewTurn`.
 */
export default [
  fauxAssistantMessage(
    [
      "## MIDI 自检",
      "",
      '{@body const [result, setResult] = DIL.useState("success", { key: "result" })}',
      '{@body const [details, setDetails] = DIL.useState("", { key: "details" })}',
      '<box border radius="xl" padding={3} gap={3}>',
      '  <text weight="semibold">测试结果</text>',
      '  <radio-group direction="col" value={result} onChange={setResult}>',
      '    <radio value="success">成功了，能看到 Note On / Note Off</radio>',
      '    <radio value="nodevice">浏览器支持 MIDI，但找不到钢琴设备</radio>',
      "  </radio-group>",
      "  <label>补充信息（可选）</label>",
      '  <textarea rows={2} value={details} onChange={setDetails} placeholder="例如：设备列表显示 USB MIDI，但按键无反应"/>',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: this is DIL source, not a JS template
      '  <button block onClick={()=>GenUI.issueNewTurn(`测试结果：${({success:"成功了",nodevice:"找不到设备"})[result]}。补充信息：${details || "无"}。`)}>提交测试结果</button>',
      "</box>",
    ].join("\n"),
  ),
  fauxAssistantMessage("已收到测试结果，接下来检查系统 MIDI 服务。"),
];
