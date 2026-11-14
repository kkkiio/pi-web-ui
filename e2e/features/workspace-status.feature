Feature: Workspace status and Changes panel

  @p0
  Scenario: Changes opens from the header and collapses back to one column
    Why: the diff is the only proof of what the agent changed on disk; opening it must
         not permanently cost the chat its width.

    Given a git workspace
    And Pi updates the workspace status document
    When I open Pi Web UI
    Then the layout is single column
    When I ask Pi to update the workspace status docs
    Then the header shows the change counts
    When I open Changes
    Then the right panel shows the git diff
    When I hide the right panel
    Then the right panel is hidden
    When I restore the right panel
    Then the right panel has one Changes tab

  @p1
  Scenario: A workspace without git explains itself instead of showing a diff
    Why: an empty diff panel looks like the agent changed nothing; the user needs to
         know the workspace is simply not a repository.

    Given a workspace without git
    When I open Pi Web UI
    And I open Changes
    Then the panel says the workspace has no git repository

  @p1
  Scenario: On mobile the panel takes the width and closing it returns the chat
    Why: a squeezed side-by-side layout would clip both surfaces, and after closing the
         panel the composer has to be usable again.

    Given a git workspace
    When I open Pi Web UI
    And I switch to a mobile viewport
    And I open Changes
    Then the right panel fills the mobile width
    When I hide the right panel
    Then the composer stays fully visible
