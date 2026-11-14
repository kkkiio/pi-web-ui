@no-ui
Feature: Web UI activation boundary

  # These scenarios never open a browser: they inspect the terminal session that
  # loads the extension. Tagged @no-ui so the storyboard gallery skips them.

  @p0
  Scenario: Terminal sessions are untouched until /webui
    Why: loading the extension must not change what a terminal user already has.

    Given an untouched terminal session
    When I have two terminal conversation turns
    Then terminal tools and instructions are unchanged
    And the Web UI question tool is absent
    And the Web UI server is not listening

  @p0
  Scenario: Stopping webui leaves the question tool disabled but reusable
    Why: a stop that unregisters the tool, or a restart that cannot re-enable it,
         would leave the user stuck outside Web UI mode.

    Given a lazy Web UI session
    When I run webui
    Then the Web UI question tool is active
    When I stop webui
    Then the Web UI question tool is inactive
    And the Web UI server is not listening
    When I run webui
    Then the Web UI question tool is active

  @p1
  Scenario: A failed activation leaves the terminal session untouched
    Why: a bind error must fail loudly without half-applying the Web UI changes.

    Given a lazy Web UI session with an unavailable bind address
    When I run webui
    Then the Web UI server is not listening
    And the Web UI question tool is absent
