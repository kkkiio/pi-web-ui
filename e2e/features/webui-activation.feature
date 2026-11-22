@no-ui
Feature: Web UI activation boundary

  @p0
  Scenario: Terminal sessions are untouched until /webui
    Given a lazy Web UI session
    When I have two terminal conversation turns
    Then terminal tools and instructions are unchanged
    And the DIL prompt section is inactive
    And the Web UI server is not listening

  @p0
  Scenario: Stopping and restarting webui re-enables browser features
    Given a lazy Web UI session
    When I run webui
    Then the Web UI server is listening
    And the DIL prompt section is active
    When I stop webui
    Then the Web UI server is not listening
    And the DIL prompt section is inactive
    When I run webui
    Then the Web UI server is listening
    And the DIL prompt section is active

  @p1
  Scenario: A failed activation leaves the terminal session untouched
    Given a lazy Web UI session with an unavailable bind address
    When I run webui
    Then the Web UI server is not listening
    And terminal tools and instructions are unchanged
    And the DIL prompt section is inactive

  @p0
  Scenario Outline: A replaced session needs /webui again
    Given a lazy Web UI session
    When I run webui
    Then the Web UI server is listening
    And the DIL prompt section is active
    When I replace the session using "<command>"
    Then the Web UI server is not listening
    And the DIL prompt section is inactive
    When I run webui
    Then the Web UI server is listening
    And the DIL prompt section is active

    # title-format: after <command>
    Examples:
      | command              |
      | /new-test-session    |
      | /reload-test-session |
