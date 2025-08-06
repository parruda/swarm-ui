# frozen_string_literal: true

require "application_system_test_case"

class MobileMenuControllerTest < ApplicationSystemTestCase
  test "mobile menu controller exists in navbar" do
    visit root_path

    # The mobile menu button exists but has a structural issue
    # The controller is on the button itself, not on a parent containing both button and menu
    assert page.has_css?('[data-controller="mobile-menu"]', visible: :all), "Mobile menu controller should exist"

    # The menu target exists separately
    assert page.has_css?('[data-mobile-menu-target="menu"]', visible: :all), "Mobile menu target should exist"

    # NOTE: Due to the structural issue where the controller is on the button
    # rather than a parent element, the controller cannot find its menu target
    # This test documents the current broken state
  end

  test "toggle works when controller is properly structured" do
    visit root_path

    # Test with properly structured HTML
    html = <<~HTML
      <div data-controller="mobile-menu" id="test-mobile-menu">
        <button data-action="click->mobile-menu#toggle">Menu</button>
        <nav data-mobile-menu-target="menu" class="hidden">
          <a href="#">Home</a>
          <a href="#">About</a>
        </nav>
      </div>
    HTML

    add_stimulus_test_html(html)

    # Menu should be hidden initially
    menu = find('#test-mobile-menu [data-mobile-menu-target="menu"]', visible: :all)
    assert_includes menu[:class], "hidden", "Menu should be hidden initially"

    # Click to show menu
    find("#test-mobile-menu button").click
    assert_not menu[:class].include?("hidden"), "Menu should be visible after toggle"

    # Click to hide menu
    find("#test-mobile-menu button").click
    assert_includes menu[:class], "hidden", "Menu should be hidden after second toggle"
  end

  test "handles multiple toggle buttons with proper structure" do
    visit root_path

    html = <<~HTML
      <div data-controller="mobile-menu" id="test-multi-toggle">
        <button id="btn1" data-action="click->mobile-menu#toggle">Toggle 1</button>
        <button id="btn2" data-action="click->mobile-menu#toggle">Toggle 2</button>
        <nav data-mobile-menu-target="menu" class="hidden">
          <a href="#">Menu content</a>
        </nav>
      </div>
    HTML

    add_stimulus_test_html(html)

    menu = find('#test-multi-toggle [data-mobile-menu-target="menu"]', visible: :all)

    # Hidden initially
    assert_includes menu[:class], "hidden", "Menu should be hidden"

    # First button shows menu
    find("#btn1").click
    assert_not menu[:class].include?("hidden"), "Menu should be visible after first button click"

    # Second button hides menu
    find("#btn2").click
    assert_includes menu[:class], "hidden", "Menu should be hidden after second button click"
  end

  test "works with initially visible menu" do
    visit root_path

    html = <<~HTML
      <div data-controller="mobile-menu" id="test-visible">
        <button data-action="click->mobile-menu#toggle">Toggle</button>
        <nav data-mobile-menu-target="menu">
          <a href="#">Visible Menu</a>
        </nav>
      </div>
    HTML

    add_stimulus_test_html(html)

    menu = find('#test-visible [data-mobile-menu-target="menu"]', visible: :all)

    # Menu should be visible initially (no hidden class)
    # Handle case where class attribute might be nil
    menu_classes = menu[:class] || ""
    assert_not menu_classes.include?("hidden"), "Menu should be visible initially"

    # Toggle to hide
    find("#test-visible button").click
    assert_includes menu[:class], "hidden", "Menu should be hidden after toggle"

    # Toggle to show again
    find("#test-visible button").click
    assert_not menu[:class].include?("hidden"), "Menu should be visible after second toggle"
  end
end
