@readme @docs
Feature: README images

  Scenario: Refine the export plan by quoting the assistant, then review the diff
    Why: the README hero and the Git Diff image show this flow, so each run regenerates
         them from the real product path.

    Given Pi is ready to discuss report exports
    When I ask Pi for an export preview
    And I quote the proposed behavior and clarify the output paths
    Then the transcript shows the verified dry-run result
    When I open Changes to review the edit
    Then Git Diff shows the dry-run change

  Scenario: Pi asks how dry-run should behave before writing code
    Why: the README AskUserQuestion image shows the agent stopping to clarify intent,
         with an option preview, before it touches the workspace.

    Given Pi is ready to plan the export dry-run
    When I ask Pi to add a dry-run flag
    And I pick the recommended overwrite behavior
    Then the question card previews the dry-run output
