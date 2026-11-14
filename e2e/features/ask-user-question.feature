Feature: Structured agent clarification

  @p0
  Scenario: Answering a question shows option previews and survives a reload
    Why: the answer has to reach the agent, and the record of it must not disappear
         when the page is refreshed.

    Given an activated question session
    When I ask the agent to clarify
    Then the question card is waiting for answers
    And submitting unanswered questions is disabled
    When I choose project storage and features
    Then the option Markdown preview is visible
    When I submit the clarification answers
    Then the agent receives my answers
    When I reload the question page
    Then the answered card is read only

  @p0
  Scenario: A pending question is still pending after a reload
    Why: the agent is blocked until the user answers; a reload must not strand the
         question or the agent.

    Given an activated question session
    When I ask the agent to clarify
    And I reload the question page
    Then the question card is waiting for answers
    When I enter custom clarification answers
    And I submit the clarification answers
    Then the agent receives my answers

  @p1
  Scenario: My half-typed answers survive a reconnect
    Why: a dropped socket must not throw away what the user already typed.

    Given an activated question session through a TCP proxy
    When I ask the agent to clarify
    And I enter custom clarification answers
    And the network connection drops and reconnects
    Then my clarification draft is preserved
    When I submit the clarification answers
    Then the agent receives my answers

  @p1
  Scenario: An invalid answer is refused and the question stays open
    Why: a partially accepted answer would leave the agent and the user disagreeing
         about what was submitted.

    Given an activated question session
    When I ask the agent to clarify
    Then an invalid answer is refused and the question remains open
    When I choose project storage and features
    And I submit the clarification answers
    Then the agent receives my answers
    And a duplicate answer is refused

  @p1
  Scenario: Cancelling a question releases the agent
    Why: if the agent kept waiting after a cancel, the session would hang.

    Given an activated question session
    When I ask the agent to clarify
    And I cancel the clarification
    Then the cancelled card is read only

  @p1
  Scenario: Aborting the run closes the pending question
    Why: a question left open after an abort would let the user answer a run that no
         longer exists.

    Given an activated question session
    When I ask the agent to clarify
    And I abort the question agent
    Then the cancelled card is read only

  @p0
  Scenario Outline: A conflicting question tool is disabled regardless of load order
    Why: two tools answering the same question would confuse the agent and the card.

    Given a lazy Web UI session with a conflicting tool loaded "<order>"
    Then the conflicting question tool is active
    When I open webui
    Then the Web UI question tool is active
    And the conflicting question tool is inactive
    When I disable an unrelated tool
    And I ask the agent to clarify
    And I choose project storage and features
    And I submit the clarification answers
    Then the agent receives my answers
    When I stop webui
    Then the conflicting question tool is active
    And the unrelated tool stays disabled

    # title-format: conflicting tool loaded <order>
    Examples:
      | order  |
      | before |
      | after  |

  @p1
  Scenario: A conflicting tool that was already inactive stays inactive
    Why: activation must not silently turn on a tool the user had turned off.

    Given a lazy Web UI session with a conflicting tool loaded "inactive"
    Then the conflicting question tool is inactive
    When I open webui
    And I stop webui
    Then the conflicting question tool is inactive

  @p0
  Scenario Outline: A replaced session needs /webui again
    Why: a new session must not inherit a server and rewritten tools from the old one.

    Given an activated question session
    When I replace the session using "<command>"
    Then the Web UI server is not listening
    And the Web UI question tool is absent
    When I open webui
    Then the Web UI question tool is active

    # title-format: after <command>
    Examples:
      | command              |
      | /new-test-session    |
      | /reload-test-session |

  @p1
  Scenario: Two browsers see the same answer
    Why: a second tab must not show a stale, still-answerable question.

    Given an activated question session
    When I ask the agent to clarify
    And another browser opens the pending question
    And I choose project storage and features
    And I submit the clarification answers
    Then both browsers show an answered question

  @p1
  Scenario: Stopping the web UI releases a waiting agent
    Why: stopping the server must not leave the agent blocked on a question nobody
         can answer anymore.

    Given an activated question session
    When I ask the agent to clarify
    And I stop webui
    Then the Web UI server is not listening
    When I run webui after the agent settles
    Then the cancelled card is read only
