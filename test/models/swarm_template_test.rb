# frozen_string_literal: true

require "test_helper"

class SwarmTemplateTest < ActiveSupport::TestCase
  def sample_instance_config
    {
      "instances" => {
        "coordinator" => {
          "model" => "opus",
          "prompt" => "You are the main coordinator",
        },
        "developer" => {
          "model" => "sonnet",
          "prompt" => "You are a developer",
        },
      },
      "connections" => [
        { "from" => "coordinator", "to" => "developer" },
      ],
    }
  end

  test "should not save swarm template without name" do
    template = SwarmTemplate.new(main_instance: "coordinator")
    assert_not template.save
  end

  test "should not save swarm template with duplicate name" do
    SwarmTemplate.create!(
      name: "test-swarm",
      main_instance: "coordinator",
      instance_config: sample_instance_config,
    )
    duplicate = SwarmTemplate.new(
      name: "test-swarm",
      main_instance: "coordinator",
      instance_config: sample_instance_config,
    )
    assert_not duplicate.save
  end

  test "should validate main_instance presence" do
    template = SwarmTemplate.new(name: "test")
    assert_not template.valid?
    assert_includes template.errors[:main_instance], "can't be blank"
  end

  test "should validate main_instance exists in config" do
    config = sample_instance_config
    template = SwarmTemplate.new(
      name: "test",
      main_instance: "nonexistent",
      instance_config: config,
    )
    assert_not template.valid?
    assert_includes template.errors[:main_instance], "must be defined in instance_config"
  end

  test "should validate instance_config is a hash" do
    template = SwarmTemplate.new(
      name: "test",
      main_instance: "coordinator",
      instance_config: [],
    )
    assert_not template.valid?
    assert_includes template.errors[:instance_config], "must be a hash"
  end

  test "should validate instance_config has instances key" do
    template = SwarmTemplate.new(
      name: "test",
      main_instance: "coordinator",
      instance_config: { "connections" => [] },
    )
    assert_not template.valid?
    assert_includes template.errors[:instance_config], "must have 'instances' key"
  end

  test "should validate instances is a hash" do
    template = SwarmTemplate.new(
      name: "test",
      main_instance: "coordinator",
      instance_config: { "instances" => [] },
    )
    assert_not template.valid?
    assert_includes template.errors[:instance_config], "'instances' must be a hash"
  end

  test "should validate connections is an array" do
    template = SwarmTemplate.new(
      name: "test",
      main_instance: "coordinator",
      instance_config: {
        "instances" => { "coordinator" => {} },
        "connections" => "invalid",
      },
    )
    assert_not template.valid?
    assert_includes template.errors[:instance_config], "'connections' must be an array"
  end

  test "should validate connection structure" do
    template = SwarmTemplate.new(
      name: "test",
      main_instance: "coordinator",
      instance_config: {
        "instances" => { "coordinator" => {} },
        "connections" => [{ "from" => "coordinator" }], # Missing 'to'
      },
    )
    assert_not template.valid?
    assert_match(/connection at index 0 must have 'from' and 'to' keys/, template.errors[:instance_config].first)
  end

  test "instances method returns instances hash" do
    template = SwarmTemplate.new(instance_config: sample_instance_config)
    expected = sample_instance_config["instances"]
    assert_equal expected, template.instances
  end

  test "instances method returns empty hash when no config" do
    template = SwarmTemplate.new
    assert_empty(template.instances)
  end

  test "instance_names returns array of instance names" do
    template = SwarmTemplate.new(instance_config: sample_instance_config)
    assert_equal ["coordinator", "developer"], template.instance_names.sort
  end

  test "connections returns connections array" do
    template = SwarmTemplate.new(instance_config: sample_instance_config)
    expected = sample_instance_config["connections"]
    assert_equal expected, template.connections
  end

  test "connections returns empty array when no connections" do
    template = SwarmTemplate.new
    assert_empty template.connections
  end

  test "instance_definition returns specific instance config" do
    template = SwarmTemplate.new(instance_config: sample_instance_config)
    coordinator = template.instance_definition("coordinator")
    assert_equal "opus", coordinator["model"]
    assert_equal "You are the main coordinator", coordinator["prompt"]
  end

  test "connections_for returns connections for specific instance" do
    config = {
      "instances" => {
        "a" => {}, "b" => {}, "c" => {},
      },
      "connections" => [
        { "from" => "a", "to" => "b" },
        { "from" => "b", "to" => "c" },
        { "from" => "a", "to" => "c" },
      ],
    }
    template = SwarmTemplate.new(instance_config: config)

    a_connections = template.connections_for("a")
    assert_equal 2, a_connections.count
    assert a_connections.all? { |c| c["from"] == "a" }

    b_connections = template.connections_for("b")
    assert_equal 2, b_connections.count
    assert b_connections.any? { |c| c["from"] == "b" }
    assert b_connections.any? { |c| c["to"] == "b" }
  end

  test "ordered scope" do
    SwarmTemplate.create!(name: "zebra", main_instance: "main", instance_config: { "instances" => { "main" => {} } })
    SwarmTemplate.create!(name: "alpha", main_instance: "main", instance_config: { "instances" => { "main" => {} } })
    SwarmTemplate.create!(name: "middle", main_instance: "main", instance_config: { "instances" => { "main" => {} } })

    ordered = SwarmTemplate.ordered
    assert_equal "alpha", ordered.first.name
    assert_equal "zebra", ordered.last.name
  end
end
