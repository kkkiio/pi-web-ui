@readme @docs
Feature: README images

  # These scenarios drive the real product path and screenshot it into
  # docs/images/*.png, which are committed snapshots reviewed like any other change.
  #
  # Prerequisite: run `just readme-images`. This project is not part of `npm run e2e`; the
  # only thing that runs it is that container (e2e/readme-image.Dockerfile), because the
  # pixels depend on the platform: the app ships no webfont, so the platform UI font and its
  # text rasterizer decide them, and a macOS render can never match the committed files.

  Scenario: Explore cache expiry strategies before planning a change
    Given Pi is ready to compare cache strategies
    When I open Pi Web UI
    And the session is renamed to "Choose a cache strategy"
    And I send "When a product page’s cache expires, should visitors wait for fresh data or get the cached page while it refreshes? Show both flows and let me choose one."
    Then the cache preview shows "Fresh page after refresh"
    When I choose "Serve stale and refresh" in the card
    Then the cache preview shows "Cached page immediately"
    And the cache preview shows "Background refresh"
    And I capture the cache strategy for the README
    When I select "Plan this approach" in the cache preview
    Then the card's answer reaches Pi as a user message "Plan this approach: Serve stale and refresh."

  Scenario: Refine the export plan by quoting the assistant, then review the diff
    Given Pi is ready to discuss report exports
    When I ask Pi for an export preview
    And I quote the proposed behavior and clarify the output paths
    Then the transcript shows the verified dry-run result
    When I open Changes to review the edit
    Then Git Diff shows the dry-run change

  Scenario: Compare deployment strategies side by side
    Given Pi is ready to compare deployment strategies
    When I open Pi Web UI
    And I send "What’s the difference between a rolling deploy and a blue-green deploy?"
    Then I see the deployment strategies side by side
    And I capture the deployment comparison for the README
