require "application_system_test_case"

class ConfigurationsTest < ApplicationSystemTestCase
  setup do
    @configuration = create(:swarm_configuration, 
      name: "Production Swarm",
      description: "Main production configuration"
    )
    @template = create(:instance_template, :frontend, name: "Frontend Template")
  end

  test "viewing configurations list" do
    visit configurations_url
    
    assert_selector "h1", text: "Swarm Configurations"
    assert_text "Production Swarm"
    assert_text "Main production configuration"
    assert_text "3 instances" # Based on factory default
    
    # Should have action buttons
    assert_link "Launch"
    assert_link "Edit"
    assert_link "Clone"
  end

  test "creating a new configuration" do
    visit configurations_url
    click_on "New Configuration"
    
    fill_in "Name", with: "Development Swarm"
    fill_in "Description", with: "Configuration for development environment"
    
    # The YAML editor should have default template
    yaml_field = find("#swarm_configuration_config_yaml")
    assert yaml_field.value.include?("swarm:")
    assert yaml_field.value.include?("name: \"New Swarm\"")
    
    # Update YAML
    yaml_content = <<~YAML
      swarm:
        name: "Dev Swarm"
        main: "leader"
        instances:
          leader:
            description: "Main development instance"
            model: "sonnet"
            prompt: "You are a development assistant"
    YAML
    
    fill_in "swarm_configuration_config_yaml", with: yaml_content
    
    click_on "Save Configuration"
    
    assert_text "Configuration was successfully created"
    assert_current_path edit_configuration_path(SwarmConfiguration.last)
    assert_equal "Development Swarm", SwarmConfiguration.last.name
  end

  test "editing a configuration" do
    visit configuration_url(@configuration)
    click_on "Edit"
    
    assert_selector "h1", text: "Edit Configuration: Production Swarm"
    
    # Should show both visual builder and YAML editor
    assert_selector "#swarm-builder"
    assert_selector "#swarm_configuration_config_yaml"
    
    # Update configuration
    fill_in "Name", with: "Updated Production Swarm"
    
    # Update YAML to add a new instance
    current_yaml = find("#swarm_configuration_config_yaml").value
    updated_yaml = current_yaml.sub("Agent2:", "Agent2:\n            Agent3:")
    fill_in "swarm_configuration_config_yaml", with: updated_yaml
    
    click_on "Save Configuration"
    
    assert_text "Configuration was successfully updated"
    assert_current_path configuration_path(@configuration)
    
    @configuration.reload
    assert_equal "Updated Production Swarm", @configuration.name
  end

  test "validating YAML syntax" do
    visit new_configuration_url
    
    fill_in "Name", with: "Invalid Config"
    
    # Enter invalid YAML
    fill_in "swarm_configuration_config_yaml", with: "invalid: yaml: content:"
    
    click_on "Save Configuration"
    
    # Should show error and stay on form
    assert_text "Invalid YAML syntax"
    assert_selector "form#new_swarm_configuration"
  end

  test "cloning a configuration" do
    visit configurations_url
    
    within "#configuration_#{@configuration.id}" do
      click_on "Clone"
    end
    
    assert_text "Configuration was successfully cloned"
    assert_current_path edit_configuration_path(SwarmConfiguration.last)
    
    cloned = SwarmConfiguration.last
    assert_equal "Production Swarm (Copy)", cloned.name
    assert_equal @configuration.config_yaml, cloned.config_yaml
  end

  test "exporting configuration as YAML" do
    visit configuration_url(@configuration)
    
    click_on "Export YAML"
    
    # This would trigger a download in a real browser
    # We can't fully test downloads in system tests
    # but we can verify the link exists and has correct attributes
    export_link = find_link("Export YAML")
    assert_equal export_configuration_path(@configuration), export_link[:href]
  end

  test "deleting a configuration without sessions" do
    visit configurations_url
    
    within "#configuration_#{@configuration.id}" do
      accept_confirm do
        click_on "Delete"
      end
    end
    
    assert_text "Configuration was successfully deleted"
    assert_no_text "Production Swarm"
  end

  test "preventing deletion of configuration with sessions" do
    # Create a session using this configuration
    create(:session, swarm_configuration: @configuration)
    
    visit configurations_url
    
    within "#configuration_#{@configuration.id}" do
      accept_confirm do
        click_on "Delete"
      end
    end
    
    assert_text "Cannot delete configuration that has been used in sessions"
    assert_text "Production Swarm" # Still visible
  end

  test "launching session from configuration" do
    # Mock SwarmLauncher
    SwarmLauncher.any_instance.stubs(:launch).returns("20250104_140000")
    
    visit configuration_url(@configuration)
    
    click_on "Launch Session"
    
    # Should redirect to new session page with configuration preselected
    assert_current_path new_session_path
    assert_field "Saved Configuration", with: @configuration.id
  end

  test "visual builder interaction" do
    skip "Requires JavaScript for drag-and-drop functionality"
    
    visit edit_configuration_url(@configuration)
    
    # Drag template to builder
    template_element = find("[data-template-id='#{@template.id}']")
    builder = find("#swarm-builder")
    
    template_element.drag_to(builder)
    
    # Should update the configuration
    assert_selector ".instance-node", text: "Frontend Template"
  end

  test "configuration details page" do
    visit configuration_url(@configuration)
    
    assert_selector "h1", text: "Production Swarm"
    assert_text "Main production configuration"
    assert_text "3 instances"
    
    # Should show YAML preview
    assert_selector "pre.yaml-preview"
    
    # Action buttons
    assert_link "Edit"
    assert_link "Clone"
    assert_link "Export YAML"
    assert_link "Launch Session"
  end

  test "template badge display" do
    template_config = create(:swarm_configuration, 
      name: "Template Config",
      is_template: true
    )
    
    visit configurations_url
    
    within "#configuration_#{template_config.id}" do
      assert_selector ".badge", text: "Template"
    end
    
    within "#configuration_#{@configuration.id}" do
      assert_selector ".badge", text: "Configuration"
    end
  end

  test "empty state for configurations" do
    SwarmConfiguration.destroy_all
    
    visit configurations_url
    
    assert_text "No configurations yet"
    assert_link "Create your first configuration"
  end

  test "configuration search and filtering" do
    skip "Feature not yet implemented"
    
    create(:swarm_configuration, name: "Dev Environment")
    create(:swarm_configuration, name: "Test Environment")
    create(:swarm_configuration, name: "Staging Environment")
    
    visit configurations_url
    
    fill_in "Search", with: "Environment"
    
    assert_text "Dev Environment"
    assert_text "Test Environment"
    assert_text "Staging Environment"
    assert_no_text "Production Swarm"
  end
end