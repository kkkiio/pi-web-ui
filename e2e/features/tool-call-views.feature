Feature: Tool call views

  @p1
  Scenario: Inspect a running command and file changes from the conversation
    Given Pi will run a command and work on a TypeScript file
    When I ask Pi to review the file
    Then I can see the command and its latest output after reloading
    When the command exits with an error
    Then I can see the failure and quote the command output
    And I can preview the written and read file content
    And I can see and quote the edit diff after reloading the conversation
