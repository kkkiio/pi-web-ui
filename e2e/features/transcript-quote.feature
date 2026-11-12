Feature: Quote transcript selections
  Background:
    Given a transcript with prose, reasoning and tool output

  Scenario: Attach exact selections without replacing the draft and send them to Pi
    When I quote a partial assistant sentence
    Then the draft is preserved and focused
    When I add reasoning and multiline tool output quotes
    Then all three quotes are attached
    When I submit the quoted feedback
    Then Pi receives the exact quotes and feedback after reload

  Scenario: Remove quotes and dismiss selections outside transcript content
    When I quote a partial assistant sentence
    And I remove the attached quote
    Then the draft is preserved without quotes
    When I select text outside the transcript
    Then no quote action is shown
    When I dismiss a transcript selection with Escape
    Then no quote action is shown

  Scenario: Quote without typed feedback on a mobile viewport
    When I use a mobile viewport and attach a quote
    Then the quote and composer controls fit the viewport
    When I send only the quote
    Then Pi receives the quote without feedback
