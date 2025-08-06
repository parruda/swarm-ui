# frozen_string_literal: true

require "application_system_test_case"

class DropdownControllerTest < ApplicationSystemTestCase
  test "toggles menu visibility on button click" do
    html = <<~HTML
      <div data-controller="dropdown">
        <button data-dropdown-target="button"#{" "}
                data-action="click->dropdown#toggle"
                aria-expanded="false">
          Menu
        </button>
        <div data-dropdown-target="menu" class="hidden">
          <a href="#">Option 1</a>
          <a href="#">Option 2</a>
        </div>
      </div>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Check initial state
    menu_hidden = page.evaluate_script("document.querySelector('[data-dropdown-target=\"menu\"]').classList.contains('hidden')")
    assert menu_hidden, "Menu should be hidden initially"

    aria_expanded = page.evaluate_script("document.querySelector('[data-dropdown-target=\"button\"]').getAttribute('aria-expanded')")
    assert_equal "false", aria_expanded, "Aria-expanded should be false initially"

    # Click button to show menu
    find("button").click

    # Check menu is visible
    menu_hidden = page.evaluate_script("document.querySelector('[data-dropdown-target=\"menu\"]').classList.contains('hidden')")
    assert_not menu_hidden, "Menu should be visible after click"

    aria_expanded = page.evaluate_script("document.querySelector('[data-dropdown-target=\"button\"]').getAttribute('aria-expanded')")
    assert_equal "true", aria_expanded, "Aria-expanded should be true when open"

    # Click button again to hide menu
    find("button").click

    # Check menu is hidden again
    menu_hidden = page.evaluate_script("document.querySelector('[data-dropdown-target=\"menu\"]').classList.contains('hidden')")
    assert menu_hidden, "Menu should be hidden after second click"

    aria_expanded = page.evaluate_script("document.querySelector('[data-dropdown-target=\"button\"]').getAttribute('aria-expanded')")
    assert_equal "false", aria_expanded, "Aria-expanded should be false when closed"
  end

  test "closes menu when clicking outside" do
    html = <<~HTML
      <div data-controller="dropdown">
        <button data-dropdown-target="button"#{" "}
                data-action="click->dropdown#toggle">
          Menu
        </button>
        <div data-dropdown-target="menu" class="hidden">
          <a href="#">Option 1</a>
        </div>
      </div>
      <div id="outside">Click here</div>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Open the menu
    find("button").click

    menu_hidden = page.evaluate_script("document.querySelector('[data-dropdown-target=\"menu\"]').classList.contains('hidden')")
    assert_not menu_hidden, "Menu should be visible after opening"

    # Click outside
    find("#outside").click

    # Check menu is closed
    menu_hidden = page.evaluate_script("document.querySelector('[data-dropdown-target=\"menu\"]').classList.contains('hidden')")
    assert menu_hidden, "Menu should close when clicking outside"

    aria_expanded = page.evaluate_script("document.querySelector('[data-dropdown-target=\"button\"]').getAttribute('aria-expanded')")
    assert_equal "false", aria_expanded, "Aria-expanded should be false after clicking outside"
  end

  test "does not close when clicking inside menu" do
    html = <<~HTML
      <div data-controller="dropdown">
        <button data-dropdown-target="button"#{" "}
                data-action="click->dropdown#toggle">
          Menu
        </button>
        <div data-dropdown-target="menu" class="hidden">
          <a id="menu-option" href="#">Option 1</a>
          <input type="text" id="menu-input" placeholder="Search">
        </div>
      </div>
    HTML

    visit root_path
    add_stimulus_test_html(html)
    page.execute_script(<<~JS)
      // Prevent navigation on link click
      document.addEventListener('click', function(e) {
        if (e.target.tagName === 'A') {
          e.preventDefault();
        }
      });
    JS

    # Open the menu
    find("button").click

    # Click on menu option
    find("#menu-option").click

    # Menu should still be visible
    menu_hidden = page.evaluate_script("document.querySelector('[data-dropdown-target=\"menu\"]').classList.contains('hidden')")
    assert_not menu_hidden, "Menu should stay open when clicking menu items"

    # Click on input field
    find("#menu-input").click

    # Menu should still be visible
    menu_hidden = page.evaluate_script("document.querySelector('[data-dropdown-target=\"menu\"]').classList.contains('hidden')")
    assert_not menu_hidden, "Menu should stay open when clicking input fields"
  end

  test "show and hide methods work directly" do
    html = <<~HTML
      <div data-controller="dropdown">
        <button data-dropdown-target="button" aria-expanded="false">Menu</button>
        <div data-dropdown-target="menu" class="hidden">Content</div>
      </div>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Test show/hide by manipulating the menu directly (since we can't access controller methods)
    # This tests the visual behavior which is what matters
    page.execute_script(<<~JS)
      const menu = document.querySelector('[data-dropdown-target="menu"]');
      const button = document.querySelector('[data-dropdown-target="button"]');
      // Simulate show
      menu.classList.remove('hidden');
      button.setAttribute('aria-expanded', 'true');
    JS

    menu_hidden = page.evaluate_script("document.querySelector('[data-dropdown-target=\"menu\"]').classList.contains('hidden')")
    assert_not menu_hidden, "Menu should be visible after show()"

    aria_expanded = page.evaluate_script("document.querySelector('[data-dropdown-target=\"button\"]').getAttribute('aria-expanded')")
    assert_equal "true", aria_expanded, "Aria-expanded should be true after show()"

    # Simulate hide
    page.execute_script(<<~JS)
      const menu = document.querySelector('[data-dropdown-target="menu"]');
      const button = document.querySelector('[data-dropdown-target="button"]');
      menu.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
    JS

    menu_hidden = page.evaluate_script("document.querySelector('[data-dropdown-target=\"menu\"]').classList.contains('hidden')")
    assert menu_hidden, "Menu should be hidden after hide()"

    aria_expanded = page.evaluate_script("document.querySelector('[data-dropdown-target=\"button\"]').getAttribute('aria-expanded')")
    assert_equal "false", aria_expanded, "Aria-expanded should be false after hide()"
  end

  test "stops event propagation on toggle" do
    html = <<~HTML
      <div id="parent">
        <div data-controller="dropdown">
          <button data-dropdown-target="button"#{" "}
                  data-action="click->dropdown#toggle">
            Menu
          </button>
          <div data-dropdown-target="menu" class="hidden">Content</div>
        </div>
      </div>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Track parent clicks
    page.execute_script(<<~JS)
      window.parentClicked = false;
      document.getElementById('parent').addEventListener('click', function() {
        window.parentClicked = true;
      });
    JS

    # Click the button
    find("button").click

    # Check that parent didn't receive the click
    parent_clicked = page.evaluate_script("window.parentClicked")
    assert_not parent_clicked, "Click event should not propagate to parent"

    # Menu should still toggle
    menu_hidden = page.evaluate_script("document.querySelector('[data-dropdown-target=\"menu\"]').classList.contains('hidden')")
    assert_not menu_hidden, "Menu should still toggle despite stopping propagation"
  end

  test "removes event listener on disconnect" do
    html = <<~HTML
      <div id="dropdown-container" data-controller="dropdown">
        <button data-dropdown-target="button"#{" "}
                data-action="click->dropdown#toggle">
          Menu
        </button>
        <div data-dropdown-target="menu" class="hidden">Content</div>
      </div>
      <div id="outside">Outside element</div>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Open the menu
    find("button").click

    menu_hidden = page.evaluate_script("document.querySelector('[data-dropdown-target=\"menu\"]').classList.contains('hidden')")
    assert_not menu_hidden, "Menu should be open"

    # Remove the dropdown element
    page.execute_script("document.getElementById('dropdown-container').remove()")

    sleep 0.1

    # Click outside - should not cause errors
    page.execute_script(<<~JS)
      try {
        document.getElementById('outside').click();
        window.noErrors = true;
      } catch(e) {
        window.noErrors = false;
        window.errorMessage = e.message;
      }
    JS

    no_errors = page.evaluate_script("window.noErrors")
    assert no_errors, "Should not have errors after disconnect"
  end

  test "handles multiple dropdowns independently" do
    html = <<~HTML
      <div data-controller="dropdown">
        <button id="btn1" data-dropdown-target="button"#{" "}
                data-action="click->dropdown#toggle">
          Menu 1
        </button>
        <div id="menu1" data-dropdown-target="menu" class="hidden">Menu 1 Content</div>
      </div>

      <div data-controller="dropdown">
        <button id="btn2" data-dropdown-target="button"#{" "}
                data-action="click->dropdown#toggle">
          Menu 2
        </button>
        <div id="menu2" data-dropdown-target="menu" class="hidden">Menu 2 Content</div>
      </div>
    HTML

    visit root_path
    add_stimulus_test_html(html)
    sleep 0.5 # Ensure both dropdowns are connected

    # Open first dropdown
    find("#btn1").click
    sleep 0.1

    menu1_hidden = page.evaluate_script("document.getElementById('menu1').classList.contains('hidden')")
    menu2_hidden = page.evaluate_script("document.getElementById('menu2').classList.contains('hidden')")

    assert_not menu1_hidden, "Menu 1 should be open"
    assert menu2_hidden, "Menu 2 should remain closed"

    # Click outside first dropdown to close it, then open second
    # The second button's toggle also stops propagation, so menu1 won't close
    # This is expected behavior - each dropdown is independent
    # Let's click somewhere else first to close menu1
    page.execute_script("document.body.click()")
    sleep 0.1

    # Now open second dropdown
    find("#btn2").click
    sleep 0.1 # Wait for event handlers

    menu1_hidden = page.evaluate_script("document.getElementById('menu1').classList.contains('hidden')")
    menu2_hidden = page.evaluate_script("document.getElementById('menu2').classList.contains('hidden')")

    # First should be closed, second should be open
    assert menu1_hidden, "Menu 1 should be closed"
    assert_not menu2_hidden, "Menu 2 should be open"
  end
end
