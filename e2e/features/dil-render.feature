Feature: DIL rendering

  Background:
    Given a git workspace

  @p0
  Scenario: A DIL answer renders as a layout, not as raw tags
    Why: enabling DIL would make answers worse if the Web UI showed <box> as text.

    Given Pi replies with a DIL layout
    When I open Pi Web UI
    And I send "Explain the request path with a layout"
    Then the transcript shows "请求路径"
    And the DIL layout is rendered
    And the transcript does not show raw DIL tags

  @p0
  Scenario: An SVG diagram renders as geometry
    Why: #47 promises parametric SVG; raw tags or a blank box would both be silent failures.

    Given Pi replies with a DIL diagram
    When I open Pi Web UI
    And I send "Draw the tile layout"
    Then the transcript shows "Tile 布局"
    And the DIL diagram is rendered
    And the transcript does not show raw DIL tags

  @p0
  Scenario: Math and code are typeset, not shown as source
    Why: #49 promises KaTeX and Shiki; raw "$$" / backticks with no highlight would both look
    like a rendering bug to a reader.

    Given Pi replies with DIL math and code
    When I open Pi Web UI
    And I send "Show the derivation with code"
    Then the transcript shows "推导"
    And the math, the code block and the connected list are rendered
    And the transcript does not show raw DIL tags

  @p1
  Scenario: A list that continues earlier steps keeps its numbering
    Why: renumbering a procedure's tail to 1 makes the reader redo steps they already did.

    Given Pi replies with a continued ordered list
    When I open Pi Web UI
    And I send "What are the remaining steps?"
    Then the transcript shows "Deploy"
    And the ordered list continues at 5

  @p0
  Scenario: Markdown renders the same with and without a DIL layout
    Why: an assistant answer can add a layout without changing how a reader sees its Markdown.

    Given Pi replies with the same Markdown with and without a layout
    When I open Pi Web UI
    And I send "Show Markdown"
    Then the latest assistant answer renders the Markdown features
    When I send "Add a layout"
    Then the latest assistant answer renders the Markdown features
    And the transcript shows "Layout card"
