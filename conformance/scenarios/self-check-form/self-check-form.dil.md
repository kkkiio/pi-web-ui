## 三、现在就能做的 MIDI 连通性测试

我找到一个无需安装 App、无需写代码的在线测试工具。

<box border radius="xl" padding={3} gap={2}>
  <row align="center" gap={3}>
    <icon name="piano" size="2xl"/>
    <box flex="1" gap={1}>
      **Web MIDI Input Monitor**
      <text color="secondary" size="xs">显示 MIDI 输入设备、按键、力度和原始消息。网页声明只接收输入，不发送 MIDI 控制命令。</text>
    </box>
  </row>
  <button block onClick={()=>GenUI.openUrl("https://webdevicetest.com/en/tools/midi-input-test")}>在 Chrome 中打开 MIDI 测试网页 <icon name="external-link" inline/></button>
  <caption>网址：webdevicetest.com/en/tools/midi-input-test</caption>
</box>

### 按以下步骤操作

<list marker="number" gap={2}>
  <list-item>先给 MIDI 钢琴充好电并开机。如果琴身上有多个 Type-C 接口，请优先使用标有 `USB` 或 `MIDI` 的接口，而不是仅用于充电的接口。</list-item>
  <list-item>用 USB-C 数据线将 MIDI 钢琴与平板连接起来。</list-item>
  <list-item>在 Pad 上打开 **Google Chrome**，访问上面的测试网页。不要使用微信或其他 App 内置浏览器。</list-item>
  <list-item>点击页面上的 **Start MIDI monitor**，并允许 Chrome 请求 MIDI 访问权限。不需要启用 SysEx。</list-item>
  <list-item>如果出现输入设备列表，选择检测到的 MIDI 设备。设备名称可能是 `USB MIDI Device`、`TERENCE` 或其他名称。</list-item>
  <list-item>按下电钢琴中间的中央 C，然后松开，观察页面上的消息记录。</list-item>
</list>

Google 的官方帮助文档也明确说明，Android Chrome 可以由用户授权网页访问 MIDI 设备。<Cite ref="turn190489search9"/>

### 成功时你会看到什么？

例如你按下中央 C：

<box background="surface-secondary" radius="lg" padding={3} gap={2}>
  <row align="center" justify="between">
    <text weight="medium" size="sm">MIDI Input</text>
    <badge color="success"><icon name="check-circle" inline/> 已收到消息</badge>
  </row>
  <box background="surface" radius="md" padding={3} gap={2}>
    <row justify="between" align="center">
      <text color="success" weight="medium">NOTE ON</text>
      <text tabularNums size="sm">Note 60 · C4</text>
    </row>
    <text color="secondary" size="xs">Velocity: 85（示例值，实际取决于按键力度）</text>
    <divider color="subtle"/>
    <row justify="between" align="center">
      <text weight="medium">NOTE OFF</text>
      <text tabularNums size="sm">Note 60 · C4</text>
    </row>
  </box>
  <caption>示意输出，不是你的设备实测结果。某些钢琴会使用速度为 0 的 Note On 消息表示松键。</caption>
</box>

只要看到了类似消息，就证明当前 **电钢琴 → USB → Android → Chrome → Web MIDI** 这条输入链路已经打通。

接下来可以再测试同时按三个琴键，看浏览器能不能接收到多个音符。

## 四、如果测试不成功，怎么排查？

| 测试结果 | 下一步 |
|---|---|
| 网页提示 Web MIDI 不受支持 | 确认使用最新版 Chrome 和 HTTPS 网页 |
| 网页支持 MIDI，但找不到设备 | 检查数据线、琴的 MIDI 接口；尝试 OTG 转接方案 |
| 识别到设备，但按键没反应 | 检查是否选中了正确的 MIDI 输入端口，重新连接 |
| 设备偶尔消失或断开 | 检查琴的电量、USB 供电、线材和接头 |
| Chrome 始终不识别 | 尝试原生 Android MIDI 测试 App，区分浏览器问题与系统问题 |

有一个值得留意的系统细节：Chromium 的 Android MIDI 后端依赖 Android 原生 MIDI 服务，而某些厂商设备可能没有完整启用该能力。**支持 OTG 不等于一定能在浏览器里识别 USB MIDI。** <Cite ref="turn190489search6"/>

另外，不需要特意去开发者选项把 USB 模式改成「MIDI」。那个选项主要涉及 Android 自己作为 USB 外设时的模式，不是这项主机端读取测试的必要设置。

## 五、现在最值得做的一件事

你已经具备了两个关键硬件条件，而且 <Entity category="product" value="MIDI 钢琴" disambig="88 键折叠 MIDI 钢琴"/> 官方确实明确标注了 Type-C MIDI 传输。<Cite ref="turn279072search1"/>

我建议你先不要购买其他设备或开始开发 Android App，直接试一次 USB-C 连接和网页测试。

**测试后告诉我出现了哪种结果：**

{@body const [result,setResult] = DIL.useState("success")}
{@body const [details,setDetails] = DIL.useState("")}
<box border radius="xl" padding={3} gap={3}>
  <radio-group direction="col" value={result} onChange={setResult}>
    <radio value="success">成功了，能看到 Note On / Note Off</radio>
    <radio value="nodevice">浏览器支持 MIDI，但找不到钢琴设备</radio>
    <radio value="nomessage">看到了设备，但弹琴没有 MIDI 消息</radio>
    <radio value="unsupported">Chrome 提示不支持 Web MIDI 或权限错误</radio>
    <radio value="other">其他情况</radio>
  </radio-group>
  <box gap={1}>
    <label>补充信息（可选）</label>
    <textarea rows={2} value={details} onChange={setDetails} placeholder="例如：设备列表显示 USB MIDI，但按键无反应……"/>
  </box>
  <button block onClick={()=>GenUI.issueNewTurn(`我使用平板连接 MIDI 钢琴，在 Chrome 中测试 MIDI。结果：${({success:"成功，能看到 Note On / Note Off",nodevice:"浏览器支持 MIDI，但找不到钢琴设备",nomessage:"看到设备，但弹琴没有 MIDI 消息",unsupported:"Chrome 提示不支持 Web MIDI 或权限错误",other:"其他情况"})[result]}。补充信息：${details || "无"}。请根据结果指导我下一步。`)}>提交测试结果 <icon name="arrow-right" inline/></button>
</box>

如果测试成功，我们下一步就能开始制作你自己的第一版网页版钢琴教学器：**弹下真实琴键，Pad 上的虚拟琴键实时点亮。**