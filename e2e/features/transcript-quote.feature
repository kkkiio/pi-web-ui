Feature: Quote transcript selections

  Background:
    Given a transcript with prose, reasoning and tool output

  @p0
  Scenario: Quoting an assistant sentence keeps my draft and reaches Pi
    Why: quoting is how I point at the exact sentence I mean; it must not replace
         what I was already typing, and Pi must receive the quote verbatim.

    When I quote a partial assistant sentence
    Then the draft is preserved and focused
    When I add reasoning and multiline tool output quotes
    Then all three quotes are attached
    When I submit the quoted feedback
    Then Pi receives the exact quotes and feedback after reload

  @p1
  Scenario: Removing a quote keeps the draft; selecting outside the transcript offers nothing
    Why: a quote I removed should leave no trace, and stray selection gestures must
         not hijack the composer.

    When I quote a partial assistant sentence
    And I remove the attached quote
    Then the draft is preserved without quotes
    When I select text outside the transcript
    Then no quote action is shown
    When I dismiss a transcript selection with Escape
    Then no quote action is shown

  @p1
  Scenario: On mobile a quote fits the viewport and sends without feedback
    Why: on a phone the quote chip and the composer compete for the same space; both
         must stay usable, and a quote alone is a valid message.

    When I use a mobile viewport and attach a quote
    Then the quote and composer controls fit the viewport
    When I send only the quote
    Then Pi receives the quote without feedback
