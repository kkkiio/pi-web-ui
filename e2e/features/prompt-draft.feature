Feature: Drafts wait for an explicit send

  Background:
    Given a git workspace

  @p0
  Scenario: Enter during a run keeps the draft until I send it myself
    Why: writing my next instruction must not create a second queue beside Pi's queue.

    Given Pi runs an eight second draft check
    When I open Pi Web UI
    And I send "Run the draft check."
    And I prepare an illustrated draft while Pi is working
    And I press Enter in the draft
    Then the illustrated draft is still in the composer
    And another client cannot queue a prompt through Web UI
    When Pi finishes the draft check
    Then the illustrated draft has not been sent
    When I explicitly submit the draft
    Then the transcript shows "Keep this as my next draft."
    And the draft attachments are cleared

  @p0
  Scenario: Stopping a run leaves the next instruction unsent
    Why: Stop must stop the agent without launching work I have not chosen to send.

    Given Pi runs an eight second draft check
    When I open Pi Web UI
    And I send "Run the draft check."
    And I prepare an illustrated draft while Pi is working
    And I press Enter in the draft
    And I stop Pi
    Then the composer is ready for the next message
    And the illustrated draft has not been sent
    When I reload Pi Web UI
    Then the transcript does not contain the draft

  @p1
  Scenario: Reconnecting does not send an offline draft
    Why: the transport's reconnect buffer must not silently submit a draft.

    Given Pi replies with plain text
    When I open Pi Web UI
    And I disconnect with an illustrated draft
    And I press Enter in the draft
    Then the illustrated draft is still in the composer
    When I reconnect to Pi
    Then the illustrated draft has not been sent
