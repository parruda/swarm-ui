require "application_system_test_case"

class InstanceTemplatesTest < ApplicationSystemTestCase
  setup do
    @backend_template = create(:instance_template, 
      name: "Backend Developer",
      instance_type: "backend"
    )
    @frontend_template = create(:instance_template, :frontend,
      name: "Frontend Expert"
    )
    @devops_template = create(:instance_template, :devops,
      name: "DevOps Engineer"
    )
    @configuration = create(:swarm_configuration)
  end

  test "viewing instance templates grouped by type" do
    visit instance_templates_url
    
    assert_selector "h1", text: "Instance Templates"
    
    # Should group by type
    assert_selector "h2", text: "backend"
    assert_selector "h2", text: "frontend"
    assert_selector "h2", text: "devops"
    
    # Should show templates under each type
    within ".backend-templates" do
      assert_text "Backend Developer"
    end
    
    within ".frontend-templates" do
      assert_text "Frontend Expert"
    end
    
    within ".devops-templates" do
      assert_text "DevOps Engineer"
    end
  end

  test "creating a new Claude instance template" do
    visit instance_templates_url
    click_on "New Template"
    
    fill_in "Name", with: "Database Expert"
    fill_in "Description", with: "Specializes in database design and optimization"
    select "database", from: "Instance Type"
    
    # Claude provider fields
    select "claude", from: "Provider"
    fill_in "Model", with: "claude-3-5-sonnet-20241022"
    fill_in "Temperature", with: "0.0"
    
    fill_in "Prompt", with: "You are a database expert specializing in PostgreSQL and query optimization."
    
    # Tools
    fill_in "Allowed Tools", with: "Read, Write, Edit, Bash(psql:*)"
    fill_in "Disallowed Tools", with: "Delete"
    
    check "Vibe Mode"
    
    click_on "Create Template"
    
    assert_text "Instance template was successfully created"
    assert_current_path instance_template_path(InstanceTemplate.last)
    
    new_template = InstanceTemplate.last
    assert_equal "Database Expert", new_template.name
    assert_equal "database", new_template.instance_type
    assert_equal "Read,Write,Edit,Bash(psql:*)", new_template.allowed_tools
    assert new_template.vibe
  end

  test "creating an OpenAI instance template" do
    visit new_instance_template_url
    
    fill_in "Name", with: "GPT Assistant"
    select "research", from: "Instance Type"
    
    # OpenAI provider fields
    select "openai", from: "Provider"
    fill_in "Model", with: "gpt-4"
    fill_in "Temperature", with: "0.7"
    select "chat_completion", from: "API Version"
    fill_in "OpenAI Token Environment Variable", with: "OPENAI_API_KEY"
    fill_in "Base URL", with: "https://api.openai.com/v1"
    
    fill_in "Prompt", with: "You are a research assistant using GPT-4."
    
    click_on "Create Template"
    
    assert_text "Instance template was successfully created"
    
    new_template = InstanceTemplate.last
    assert_equal "openai", new_template.provider
    assert_equal "gpt-4", new_template.model
    assert_equal 0.7, new_template.temperature
  end

  test "viewing template details" do
    # Associate template with configuration
    @configuration.swarm_instance_templates.create(
      instance_template: @backend_template,
      instance_name: "backend_instance"
    )
    
    visit instance_template_url(@backend_template)
    
    assert_selector "h1", text: "Backend Developer"
    assert_text @backend_template.description
    assert_text "Type: backend"
    assert_text "Model: #{@backend_template.model}"
    
    # Should show YAML preview
    assert_selector ".yaml-preview"
    assert_text "description:"
    assert_text "model:"
    assert_text "prompt:"
    
    # Should show associated configurations
    assert_text "Used in Configurations"
    assert_link @configuration.name
    
    # Action buttons
    assert_link "Edit"
    assert_button "Delete"
  end

  test "editing a template" do
    visit instance_template_url(@frontend_template)
    click_on "Edit"
    
    fill_in "Name", with: "Frontend Specialist v2"
    fill_in "Description", with: "Updated frontend expert with React focus"
    
    # Update tools
    fill_in "Allowed Tools", with: "Read, Write, Edit, Bash(npm:*), Bash(yarn:*)"
    
    click_on "Update Template"
    
    assert_text "Instance template was successfully updated"
    assert_current_path instance_template_path(@frontend_template)
    
    @frontend_template.reload
    assert_equal "Frontend Specialist v2", @frontend_template.name
    assert_equal "Read,Write,Edit,Bash(npm:*),Bash(yarn:*)", @frontend_template.allowed_tools
  end

  test "deleting a template without associations" do
    visit instance_template_url(@devops_template)
    
    accept_confirm do
      click_button "Delete"
    end
    
    assert_text "Instance template was successfully deleted"
    assert_current_path instance_templates_path
    assert_no_text "DevOps Engineer"
  end

  test "preventing deletion of template with associations" do
    # Associate template with configuration
    @configuration.swarm_instance_templates.create(
      instance_template: @backend_template,
      instance_name: "backend_instance"
    )
    
    visit instance_template_url(@backend_template)
    
    accept_confirm do
      click_button "Delete"
    end
    
    assert_text "Cannot delete template that is used in configurations"
    assert_text "Backend Developer" # Still visible
  end

  test "tool pattern builder" do
    skip "Requires JavaScript for dynamic tool pattern building"
    
    visit new_instance_template_url
    
    # Add custom tool pattern
    within ".tools-builder" do
      fill_in "Custom Tool", with: "Bash(docker:*)"
      click_button "Add"
      
      assert_selector "input[value='Bash(docker:*)']", checked: true
    end
  end

  test "provider field toggle" do
    skip "Requires JavaScript for dynamic field toggling"
    
    visit new_instance_template_url
    
    # Initially should show Claude fields
    assert_selector "#claude-fields", visible: true
    assert_selector "#openai-fields", visible: false
    
    # Switch to OpenAI
    select "openai", from: "Provider"
    
    assert_selector "#claude-fields", visible: false
    assert_selector "#openai-fields", visible: true
  end

  test "template library view" do
    # Create more templates for better library view
    create(:instance_template, name: "Testing Expert", instance_type: "testing")
    create(:instance_template, name: "Documentation Writer", instance_type: "documentation")
    
    visit instance_templates_url
    
    # Should show all instance types
    assert_selector ".template-group", count: 5 # backend, frontend, devops, testing, documentation
    
    # Each template should have a card with actions
    within "#template_#{@backend_template.id}" do
      assert_text "Backend Developer"
      assert_text @backend_template.description
      assert_link "View"
      assert_link "Edit"
      assert_link "Use in Configuration"
    end
  end

  test "using template in configuration" do
    visit instance_template_url(@frontend_template)
    
    click_link "Use in Configuration"
    
    # Should redirect to configurations with template selected
    assert_current_path new_configuration_path
    assert_text "Template: Frontend Expert"
  end

  test "empty state for templates" do
    InstanceTemplate.destroy_all
    
    visit instance_templates_url
    
    assert_text "No templates created yet"
    assert_link "Create your first template"
  end

  test "template validation errors" do
    visit new_instance_template_url
    
    # Submit without required fields
    click_on "Create Template"
    
    assert_text "can't be blank"
    assert_selector ".field_with_errors"
  end

  test "template search and filtering" do
    skip "Feature not yet implemented"
    
    visit instance_templates_url
    
    # Filter by type
    select "backend", from: "Filter by type"
    
    assert_text "Backend Developer"
    assert_no_text "Frontend Expert"
    assert_no_text "DevOps Engineer"
    
    # Search by name
    fill_in "Search", with: "Expert"
    
    assert_text "Frontend Expert"
    assert_no_text "Backend Developer"
  end
end