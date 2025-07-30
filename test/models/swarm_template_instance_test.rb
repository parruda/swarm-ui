# frozen_string_literal: true

require "test_helper"

class SwarmTemplateInstanceTest < ActiveSupport::TestCase
  setup do
    @instance = create(:swarm_template_instance)
  end

  # Validation tests
  test "valid swarm template instance" do
    assert @instance.valid?
  end

  test "requires instance_key" do
    @instance.instance_key = nil
    assert_not @instance.valid?
    assert_includes @instance.errors[:instance_key], "can't be blank"
  end

  test "requires unique instance_key within swarm_template scope" do
    duplicate = build(
      :swarm_template_instance,
      swarm_template: @instance.swarm_template,
      instance_key: @instance.instance_key,
    )
    assert_not duplicate.valid?
    assert_includes duplicate.errors[:instance_key], "has already been taken"
  end

  test "allows same instance_key for different swarm templates" do
    other_template = create(:swarm_template)
    other_instance = build(
      :swarm_template_instance,
      swarm_template: other_template,
      instance_key: @instance.instance_key,
    )
    assert other_instance.valid?
  end

  test "validates instance_key format" do
    # Invalid formats
    invalid_keys = [
      "CamelCase",      # uppercase letters
      "with-dashes",    # dashes
      "with spaces",    # spaces
      "123numbers",     # starts with number
      "special!chars",  # special characters
      "unicode_café",   # unicode characters
    ]

    invalid_keys.each do |key|
      @instance.instance_key = key
      assert_not @instance.valid?, "Should not allow instance_key: #{key}"
      assert_includes @instance.errors[:instance_key], "must be lowercase letters and underscores only"
    end
  end

  test "allows valid instance_key formats" do
    valid_keys = [
      "simple",
      "with_underscore",
      "multiple_underscores_allowed",
      "trailing_",
      "_leading",
      "_",
    ]

    valid_keys.each do |key|
      @instance.instance_key = key
      assert @instance.valid?, "Should allow instance_key: #{key}"
    end
  end

  # Association tests
  test "belongs to swarm_template" do
    assert_respond_to @instance, :swarm_template
    assert_instance_of SwarmTemplate, @instance.swarm_template
  end

  test "requires swarm_template" do
    @instance.swarm_template = nil
    assert_not @instance.valid?
    assert_includes @instance.errors[:swarm_template], "must exist"
  end

  test "belongs to instance_template" do
    assert_respond_to @instance, :instance_template
    assert_instance_of InstanceTemplate, @instance.instance_template
  end

  test "requires instance_template" do
    @instance.instance_template = nil
    assert_not @instance.valid?
    assert_includes @instance.errors[:instance_template], "must exist"
  end

  # Scope tests
  test "ordered scope sorts by position" do
    create(:swarm_template_instance, position: 3, swarm_template: @instance.swarm_template)
    create(:swarm_template_instance, position: 1, swarm_template: @instance.swarm_template)
    create(:swarm_template_instance, position: 2, swarm_template: @instance.swarm_template)

    ordered = @instance.swarm_template.swarm_template_instances.ordered
    positions = ordered.pluck(:position)
    assert_equal positions.sort, positions
  end

  # Callback tests
  test "sets default position on create" do
    template = create(:swarm_template)

    # First instance gets position 1
    instance1 = create(:swarm_template_instance, swarm_template: template, position: nil)
    assert_equal 1, instance1.position

    # Second instance gets position 2
    instance2 = create(:swarm_template_instance, swarm_template: template, position: nil)
    assert_equal 2, instance2.position

    # Third instance with explicit position doesn't change
    instance3 = create(:swarm_template_instance, swarm_template: template, position: 10)
    assert_equal 10, instance3.position

    # Fourth instance gets max + 1
    instance4 = create(:swarm_template_instance, swarm_template: template, position: nil)
    assert_equal 11, instance4.position
  end

  test "position callback only runs on create" do
    @instance.position = 99
    @instance.save!
    assert_equal 99, @instance.position
  end

  # Instance method tests - full_config
  test "full_config returns instance template config" do
    template_config = @instance.instance_template.to_instance_config(@instance.instance_key)
    assert_equal template_config, @instance.full_config
  end

  test "full_config merges overrides" do
    instance = create(:swarm_template_instance, :with_overrides)
    config = instance.full_config

    # Overrides should be present
    assert_equal "Overridden prompt", config["prompt"]
    assert_equal "opus", config["model"]
    assert_equal ["Read", "Write"], config["tools"]

    # Original config should still be there for non-overridden fields
    assert config.key?("directory")
  end

  test "full_config deep merges nested overrides" do
    @instance.overrides = {
      "config" => {
        "advanced" => {
          "timeout" => 60,
        },
      },
    }

    config = @instance.full_config
    assert_equal 60, config.dig("config", "advanced", "timeout")
  end

  test "full_config handles nil overrides" do
    @instance.overrides = nil
    assert_nothing_raised do
      config = @instance.full_config
      assert_instance_of Hash, config
    end
  end

  # Connection management tests
  test "connections returns empty array when no overrides" do
    assert_empty @instance.connections
  end

  test "connections returns connections from overrides" do
    instance = create(:swarm_template_instance, :with_connections)
    assert_equal ["target_one", "target_two"], instance.connections
  end

  test "add_connection adds new connection" do
    @instance.add_connection("new_target")

    assert_includes @instance.connections, "new_target"
    assert @instance.persisted?

    # Verify it was saved
    @instance.reload
    assert_includes @instance.connections, "new_target"
  end

  test "add_connection doesn't duplicate connections" do
    @instance.add_connection("target")
    @instance.add_connection("target")

    assert_equal 1, @instance.connections.count("target")
  end

  test "add_connection preserves existing connections" do
    @instance.add_connection("first")
    @instance.add_connection("second")

    assert_equal ["first", "second"], @instance.connections
  end

  test "remove_connection removes specific connection" do
    instance = create(:swarm_template_instance, :with_connections)
    instance.remove_connection("target_one")

    assert_not_includes instance.connections, "target_one"
    assert_includes instance.connections, "target_two"

    # Verify it was saved
    instance.reload
    assert_not_includes instance.connections, "target_one"
  end

  test "remove_connection handles missing connection gracefully" do
    instance = create(:swarm_template_instance, :with_connections)

    assert_nothing_raised do
      instance.remove_connection("nonexistent")
    end

    # Original connections unchanged
    assert_equal ["target_one", "target_two"], instance.connections
  end

  test "remove_connection handles nil overrides" do
    assert_nothing_raised do
      @instance.remove_connection("anything")
    end
  end

  # Edge cases
  test "handles complex overrides structure" do
    @instance.overrides = {
      "prompt" => "Complex prompt with ${VAR}",
      "config" => {
        "nested" => {
          "deeply" => {
            "value" => 123,
          },
        },
      },
      "array_value" => [1, 2, 3],
      "connections" => ["a", "b", "c"],
    }

    assert @instance.valid?
    config = @instance.full_config

    assert_equal "Complex prompt with ${VAR}", config["prompt"]
    assert_equal 123, config.dig("config", "nested", "deeply", "value")
    assert_equal [1, 2, 3], config["array_value"]
  end

  test "position can be zero" do
    @instance.position = 0
    assert @instance.valid?
  end

  test "position can be negative" do
    @instance.position = -1
    assert @instance.valid?
  end

  test "handles unicode in overrides" do
    @instance.overrides = {
      "prompt" => "Work with 日本語 and العربية",
      "emoji" => "🚀 Deploy to production 🎉",
    }

    assert @instance.valid?
    config = @instance.full_config
    assert_includes config["prompt"], "日本語"
    assert_includes config["emoji"], "🚀"
  end
end
