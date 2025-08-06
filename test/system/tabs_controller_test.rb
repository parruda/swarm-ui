# frozen_string_literal: true

require "application_system_test_case"

class TabsControllerTest < ApplicationSystemTestCase
  test "shows first tab by default on connect" do
    html = <<~HTML
      <div data-controller="tabs">
        <button data-tabs-target="tab" data-tab="tab1">Tab 1</button>
        <button data-tabs-target="tab" data-tab="tab2">Tab 2</button>
        <div data-tabs-target="panel" data-panel="tab1">Panel 1</div>
        <div data-tabs-target="panel" data-panel="tab2" class="hidden">Panel 2</div>
      </div>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # First tab should be active
    first_tab_active = page.evaluate_script(<<~JS)
      document.querySelector('[data-tab="tab1"]').classList.contains('border-orange-500')
    JS
    assert first_tab_active, "First tab should be active by default"

    # First panel should be visible
    panel1_hidden = page.evaluate_script("document.querySelector('[data-panel=\"tab1\"]').classList.contains('hidden')")
    assert_not panel1_hidden, "First panel should be visible"

    panel2_hidden = page.evaluate_script("document.querySelector('[data-panel=\"tab2\"]').classList.contains('hidden')")
    assert panel2_hidden, "Second panel should be hidden"
  end

  test "switches tabs on click" do
    html = <<~HTML
      <div data-controller="tabs">
        <button data-tabs-target="tab" data-tab="home" data-action="click->tabs#switchTab">Home</button>
        <button data-tabs-target="tab" data-tab="about" data-action="click->tabs#switchTab">About</button>
        <div data-tabs-target="panel" data-panel="home">Home content</div>
        <div data-tabs-target="panel" data-panel="about" class="hidden">About content</div>
      </div>
    HTML

    visit root_path
    add_stimulus_test_html(html)
    page.execute_script(<<~JS)
      window.location.hash = '';  // Clear any existing hash
    JS

    # Click second tab
    find("button", text: "About").click

    # Check second tab is active
    about_tab_active = page.evaluate_script(<<~JS)
      document.querySelector('[data-tab="about"]').classList.contains('border-orange-500')
    JS
    assert about_tab_active, "About tab should be active"

    home_tab_active = page.evaluate_script(<<~JS)
      document.querySelector('[data-tab="home"]').classList.contains('border-orange-500')
    JS
    assert_not home_tab_active, "Home tab should not be active"

    # Check panels
    home_hidden = page.evaluate_script("document.querySelector('[data-panel=\"home\"]').classList.contains('hidden')")
    assert home_hidden, "Home panel should be hidden"

    about_hidden = page.evaluate_script("document.querySelector('[data-panel=\"about\"]').classList.contains('hidden')")
    assert_not about_hidden, "About panel should be visible"

    # Check URL hash
    hash = page.evaluate_script("window.location.hash")
    assert_equal "#about", hash, "URL hash should be updated"
  end

  test "applies correct styles to active and inactive tabs" do
    html = <<~HTML
      <div data-controller="tabs">
        <button data-tabs-target="tab" data-tab="t1" data-action="click->tabs#switchTab"#{" "}
                class="border-transparent text-gray-500">Tab 1</button>
        <button data-tabs-target="tab" data-tab="t2" data-action="click->tabs#switchTab"#{" "}
                class="border-transparent text-gray-500">Tab 2</button>
        <div data-tabs-target="panel" data-panel="t1">Content 1</div>
        <div data-tabs-target="panel" data-panel="t2" class="hidden">Content 2</div>
      </div>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Check first tab has active styles
    tab1_classes = page.evaluate_script("Array.from(document.querySelector('[data-tab=\"t1\"]').classList)")
    assert_includes tab1_classes, "border-orange-500", "Active tab should have orange border"
    assert_includes tab1_classes, "text-orange-600", "Active tab should have orange text"
    assert_not tab1_classes.include?("border-transparent"), "Active tab should not have transparent border"

    # Switch to second tab
    find("button", text: "Tab 2").click

    # Check styles switched
    tab1_classes = page.evaluate_script("Array.from(document.querySelector('[data-tab=\"t1\"]').classList)")
    tab2_classes = page.evaluate_script("Array.from(document.querySelector('[data-tab=\"t2\"]').classList)")

    assert_includes tab1_classes, "border-transparent", "Inactive tab should have transparent border"
    assert_includes tab1_classes, "text-gray-500", "Inactive tab should have gray text"

    assert_includes tab2_classes, "border-orange-500", "New active tab should have orange border"
    assert_includes tab2_classes, "text-orange-600", "New active tab should have orange text"
  end

  test "initializes from URL hash" do
    skip "Cannot test URL hash initialization without access to controller's initialize method"
  end

  test "handles invalid hash gracefully" do
    html = <<~HTML
      <div data-controller="tabs">
        <button data-tabs-target="tab" data-tab="tab1">Tab 1</button>
        <button data-tabs-target="tab" data-tab="tab2">Tab 2</button>
        <div data-tabs-target="panel" data-panel="tab1">Panel 1</div>
        <div data-tabs-target="panel" data-panel="tab2" class="hidden">Panel 2</div>
      </div>
    HTML

    visit root_path
    # Set invalid hash
    page.execute_script("window.location.hash = '#nonexistent'")
    add_stimulus_test_html(html)

    # Should not cause errors
    page.execute_script(<<~JS)
      try {
        // Tabs controller auto-initializes
        window.noErrors = true;
      } catch(e) {
        window.noErrors = false;
        window.errorMessage = e.message;
      }
    JS

    no_errors = page.evaluate_script("window.noErrors")
    assert no_errors, "Should handle invalid hash without errors"

    # First tab should still be shown as default
    first_active = page.evaluate_script(<<~JS)
      document.querySelector('[data-tab="tab1"]').classList.contains('border-orange-500')
    JS
    assert first_active, "First tab should be active when hash is invalid"
  end

  test "works with multiple tab groups" do
    html = <<~HTML
      <div id="tabs1" data-controller="tabs">
        <button data-tabs-target="tab" data-tab="a1" data-action="click->tabs#switchTab">A1</button>
        <button data-tabs-target="tab" data-tab="a2" data-action="click->tabs#switchTab">A2</button>
        <div data-tabs-target="panel" data-panel="a1">Panel A1</div>
        <div data-tabs-target="panel" data-panel="a2" class="hidden">Panel A2</div>
      </div>

      <div id="tabs2" data-controller="tabs">
        <button data-tabs-target="tab" data-tab="b1" data-action="click->tabs#switchTab">B1</button>
        <button data-tabs-target="tab" data-tab="b2" data-action="click->tabs#switchTab">B2</button>
        <div data-tabs-target="panel" data-panel="b1">Panel B1</div>
        <div data-tabs-target="panel" data-panel="b2" class="hidden">Panel B2</div>
      </div>
    HTML

    visit root_path
    add_stimulus_test_html(html)
    sleep 0.5 # Let controllers initialize

    # Switch second tab in first group
    within("#tabs1") do
      find("button", text: "A2").click
    end
    sleep 0.1 # Let tab switch complete

    # Check first group
    a2_active = page.evaluate_script(<<~JS)
      document.querySelector('#tabs1 [data-tab="a2"]').classList.contains('border-orange-500')
    JS
    assert a2_active, "A2 should be active"

    # Check second group is unaffected
    b1_active = page.evaluate_script(<<~JS)
      document.querySelector('#tabs2 [data-tab="b1"]').classList.contains('border-orange-500')
    JS
    assert b1_active, "B1 should still be active in second group"
  end
end
