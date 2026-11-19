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
