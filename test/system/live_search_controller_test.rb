# frozen_string_literal: true

require "application_system_test_case"

class LiveSearchControllerTest < ApplicationSystemTestCase
  test "auto-focuses input on connect" do
    html = <<~HTML
      <form data-controller="live-search">
        <input type="text" data-live-search-target="input" value="test">
        <button data-live-search-target="clearButton">Clear</button>
      </form>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Check input is focused
    focused = page.evaluate_script("document.activeElement === document.querySelector('[data-live-search-target=\"input\"]')")
    assert focused, "Input should be auto-focused"

    # Check cursor is at end of text
    selection_start = page.evaluate_script("document.querySelector('[data-live-search-target=\"input\"]').selectionStart")
    selection_end = page.evaluate_script("document.querySelector('[data-live-search-target=\"input\"]').selectionEnd")
    assert_equal 4, selection_start, "Cursor should be at end of text"
    assert_equal 4, selection_end, "Cursor should be at end of text"
  end

  test "shows clear button when input has value" do
    html = <<~HTML
      <form data-controller="live-search" data-action="input->live-search#search">
        <input type="text" data-live-search-target="input">
        <button data-live-search-target="clearButton">Clear</button>
      </form>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    sleep 0.5 # Wait for controller to initialize and run initial toggle

    # Clear button should be hidden when input is empty
    clear_display = page.evaluate_script("document.querySelector('[data-live-search-target=\"clearButton\"]').style.display")
    assert_equal "none", clear_display, "Clear button should be hidden when input is empty"

    # Type something and trigger input event
    page.execute_script(<<~JS)
      const input = document.querySelector('[data-live-search-target="input"]');
      input.value = 'search term';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    JS

    sleep 0.1 # Wait for the toggle to happen

    # Clear button should be visible
    clear_display = page.evaluate_script("document.querySelector('[data-live-search-target=\"clearButton\"]').style.display")
    assert_equal "", clear_display, "Clear button should be visible when input has value"
  end

  test "debounces search input" do
    html = <<~HTML
      <form data-controller="live-search" data-action="input->live-search#search">
        <input type="text" data-live-search-target="input">
      </form>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Track form submissions
    page.execute_script(<<~JS)
      window.submitCount = 0;
      window.submittedValues = [];

      const form = document.querySelector('form');
      form.requestSubmit = function() {
        window.submitCount++;
        window.submittedValues.push(document.querySelector('[data-live-search-target="input"]').value);
      };
    JS

    # Type multiple characters quickly
    input = find("[data-live-search-target='input']")
    input.send_keys("t")
    sleep 0.05
    input.send_keys("e")
    sleep 0.05
    input.send_keys("s")
    sleep 0.05
    input.send_keys("t")

    # Should not submit immediately
    submit_count = page.evaluate_script("window.submitCount")
    assert_equal 0, submit_count, "Should not submit while typing"

    # Wait for debounce (300ms + buffer)
    sleep 0.4

    # Should submit once after debounce
    submit_count = page.evaluate_script("window.submitCount")
    assert_equal 1, submit_count, "Should submit once after debounce period"

    submitted_values = page.evaluate_script("window.submittedValues")
    assert_equal ["test"], submitted_values, "Should submit final value"
  end

  test "submits immediately on Enter key" do
    html = <<~HTML
      <form data-controller="live-search"#{" "}
            data-action="input->live-search#search keydown->live-search#submitNow">
        <input type="text" data-live-search-target="input">
      </form>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Track submissions
    page.execute_script(<<~JS)
      window.submitCount = 0;

      const form = document.querySelector('form');
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        window.submitCount++;
      });
    JS

    # Type and immediately press Enter
    input = find("[data-live-search-target='input']")
    input.set("quick search")

    # Press Enter
    input.send_keys(:return)

    # Should submit immediately (not wait for debounce)
    submit_count = page.evaluate_script("window.submitCount")
    assert_equal 1, submit_count, "Should submit immediately on Enter"
  end

  test "clears search and submits form" do
    html = <<~HTML
      <form data-controller="live-search">
        <input type="text" data-live-search-target="input" value="existing search">
        <button data-live-search-target="clearButton"#{" "}
                data-action="click->live-search#clearSearch">Clear</button>
      </form>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Track submissions
    page.execute_script(<<~JS)
      window.submitCount = 0;
      window.lastSubmittedValue = null;

      const form = document.querySelector('form');
      form.requestSubmit = function() {
        window.submitCount++;
        window.lastSubmittedValue = document.querySelector('[data-live-search-target="input"]').value;
      };
    JS

    # Input should have initial value
    input_value = page.evaluate_script("document.querySelector('[data-live-search-target=\"input\"]').value")
    assert_equal "existing search", input_value

    # Click clear button
    find("[data-live-search-target='clearButton']").click

    # Input should be cleared
    input_value = page.evaluate_script("document.querySelector('[data-live-search-target=\"input\"]').value")
    assert_equal "", input_value, "Input should be cleared"

    # Form should be submitted
    submit_count = page.evaluate_script("window.submitCount")
    assert_equal 1, submit_count, "Form should be submitted after clear"

    # Submitted value should be empty
    submitted_value = page.evaluate_script("window.lastSubmittedValue")
    assert_equal "", submitted_value, "Should submit empty value"

    # Clear button should be hidden
    clear_display = page.evaluate_script("document.querySelector('[data-live-search-target=\"clearButton\"]').style.display")
    assert_equal "none", clear_display, "Clear button should be hidden after clearing"
  end

  test "clears timer on disconnect" do
    html = <<~HTML
      <form id="search-form" data-controller="live-search">
        <input type="text" data-live-search-target="input">
      </form>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    page.execute_script(<<~JS)
      window.submitCount = 0;

      const form = document.querySelector('form');
      form.requestSubmit = function() {
        window.submitCount++;
      };
    JS

    # Start typing to set a timer
    find("[data-live-search-target='input']").set("test")

    # Remove form immediately (before debounce completes)
    page.execute_script("document.getElementById('search-form').remove()")

    # Wait longer than debounce period
    sleep 0.5

    # Should not have submitted (timer was cleared)
    submit_count = page.evaluate_script("window.submitCount")
    assert_equal 0, submit_count, "Should not submit after disconnect"
  end

  test "handles forms without requestSubmit support" do
    skip "Cannot reliably test form submission fallback without direct controller access"
  end
end
