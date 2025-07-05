require "test_helper"

class SwarmConfigurationTest < ActiveSupport::TestCase
  # Test validations
  test "should be valid with valid attributes" do
    config = build(:swarm_configuration)
    assert config.valid?
  end
  
  test "should require name" do
    config = build(:swarm_configuration, name: nil)
    assert_not config.valid?
    assert_includes config.errors[:name], "can't be blank"
  end
  
  test "should require config_yaml" do
    config = build(:swarm_configuration, config_yaml: nil)
    assert_not config.valid?
    assert_includes config.errors[:config_yaml], "can't be blank"
  end
  
  # Test associations
  test "has many swarm_instance_templates" do
    config = create(:swarm_configuration)
    template1 = create(:instance_template)
    template2 = create(:instance_template)
    
    config.swarm_instance_templates.create(instance_template: template1, instance_name: "instance1")
    config.swarm_instance_templates.create(instance_template: template2, instance_name: "instance2")
    
    assert_equal 2, config.swarm_instance_templates.count
  end
  
  test "has many instance_templates through swarm_instance_templates" do
    config = create(:swarm_configuration)
    template1 = create(:instance_template)
    template2 = create(:instance_template)
    
    config.swarm_instance_templates.create(instance_template: template1, instance_name: "template1_instance")
    config.swarm_instance_templates.create(instance_template: template2, instance_name: "template2_instance")
    
    assert_equal 2, config.instance_templates.count
    assert_includes config.instance_templates, template1
    assert_includes config.instance_templates, template2
  end
  
  test "has many sessions" do
    config = create(:swarm_configuration)
    session1 = create(:session, swarm_configuration: config)
    session2 = create(:session, swarm_configuration: config)
    
    assert_equal 2, config.sessions.count
    assert_includes config.sessions, session1
    assert_includes config.sessions, session2
  end
  
  test "destroys associated swarm_instance_templates when destroyed" do
    config = create(:swarm_configuration)
    template = create(:instance_template)
    config.swarm_instance_templates.create(instance_template: template, instance_name: "test_instance")
    
    assert_difference('SwarmInstanceTemplate.count', -1) do
      config.destroy
    end
  end
  
  # Test instance_count method
  test "instance_count returns correct count of instances" do
    config = create(:swarm_configuration)
    assert_equal 3, config.instance_count  # lead, frontend, backend
  end
  
  test "instance_count returns 0 for empty instances" do
    config = create(:swarm_configuration, :empty_instances)
    assert_equal 0, config.instance_count
  end
  
  test "instance_count returns 0 for malformed yaml" do
    config = build(:swarm_configuration, config_yaml: "invalid yaml")
    assert_equal 0, config.instance_count
  end
  
  test "instance_count returns 0 when swarm key is missing" do
    config = build(:swarm_configuration, config_yaml: "key: value")
    assert_equal 0, config.instance_count
  end
  
  # Test yaml_config method
  test "yaml_config parses valid YAML correctly" do
    config = create(:swarm_configuration)
    parsed = config.yaml_config
    
    assert_kind_of Hash, parsed
    assert_equal "Test Swarm", parsed['swarm']['name']
    assert_equal 3, parsed['swarm']['instances'].size
    assert parsed['swarm']['instances'].key?('lead')
  end
  
  test "yaml_config caches parsed result" do
    config = create(:swarm_configuration)
    
    # First call parses the YAML
    parsed1 = config.yaml_config
    
    # Mock YAML.safe_load to ensure it's not called again
    YAML.stub :safe_load, -> (_) { raise "Should not be called" } do
      parsed2 = config.yaml_config
      assert_equal parsed1, parsed2
    end
  end
  
  test "yaml_config handles invalid YAML gracefully" do
    config = build(:swarm_configuration, :invalid_yaml)
    
    assert_raises(Psych::SyntaxError) do
      config.yaml_config
    end
  end
  
  # Test to_file method
  test "to_file writes config_yaml to specified path" do
    config = create(:swarm_configuration)
    temp_file = Tempfile.new(['config', '.yml'])
    
    begin
      config.to_file(temp_file.path)
      
      written_content = File.read(temp_file.path)
      assert_equal config.config_yaml, written_content
    ensure
      temp_file.close
      temp_file.unlink
    end
  end
  
  test "to_file creates parent directories if needed" do
    config = create(:swarm_configuration)
    temp_dir = Dir.mktmpdir
    
    begin
      nested_path = File.join(temp_dir, 'nested', 'dirs', 'config.yml')
      config.to_file(nested_path)
      
      assert File.exist?(nested_path)
      assert_equal config.config_yaml, File.read(nested_path)
    ensure
      FileUtils.rm_rf(temp_dir)
    end
  end
  
  test "to_file overwrites existing file" do
    config = create(:swarm_configuration)
    temp_file = Tempfile.new(['config', '.yml'])
    
    begin
      # Write initial content
      File.write(temp_file.path, "old content")
      
      # Use to_file to overwrite
      config.to_file(temp_file.path)
      
      assert_equal config.config_yaml, File.read(temp_file.path)
    ensure
      temp_file.close
      temp_file.unlink
    end
  end
  
  # Test template trait
  test "can be marked as template" do
    config = create(:swarm_configuration, :template)
    assert config.is_template
  end
  
  # Test YAML structure
  test "config_yaml has expected structure" do
    config = create(:swarm_configuration)
    parsed = config.yaml_config
    
    assert parsed.key?('swarm')
    assert parsed['swarm'].key?('name')
    assert parsed['swarm'].key?('main')
    assert parsed['swarm'].key?('before')
    assert parsed['swarm'].key?('instances')
    
    assert_kind_of Array, parsed['swarm']['before']
    assert_kind_of Hash, parsed['swarm']['instances']
    
    # Check first instance (lead)
    instance = parsed['swarm']['instances']['lead']
    assert instance.key?('description')
    assert instance.key?('model')
    assert instance.key?('prompt')
    assert instance.key?('allowed_tools')
  end
end