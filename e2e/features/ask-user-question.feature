Feature: Structured agent clarification

  Scenario: Terminal conversations keep their tools, instructions and session name
    Given an untouched terminal session
    When I have two terminal conversation turns
    Then terminal tools and instructions are unchanged
    And the Web UI question tool is absent
    And the Web UI server is not listening

  Scenario: Tools and server stay untouched until explicit activation
    Given a lazy Web UI session
    Then the Web UI server is not listening
    And the Web UI question tool is absent
    When I run webui
    Then the Web UI question tool is active
    When I stop webui
    Then the Web UI question tool is inactive
    And the Web UI server is not listening
    When I run webui
    Then the Web UI question tool is active

  Scenario: Answer choices, preview Markdown and restore history
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

  Scenario: Pending questions are restored after page reload
    Given an activated question session
    When I ask the agent to clarify
    And I reload the question page
    Then the question card is waiting for answers
    When I enter custom clarification answers
    And I submit the clarification answers
    Then the agent receives my answers

  Scenario: Reject invalid answers atomically and refuse a second answer
    Given an activated question session
    When I ask the agent to clarify
    Then an invalid answer is refused and the question remains open
    When I choose project storage and features
    And I submit the clarification answers
    Then the agent receives my answers
    And a duplicate answer is refused

  Scenario: Cancelling questions releases the agent
    Given an activated question session
    When I ask the agent to clarify
    And I cancel the clarification
    Then the cancelled card is read only

  Scenario: Aborting the agent closes pending questions
    Given an activated question session
    When I ask the agent to clarify
    And I abort the question agent
    Then the cancelled card is read only

  Scenario Outline: Known conflicting names are disabled regardless of extension load order
    Given a lazy Web UI session with a conflicting tool loaded "<order>"
    Then the conflicting question tool is active
    When I run webui
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

    Examples:
      | order  |
      | before |
      | after  |

  Scenario: An originally inactive conflict stays inactive after cleanup
    Given a lazy Web UI session with a conflicting tool loaded "inactive"
    Then the conflicting question tool is inactive
    When I run webui
    And I stop webui
    Then the conflicting question tool is inactive

  Scenario Outline: Replacing the session requires explicit activation again
    Given an activated question session
    When I replace the session using "<command>"
    Then the Web UI server is not listening
    And the Web UI question tool is absent
    When I run webui
    Then the Web UI question tool is active

    Examples:
      | command              |
      | /new-test-session    |
      | /reload-test-session |

  Scenario: Multiple browsers observe the same completed question
    Given an activated question session
    When I ask the agent to clarify
    And another browser opens the pending question
    And I choose project storage and features
    And I submit the clarification answers
    Then both browsers show an answered question

  Scenario: Stopping a pending interaction releases the agent
    Given an activated question session
    When I ask the agent to clarify
    And I stop webui
    Then the Web UI server is not listening
    When I run webui after the agent settles
    Then the cancelled card is read only

  Scenario: Activation failure leaves the session untouched
    Given a lazy Web UI session with an unavailable bind address
    When I attempt activation
    Then the Web UI server is not listening
    And the Web UI question tool is absent
