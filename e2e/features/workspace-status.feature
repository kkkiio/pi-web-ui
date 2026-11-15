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

  @p0
  Scenario: Review net changes and attach feedback to the chat
    Why: the reviewer can point Pi to the exact removed and added lines even if the working tree changes before sending.

    Given a git workspace
    And Pi replies with plain text
    When I open Pi Web UI
    And the workspace has retry code changes and a staged edit reverted on disk
    And I open Changes
    Then Changes groups the two files in their directory
    When I comment on the removed line
    And I write a comment on a range of new lines in split view
    And I switch to unified view and attach the comment
    And I edit the first comment and refresh Changes after another workspace edit
    Then the composer still shows both original excerpts
    When I send the diff comments
    Then the transcript shows the edited comment and both original excerpts

  @p1
  Scenario: Add a diff comment on mobile
    Why: a touch user can select a line and return to the composer with the feedback attached.

    Given a git workspace
    When I open Pi Web UI
    And the workspace has retry code changes and a staged edit reverted on disk
    And I switch to a mobile viewport
    And I open Changes
    When I tap a line number and write a comment
    And I attach the mobile diff comment
    Then the mobile composer shows the diff comment

  @p1
  Scenario: A long diff scrolls within Changes
    Why: scrolling code keeps the app header and the review controls in view.

    Given a git workspace
    When I open Pi Web UI
    And the workspace has a long code diff
    And I open Changes
    Then I can scroll to the end of the diff while the review controls stay in place

  @p1
  Scenario: Refresh a changes list after a commit
    Why: a file committed outside the app can still be listed, and reviewers need a clear way to reload the list.

    Given a git workspace
    When I open Pi Web UI
    And the workspace has retry code changes and a staged edit reverted on disk
    And I open Changes
    And I commit the displayed retry changes outside Pi
    And I open the previously changed retry file
    Then I can refresh the outdated list and see a clean working tree
