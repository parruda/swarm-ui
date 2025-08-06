# frozen_string_literal: true

# Helper module for testing Stimulus controllers in system tests
module StimulusTestHelper
  # Load a Stimulus controller on the page
  # This visits the root page to ensure Stimulus is loaded,
  # then adds the test HTML to the page
  def load_stimulus_controller(html)
    # Visit root to load the application JavaScript
    visit(root_path)

    # Inject test HTML
    page.execute_script("document.body.insertAdjacentHTML('beforeend', `#{html}`)")

    # Wait for Stimulus to auto-detect the new controller
    sleep(0.2)
  end

  # Alternative approach - inject into an existing page element
  def add_stimulus_test_html(html)
    escaped_html = html.gsub("`", '\`').gsub("${", '\\${')
    page.execute_script(<<~JS)
      const testContainer = document.createElement('div');
      testContainer.id = 'stimulus-test-container';
      testContainer.innerHTML = `#{escaped_html}`;
      document.body.appendChild(testContainer);
    JS

    # Give Stimulus time to detect and connect
    sleep(0.5)
  end
end
