require "test_helper"

class InstanceTemplatesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @instance_template = create(:instance_template)
    @swarm_configuration = create(:swarm_configuration)
  end

  test "should get index" do
    # Create templates with different types
    frontend_template = create(:instance_template, :frontend)
    devops_template = create(:instance_template, :devops)
    
    get instance_templates_url
    assert_response :success
    assert_not_nil assigns(:instance_templates)
    assert_not_nil assigns(:templates_by_type)
    
    templates_by_type = assigns(:templates_by_type)
    assert templates_by_type.key?('backend')
    assert templates_by_type.key?('frontend')
    assert templates_by_type.key?('devops')
  end

  test "should get new" do
    get new_instance_template_url
    assert_response :success
    
    template = assigns(:instance_template)
    assert_not_nil template
    assert_equal 'claude-3-5-sonnet-20241022', template.model
    assert_equal 'claude', template.provider
    assert_equal 0.0, template.temperature
    assert_equal 'backend', template.instance_type
  end

  test "should create instance template" do
    assert_difference('InstanceTemplate.count', 1) do
      post instance_templates_url, params: {
        instance_template: {
          name: "New Template",
          description: "Test template",
          instance_type: "frontend",
          model: "claude-3-5-sonnet-20241022",
          prompt: "You are a frontend developer",
          allowed_tools: "Read, Write, Edit",
          disallowed_tools: "Delete",
          vibe: false,
          provider: "claude",
          temperature: 0.0
        }
      }
    end

    new_template = InstanceTemplate.last
    assert_redirected_to instance_template_path(new_template)
    assert_equal "New Template", new_template.name
    assert_equal "frontend", new_template.instance_type
    assert_equal ["Read", "Write", "Edit"], new_template.allowed_tools
    assert_equal ["Delete"], new_template.disallowed_tools
  end

  test "should create instance template with OpenAI provider" do
    assert_difference('InstanceTemplate.count', 1) do
      post instance_templates_url, params: {
        instance_template: {
          name: "OpenAI Template",
          instance_type: "backend",
          model: "gpt-4",
          prompt: "You are a backend developer",
          provider: "openai",
          temperature: 0.7,
          api_version: "chat_completion",
          openai_token_env: "OPENAI_API_KEY",
          base_url: "https://api.openai.com/v1"
        }
      }
    end

    new_template = InstanceTemplate.last
    assert_equal "openai", new_template.provider
    assert_equal "gpt-4", new_template.model
    assert_equal 0.7, new_template.temperature
    assert_equal "chat_completion", new_template.api_version
  end

  test "should not create instance template without required fields" do
    assert_no_difference('InstanceTemplate.count') do
      post instance_templates_url, params: {
        instance_template: {
          description: "Missing name"
        }
      }
    end

    assert_response :success
    assert_template :new
  end

  test "should show instance template" do
    # Associate template with configuration
    @swarm_configuration.swarm_instance_templates.create(
      instance_template: @instance_template,
      instance_name: "test_instance"
    )
    
    get instance_template_url(@instance_template)
    assert_response :success
    
    assert_equal @instance_template, assigns(:instance_template)
    assert_not_nil assigns(:configurations)
    assert_includes assigns(:configurations), @swarm_configuration
    
    yaml_preview = assigns(:yaml_preview)
    assert_not_nil yaml_preview
    assert_kind_of Hash, yaml_preview
  end

  test "should get edit" do
    get edit_instance_template_url(@instance_template)
    assert_response :success
  end

  test "should update instance template" do
    patch instance_template_url(@instance_template), params: {
      instance_template: {
        name: "Updated Template",
        description: "Updated description",
        prompt: "Updated prompt",
        allowed_tools: "Bash, Read, Write, Edit"
      }
    }

    assert_redirected_to @instance_template
    @instance_template.reload
    assert_equal "Updated Template", @instance_template.name
    assert_equal "Updated description", @instance_template.description
    assert_equal "Updated prompt", @instance_template.prompt
    assert_equal ["Bash", "Read", "Write", "Edit"], @instance_template.allowed_tools
  end

  test "should handle tool patterns in allowed_tools" do
    patch instance_template_url(@instance_template), params: {
      instance_template: {
        allowed_tools: "Bash(npm:*), Read, Write, Bash(git:*)"
      }
    }

    assert_redirected_to @instance_template
    @instance_template.reload
    assert_equal ["Bash(npm:*)", "Read", "Write", "Bash(git:*)"], @instance_template.allowed_tools
  end

  test "should destroy instance template without associations" do
    assert_difference('InstanceTemplate.count', -1) do
      delete instance_template_url(@instance_template)
    end

    assert_redirected_to instance_templates_url
    assert_equal 'Instance template was successfully deleted.', flash[:notice]
  end

  test "should not destroy instance template with configurations" do
    # Associate template with configuration
    @swarm_configuration.swarm_instance_templates.create(
      instance_template: @instance_template,
      instance_name: "test_instance"
    )
    
    assert_no_difference('InstanceTemplate.count') do
      delete instance_template_url(@instance_template)
    end

    assert_redirected_to instance_templates_url
    assert_equal 'Cannot delete template that is used in configurations.', flash[:alert]
  end

  test "should handle instance template not found" do
    assert_raises(ActiveRecord::RecordNotFound) do
      get instance_template_url(id: 'nonexistent')
    end
  end

  test "should strip whitespace from tools" do
    post instance_templates_url, params: {
      instance_template: {
        name: "Whitespace Test",
        instance_type: "backend",
        allowed_tools: " Read , Write , Edit ",
        disallowed_tools: " Delete , Remove "
      }
    }

    new_template = InstanceTemplate.last
    assert_equal ["Read", "Write", "Edit"], new_template.allowed_tools
    assert_equal ["Delete", "Remove"], new_template.disallowed_tools
  end

  test "should validate instance_type inclusion" do
    assert_no_difference('InstanceTemplate.count') do
      post instance_templates_url, params: {
        instance_template: {
          name: "Invalid Type",
          instance_type: "invalid_type"
        }
      }
    end

    assert_response :success
    assert_template :new
  end

  test "should order templates by type and name" do
    # Create templates with different types and names
    backend_b = create(:instance_template, instance_type: 'backend', name: 'B Backend')
    backend_a = create(:instance_template, instance_type: 'backend', name: 'A Backend')
    frontend_a = create(:instance_template, :frontend, name: 'A Frontend')
    
    get instance_templates_url
    assert_response :success
    
    templates = assigns(:instance_templates)
    # Should be ordered by instance_type first, then name
    backend_templates = templates.select { |t| t.instance_type == 'backend' }
    assert_equal 'A Backend', backend_templates.first.name
    assert_equal 'B Backend', backend_templates.second.name
  end

  test "should handle empty tools gracefully" do
    post instance_templates_url, params: {
      instance_template: {
        name: "Empty Tools",
        instance_type: "backend",
        allowed_tools: "",
        disallowed_tools: ""
      }
    }

    new_template = InstanceTemplate.last
    assert new_template.allowed_tools.blank?
    assert new_template.disallowed_tools.blank?
  end
end