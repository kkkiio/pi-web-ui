Feature: Workspace status

  Scenario: Open git diff and artifact from a real Pi agent run
    Given a temporary git workspace
    And the faux response fixture is "workspace-artifact"
    When I open Pi Web UI
    And I ask the agent to update the workspace status docs
    Then the workspace float shows the current branch
    And the workspace float shows git additions and deletions
    And the workspace float shows the Markdown artifact

    When I open the Markdown artifact
    Then the right panel shows the artifact file content

    When I hide the right panel
    And I open the Changes row
    Then the right panel shows the git diff tab

  Scenario: Open an artifact written outside the git workspace
    Given a temporary git workspace
    And the faux response fixture is "external-artifact"
    When I open Pi Web UI
    And I ask the agent to update the external skill docs
    Then the workspace float shows the external Markdown artifact

    When I open the external Markdown artifact
    Then the right panel shows the external artifact file content
