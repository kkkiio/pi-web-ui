Feature: DIL interaction

  Background:
    Given a git workspace

  @p0
  Scenario: A follow-up card sends the answer the user actually entered
    Why: #48 exists to turn an end-of-turn question into a card; if the card cannot send
    the selected values, the model never receives them and the turn is wasted.

    Given Pi replies with a DIL interaction card
    When I open Pi Web UI
    And I send "How do I test MIDI in Chrome?"
    Then the DIL interaction card is rendered
    When I choose "浏览器支持 MIDI，但找不到钢琴设备" in the card
    And I type "USB MIDI 列表为空" into the card
    And I submit the card
    Then the card's answer reaches Pi as a user message "测试结果：找不到设备。补充信息：USB MIDI 列表为空。"
    And the transcript shows "已收到测试结果，接下来检查系统 MIDI 服务。"
    And the composer is still empty after the card is submitted
    And the card still shows the answer I chose

  @p0
  Scenario: A saved card draft follows the active conversation branch
    Given Pi replies with a DIL interaction card
    When I open Pi Web UI
    And I send "How do I test MIDI in Chrome?"
    Then the DIL interaction card is rendered
    When I choose "浏览器支持 MIDI，但找不到钢琴设备" in the card
    And I type "USB MIDI 列表为空" into the card
    Then Pi saves my card draft
    When I reload Pi Web UI
    Then the card still shows the answer I chose
    And a second browser sees my card draft
    When I reload the Pi session and reopen Web UI
    Then the card still shows the answer I chose
    When I rewind Pi to the original assistant message
    Then the card shows its initial choices
    When I reload Pi Web UI
    Then the card shows its initial choices

  @p0
  Scenario: A dry-run card accepts an updated answer
    Given Pi is ready to clarify the export dry-run
    When I open Pi Web UI
    And I send "Add a dry-run flag to the export command so I can see which files it would write."
    Then the dry-run card previews "reports/summary.csv overwrite"
    And I can answer in the chat input
    When I choose "Fail if a file exists" in the dry-run card
    Then the dry-run card previews "error: reports/summary.csv already exists"
    When I choose "Mark overwrites (Recommended)" in the dry-run card
    Then the dry-run card previews "reports/summary.csv overwrite"
    When I submit the dry-run choice
    Then the card's answer reaches Pi as a user message "Dry-run behavior for existing export files: Mark overwrites."
    And the transcript shows "I'll mark overwrites in the dry-run output."
    And the composer is ready for the next message
    When I choose "Show new files only" in the dry-run card
    Then the dry-run card previews "reports/orders.json new"
    When I submit the dry-run choice
    Then the card's answer reaches Pi as a user message "Dry-run behavior for existing export files: Show new files only."
    And the transcript shows "I'll show only new files in the dry-run output."
    And the dry-run answers survive a reload
