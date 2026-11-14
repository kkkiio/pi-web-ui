Feature: Edit a message

  @p0
  Scenario: The edit control is available once Web UI is active
    Why: without it, fixing a typo means retyping the prompt and losing the context.

    Given a git workspace
    And Pi replies with plain text
    When I open Pi Web UI
    And I send "original question"
    Then the transcript shows "Hello, Pi Web UI received your message."
    And the edit control is available

  @p0
  Scenario: Saving an edit replaces that turn and keeps my draft
    Why: an edit is meant to change the branch, not add a second prompt; the message
         I was typing next must not be lost in the rewind.

    Given a git workspace
    And Pi replies with plain text
    When I open Pi Web UI
    And I send "original question"
    Then the transcript shows "Hello, Pi Web UI received your message."
    When I enable inline editing
    And I edit the message to "edited question" with the draft "kept draft"
    Then the transcript shows "edited question"
    And the original question is gone from the transcript
    And the composer still holds "kept draft"
    When I reload Pi Web UI
    Then the transcript shows "edited question"

  @p1
  Scenario: A refused rewind leaves the conversation and the draft untouched
    Why: if navigation is cancelled, the user must still see the old answer and keep
         both the edit text and the draft; a half-applied edit would lose work.

    Given a git workspace
    And Pi replies with plain text
    And the rewind will be cancelled
    When I open Pi Web UI
    And I send "original question"
    Then the transcript shows "Hello, Pi Web UI received your message."
    When I enable inline editing
    And I edit the message to "edited question" with the draft "kept draft"
    Then the rewind is refused and nothing is applied

  @p1
  Scenario: Editing removes the old branch's text and tool rows
    Why: after a rewind the old branch must disappear completely; leftover rows make
         it look like both prompts ran.

    Given a git workspace
    And Pi returns text and several tool calls in one message
    When I open Pi Web UI
    And I send "original question"
    Then the transcript shows "Old branch done"
    When I reload Pi Web UI
    And I expand all tool calls
    Then the transcript shows "Old branch explanation"
    When I enable inline editing
    And I edit the message to "edited question" with the draft ""
    Then the old branch's text and tool rows are gone
