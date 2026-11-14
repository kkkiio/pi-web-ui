Feature: Process group

  @p0
  Scenario: A row I opened stays open when a new row streams in
    Why: I open the row to read along; it closing hides what I was reading.

    Given Pi thinks for a moment, then runs a two second command
    When I open the reasoning row while Pi is thinking
    And I open the bash row when it arrives
    Then the rows I opened are still open when the command finishes
