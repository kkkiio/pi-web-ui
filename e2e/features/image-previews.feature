Feature: Chat image previews

  Scenario: An attachment and a read tool image can be opened before and after reload
    Given Pi will read a PNG image from the workspace
    When I open Pi Web UI
    And I send an image attachment without text
    Then Pi is working
    And the user attachment opens as an image preview
    When Pi continues reading the image
    Then the read tool shows its result text and an image preview
    When I reload Pi Web UI
    Then the user attachment opens as an image preview
    And the read tool shows its result text and an image preview
