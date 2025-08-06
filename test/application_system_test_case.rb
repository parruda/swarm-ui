# frozen_string_literal: true

require "test_helper"
require "system/stimulus_test_helper"

class ApplicationSystemTestCase < ActionDispatch::SystemTestCase
  include StimulusTestHelper
  # Use Cuprite for faster JavaScript testing
  # Set USE_SELENIUM=true to use Selenium instead
  if ENV["USE_SELENIUM"]
    driven_by :selenium, using: :headless_chrome, screen_size: [1400, 1400]
  else
    require "capybara/cuprite"
    driven_by :cuprite, screen_size: [1400, 1400], options: {
      js_errors: true,
      headless: true,
      process_timeout: 20,
      timeout: 20,
      browser_options: { "no-sandbox" => nil },
    }
  end

  # Helper method to wait for Stimulus controller to be ready
  def wait_for_stimulus
    assert_css("[data-controller]", wait: 5)
  end

  # Helper to check if a Stimulus controller is connected
  def stimulus_controller_connected?(controller_name)
    page.evaluate_script(<<~JS)
      (() => {
        const element = document.querySelector('[data-controller*="#{controller_name}"]');
        if (!element) return false;
        const application = window.Stimulus;
        if (!application) return false;
        try {
          const controller = application.getControllerForElementAndIdentifier(element, '#{controller_name}');
          return controller !== null;
        } catch(e) {
          return false;
        }
      })()
    JS
  end

  # Helper to trigger Stimulus action
  def trigger_stimulus_action(controller_name, action_name, element_selector = nil)
    selector = element_selector || "[data-controller*=\"#{controller_name}\"]"
    page.evaluate_script(<<~JS)
      (() => {
        const element = document.querySelector('#{selector}');
        if (!element) return false;
        const application = window.Stimulus || (typeof Stimulus !== 'undefined' ? Stimulus : null);
        if (!application) return false;
        const controller = application.getControllerForElementAndIdentifier(element, '#{controller_name}');
        if (!controller || !controller.#{action_name}) return false;
        controller.#{action_name}();
        return true;
      })()
    JS
  end

  # Helper to get Stimulus controller property value
  def get_stimulus_value(controller_name, property_name, element_selector = nil)
    selector = element_selector || "[data-controller*=\"#{controller_name}\"]"
    page.evaluate_script(<<~JS)
      (() => {
        const element = document.querySelector('#{selector}');
        if (!element) return null;
        const application = window.Stimulus || (typeof Stimulus !== 'undefined' ? Stimulus : null);
        if (!application) return null;
        const controller = application.getControllerForElementAndIdentifier(element, '#{controller_name}');
        if (!controller) return null;
        return controller.#{property_name};
      })()
    JS
  end

  # Helper to set Stimulus controller property value
  def set_stimulus_value(controller_name, property_name, value, element_selector = nil)
    selector = element_selector || "[data-controller*=\"#{controller_name}\"]"
    js_value = value.is_a?(String) ? "'#{value}'" : value.to_s
    page.evaluate_script(<<~JS)
      (() => {
        const element = document.querySelector('#{selector}');
        if (!element) return false;
        const application = window.Stimulus || (typeof Stimulus !== 'undefined' ? Stimulus : null);
        if (!application) return false;
        const controller = application.getControllerForElementAndIdentifier(element, '#{controller_name}');
        if (!controller) return false;
        controller.#{property_name} = #{js_value};
        return true;
      })()
    JS
  end
end
