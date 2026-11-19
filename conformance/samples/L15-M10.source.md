### 举个例子

假设让 LLM 生成一个包含文字和按钮的界面。

**JSX 的写法：**

```jsx
<Column>
  <Text>Hello!</Text>
  <Button>Continue</Button>
</Column>
```

**A2UI 的写法（v0.9，简化示例）：**

```json
{
  "version": "v0.9",
  "updateComponents": {
    "surfaceId": "main",
    "components": [
      {
        "id": "root",
        "component": "Column",
        "children": ["title", "button"]
      },
      {
        "id": "title",
        "component": "Text",
        "text": "Hello!"
      },
      {
        "id": "button",
        "component": "Button",
        "child": "buttonLabel"
      },
      {
        "id": "buttonLabel",
        "component": "Text",
        "text": "Continue"
      }
    ]
  }
}
```

这只是 `updateComponents` 消息；实际使用时还需要先通过 `createSurface` 创建 UI 区域。<Cite ref="turn652208view0"/>

### 核心架构

<box border radius="lg" padding={3} gap={2} align="center">
  <box background="surface-secondary" radius="md" padding={3} width="80%" align="center" gap="1px">
    **LLM / Agent**
    <caption>生成 UI 描述</caption>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box background="rgba(32,140,90,0.08)" border={{size:1,color:"rgba(32,140,90,0.35)"}} radius="md" padding={3} width="80%" align="center" gap="1px">
    **A2UI JSON**
    <caption>组件、属性、数据绑定</caption>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box background="surface-secondary" radius="md" padding={3} width="80%" align="center" gap="1px">
    **Renderer**
    <caption>React / Flutter / 其他客户端</caption>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="md" padding={3} width="80%" align="center" gap={2}>
    <text weight="medium">Hello!</text>
    <button color="primary" size="md" onClick={()=>{}}>Continue</button>
  </box>
</box>

**关键区别：A2UI 不是禁止 JSX，而是不要求 LLM 输出 JSX。**

你完全可以用 React + JSX 实现 A2UI Renderer，把 LLM 生成的 JSON 映射到自己写好的 React 组件上。

如果你是在选技术方案：

- **A2UI**：适合跨平台、组件受控、安全性要求较高的 Agent UI。
- **LLM → JSX**：适合以 React 为中心、希望模型灵活控制布局和组件组合的场景。

官方文档：<Link url="https://a2ui.org/" title="A2UI Protocol"/>。