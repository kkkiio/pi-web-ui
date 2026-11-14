Feature: Chat and session transcript

  Background:
    Given a git workspace

  @p0
  Scenario: Reloading the page rebuilds the transcript
    Why: a reload is how people recover a stuck tab; a blank transcript reads as lost work.

    Given Pi updates the workspace status document
    When I open Pi Web UI
    And I ask Pi to update the workspace status docs
    And I reload Pi Web UI
    Then the transcript shows "Update the workspace status docs."
    And the transcript shows "Updated the workspace status docs."
    And the transcript shows the tool call "write"

  @p0
  Scenario: A sent message and the reply both appear in the transcript
    Why: without my own message on screen I cannot tell whether the send registered.

    Given Pi replies with plain text
    When I open Pi Web UI
    And I send "hello"
    Then the transcript shows "hello"
    And the transcript shows "Hello, Pi Web UI received your message."
    And the composer is ready for the next message

  @p0
  Scenario: A write call ends as a successful tool row
    Why: the tool row is the only evidence that a file on disk was touched.

    Given Pi updates the workspace status document
    When I open Pi Web UI
    And I ask Pi to update the workspace status docs
    Then the transcript shows the tool call "write"
    And the transcript shows "Updated the workspace status docs."

  @p1
  Scenario: A failed tool call is marked as failed
    Why: a failure rendered like a success would leave me believing the file was written.

    Given Pi fails its write tool call
    When I open Pi Web UI
    And I send "run the failing tool"
    Then the transcript shows the tool call "write"
    And the tool call is marked as failed
