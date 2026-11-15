@readme @docs
Feature: README images

  # These scenarios drive the real product path and screenshot it into
  # docs/images/*.png, which are committed snapshots reviewed like any other change.
  #
  # Prerequisite: run `just readme-images`. This project is not part of `npm run e2e`; the
  # only thing that runs it is that container (e2e/readme-image.Dockerfile), because the
  # pixels depend on the platform: the app ships no webfont, so the platform UI font and its
  # text rasterizer decide them, and a macOS render can never match the committed files.

  Scenario: Refine the export plan by quoting the assistant, then review the diff
    Why: the README hero and the Git Diff image show this flow, so regenerating them from
         the real product path is how the published screenshots stay honest.

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
