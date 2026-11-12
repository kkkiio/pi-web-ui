@readme
Feature: Preview report exports

  Scenario: Refine the export plan by quoting the assistant
    Given Pi is ready to discuss report exports
    When I ask Pi for an export preview
    And I quote the proposed behavior and clarify the output paths
    Then the transcript shows the verified dry-run result
