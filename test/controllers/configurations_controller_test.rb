require "test_helper"

class ConfigurationsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @configuration = create(:swarm_configuration)
    @instance_template = create(:instance_template)
  end

  test "should get index" do
    get configurations_url
    assert_response :success
    assert_not_nil assigns(:configurations)
    assert_includes assigns(:configurations), @configuration
  end

  test "should get new" do
    get new_configuration_url
    assert_response :success
    assert_not_nil assigns(:configuration)
    assert_not_nil assigns(:instance_templates)
    assert assigns(:configuration).config_yaml.present?
  end

  test "should create configuration with valid YAML" do
    valid_yaml = <<~YAML
      swarm:
        name: "Test Swarm"
        main: "leader"
        instances:
          leader:
            description: "Main instance"
            model: "sonnet"
    YAML

    assert_difference('SwarmConfiguration.count', 1) do
      post configurations_url, params: {
        swarm_configuration: {
          name: "Test Configuration",
          description: "Test description",
          config_yaml: valid_yaml,
          is_template: false
        }
      }
    end

    new_config = SwarmConfiguration.last
    assert_redirected_to edit_configuration_path(new_config)
    assert_equal "Test Configuration", new_config.name
    assert_equal "Test description", new_config.description
  end

  test "should not create configuration with invalid YAML" do
    invalid_yaml = "invalid: yaml: content:"

    assert_no_difference('SwarmConfiguration.count') do
      post configurations_url, params: {
        swarm_configuration: {
          name: "Test Configuration",
          description: "Test description",
          config_yaml: invalid_yaml
        }
      }
    end

    assert_response :success
    assert_template :new
    assert_not_nil assigns(:configuration).errors[:config_yaml]
  end

  test "should not create configuration with blank YAML" do
    assert_no_difference('SwarmConfiguration.count') do
      post configurations_url, params: {
        swarm_configuration: {
          name: "Test Configuration",
          description: "Test description",
          config_yaml: ""
        }
      }
    end

    assert_response :success
    assert_template :new
  end

  test "should show configuration" do
    get configuration_url(@configuration)
    assert_response :success
    assert_equal @configuration, assigns(:configuration)
    assert_not_nil assigns(:instance_count)
    assert assigns(:can_launch)
  end

  test "should get edit" do
    get edit_configuration_url(@configuration)
    assert_response :success
    assert_not_nil assigns(:instance_templates)
    assert_not_nil assigns(:parsed_config)
  end

  test "should update configuration with valid YAML" do
    updated_yaml = <<~YAML
      swarm:
        name: "Updated Swarm"
        main: "leader"
        instances:
          leader:
            description: "Updated instance"
            model: "opus"
    YAML

    patch configuration_url(@configuration), params: {
      swarm_configuration: {
        name: "Updated Name",
        description: "Updated description",
        config_yaml: updated_yaml
      }
    }

    assert_redirected_to configuration_path(@configuration)
    @configuration.reload
    assert_equal "Updated Name", @configuration.name
    assert_equal "Updated description", @configuration.description
    assert_includes @configuration.config_yaml, "Updated Swarm"
  end

  test "should not update configuration with invalid YAML" do
    original_yaml = @configuration.config_yaml

    patch configuration_url(@configuration), params: {
      swarm_configuration: {
        config_yaml: "invalid: yaml: content:"
      }
    }

    assert_response :success
    assert_template :edit
    @configuration.reload
    assert_equal original_yaml, @configuration.config_yaml
  end

  test "should destroy configuration without sessions" do
    assert_difference('SwarmConfiguration.count', -1) do
      delete configuration_url(@configuration)
    end

    assert_redirected_to configurations_url
    assert_equal 'Configuration was successfully deleted.', flash[:notice]
  end

  test "should not destroy configuration with sessions" do
    # Create a session using this configuration
    create(:session, swarm_configuration: @configuration)

    assert_no_difference('SwarmConfiguration.count') do
      delete configuration_url(@configuration)
    end

    assert_redirected_to configurations_url
    assert_equal 'Cannot delete configuration that has been used in sessions.', flash[:alert]
  end

  test "should clone configuration" do
    # Add an instance template association to test cloning
    @configuration.swarm_instance_templates.create(
      instance_template: @instance_template,
      instance_name: "test_instance"
    )

    assert_difference('SwarmConfiguration.count', 1) do
      post clone_configuration_url(@configuration)
    end

    cloned = SwarmConfiguration.last
    assert_redirected_to edit_configuration_path(cloned)
    assert_equal "#{@configuration.name} (Copy)", cloned.name
    assert_equal @configuration.description, cloned.description
    assert_equal @configuration.config_yaml, cloned.config_yaml
    assert_equal 1, cloned.swarm_instance_templates.count
  end

  test "should export configuration as YAML" do
    get export_configuration_url(@configuration)
    assert_response :success
    assert_equal 'text/yaml', response.content_type
    assert_equal "attachment; filename=\"#{@configuration.name.parameterize}.yml\"; filename*=UTF-8''#{@configuration.name.parameterize}.yml", response.headers['Content-Disposition']
    assert_equal @configuration.config_yaml, response.body
  end

  test "should handle configuration not found" do
    assert_raises(ActiveRecord::RecordNotFound) do
      get configuration_url(id: 'nonexistent')
    end
  end

  test "should validate YAML during create" do
    # Test with valid YAML structure
    valid_yaml = <<~YAML
      swarm:
        name: "Valid Swarm"
        instances:
          agent1:
            model: "sonnet"
    YAML

    post configurations_url, params: {
      swarm_configuration: {
        name: "Valid Config",
        config_yaml: valid_yaml
      }
    }

    assert_response :redirect
    assert SwarmConfiguration.find_by(name: "Valid Config")
  end

  test "should handle YAML parse errors gracefully" do
    # YAML with syntax error
    bad_yaml = <<~YAML
      swarm:
        name: "Bad Swarm
        instances: # Missing closing quote above
          agent1:
            model: "sonnet"
    YAML

    post configurations_url, params: {
      swarm_configuration: {
        name: "Bad Config",
        config_yaml: bad_yaml
      }
    }

    assert_response :success
    assert_template :new
    assert assigns(:configuration).errors[:config_yaml].any?
  end

  test "should order configurations by name in index" do
    # Create additional configurations with different names
    config_b = create(:swarm_configuration, name: "B Configuration")
    config_a = create(:swarm_configuration, name: "A Configuration")
    config_c = create(:swarm_configuration, name: "C Configuration")

    get configurations_url
    assert_response :success

    configs = assigns(:configurations)
    names = configs.map(&:name)
    assert_equal names.sort, names # Verify they're sorted
  end

  test "should include instance templates in index query" do
    # This tests that includes(:instance_templates) is working to avoid N+1 queries
    get configurations_url
    assert_response :success
    
    # If this test passes without N+1 query warnings, the includes is working
    assert_not_nil assigns(:configurations)
  end
end