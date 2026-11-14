Feature: User message formatting
  Scenario: User prompts preserve literal tags, newlines and formulas after reload
    Given a Pi session for user message formatting
    When I submit this formatted user prompt:
      """
      First line
      Second line

      <context source="user">
      **重点** and *emphasis*
      **中文标点。**也能加粗
      > Quoted instruction

      </context>
      <script>alert("literal")</script>

      - First item
      - Second item

      Inline formula: $x^2 + y^2 = z^2$ and escaped dollar: \$5

      $$
      \sum_{i=1}^{n} i = \frac{n(n+1)}{2}
      $$

      `<b>inline code</b>`

      ```mermaid
      graph LR
        A --> B
      ```

      Unclosed **marker
      """
    Then the user prompt displays literal tags and lightweight Markdown
    And the user prompt displays inline and block math
    And the submitted user prompt is preserved after reload
    And copying and editing the user prompt preserves its source
