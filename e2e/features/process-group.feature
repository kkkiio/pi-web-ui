Feature: Process Group

  Scenario: Inspect a running process without losing the open rows
    Given Pi will think and run a command before replying
    When I send a prompt and open the Thinking process group
    Then the group stays open as the command starts and completes
