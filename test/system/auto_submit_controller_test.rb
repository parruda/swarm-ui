# frozen_string_literal: true

require "application_system_test_case"

class AutoSubmitControllerTest < ApplicationSystemTestCase
  test "submits form when submit action is triggered" do
    # Create HTML with form and auto-submit controller
    html = <<~HTML
      <form id="test-form" data-controller="auto-submit" action="/test" method="post">
        <input type="text" name="test_field" value="test_value">
        <button type="button" data-action="click->auto-submit#submit">Submit via controller</button>
      </form>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Add form submit handler to track submission
    page.execute_script(<<~JS)
      window.formSubmitted = false;
      document.getElementById('test-form').addEventListener('submit', function(e) {
        e.preventDefault();
        window.formSubmitted = true;
      });
    JS

    # Click the button to trigger submit
    find("button").click

    # Check that form was submitted
    form_submitted = page.evaluate_script("window.formSubmitted")
    assert form_submitted, "Form should be submitted when submit action is triggered"
  end

  test "submit can be triggered programmatically" do
    # Create HTML with form
    html = <<~HTML
      <form id="test-form" data-controller="auto-submit" action="/test">
        <input type="text" name="field" value="value">
      </form>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Add form submit handler
    page.execute_script(<<~JS)
      window.formSubmitted = false;
      document.getElementById('test-form').addEventListener('submit', function(e) {
        e.preventDefault();
        window.formSubmitted = true;
      });
    JS

    # Trigger submit programmatically
    result = trigger_stimulus_action("auto-submit", "submit")
    assert result, "Should be able to trigger submit action"

    # Check that form was submitted
    form_submitted = page.evaluate_script("window.formSubmitted")
    assert form_submitted, "Form should be submitted when action is triggered programmatically"
  end

  test "works with input change event" do
    # Create HTML with form that auto-submits on change
    html = <<~HTML
      <form id="test-form" data-controller="auto-submit" action="/test">
        <select name="option" data-action="change->auto-submit#submit">
          <option value="1">Option 1</option>
          <option value="2">Option 2</option>
        </select>
      </form>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Add form submit handler
    page.execute_script(<<~JS)
      window.formSubmitted = false;
      window.submittedValue = null;
      document.getElementById('test-form').addEventListener('submit', function(e) {
        e.preventDefault();
        window.formSubmitted = true;
        window.submittedValue = e.target.option.value;
      });
    JS

    # Change select value
    select "Option 2", from: "option"

    # Check that form was submitted with correct value
    form_submitted = page.evaluate_script("window.formSubmitted")
    submitted_value = page.evaluate_script("window.submittedValue")

    assert form_submitted, "Form should be submitted on select change"
    assert_equal "2", submitted_value, "Should submit with selected value"
  end

  test "preserves form method and action" do
    # Create HTML with specific form attributes
    html = <<~HTML
      <form id="test-form"#{" "}
            data-controller="auto-submit"#{" "}
            action="/custom/path"#{" "}
            method="post"
            data-turbo="false">
        <input type="hidden" name="id" value="123">
      </form>
    HTML

    visit root_path
    add_stimulus_test_html(html)

    # Check form attributes are preserved
    form_action = page.evaluate_script("document.getElementById('test-form').action")
    form_method = page.evaluate_script("document.getElementById('test-form').method")
    form_turbo = page.evaluate_script("document.getElementById('test-form').dataset.turbo")

    assert_includes form_action, "/custom/path", "Form action should be preserved"
    assert_equal "post", form_method, "Form method should be preserved"
    assert_equal "false", form_turbo, "Form data attributes should be preserved"
  end
end
