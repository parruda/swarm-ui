require "test_helper"

class InstanceTemplateTest < ActiveSupport::TestCase
  # Test validations
  test "should be valid with valid attributes" do
    template = build(:instance_template)
    assert template.valid?
  end
  
  test "should require name" do
    template = build(:instance_template, name: nil)
    assert_not template.valid?
    assert_includes template.errors[:name], "can't be blank"
  end
  
  test "should require valid instance_type" do
    valid_types = %w[frontend backend devops database testing documentation research]
    
    valid_types.each do |type|
      template = build(:instance_template, instance_type: type)
      assert template.valid?, "Should accept #{type} as instance_type"
    end
  end
  
  test "should reject invalid instance_type" do
    template = build(:instance_template, instance_type: "invalid_type")
    assert_not template.valid?
    assert_includes template.errors[:instance_type], "is not included in the list"
  end
  
  # Test associations
  test "has many swarm_instance_templates" do
    template = create(:instance_template)
    config1 = create(:swarm_configuration)
    config2 = create(:swarm_configuration)
    
    template.swarm_instance_templates.create(swarm_configuration: config1, instance_name: "instance1")
    template.swarm_instance_templates.create(swarm_configuration: config2, instance_name: "instance2")
    
    assert_equal 2, template.swarm_instance_templates.count
  end
  
  test "has many swarm_configurations through swarm_instance_templates" do
    template = create(:instance_template)
    config1 = create(:swarm_configuration)
    config2 = create(:swarm_configuration)
    
    template.swarm_instance_templates.create(swarm_configuration: config1, instance_name: "config1_instance")
    template.swarm_instance_templates.create(swarm_configuration: config2, instance_name: "config2_instance")
    
    assert_equal 2, template.swarm_configurations.count
    assert_includes template.swarm_configurations, config1
    assert_includes template.swarm_configurations, config2
  end
  
  # Test to_yaml_hash method
  test "to_yaml_hash returns correct structure with all fields" do
    template = build(:instance_template,
      description: "Test description",
      model: "claude-3-5-sonnet-20241022",
      prompt: "Test prompt",
      allowed_tools: "Read,Write,Edit",
      disallowed_tools: "Delete,Destroy",
      vibe: true,
      provider: "claude",
      temperature: 0.7,
      api_version: "v1",
      openai_token_env: "OPENAI_KEY",
      base_url: "https://api.example.com"
    )
    
    hash = template.to_yaml_hash
    
    assert_equal "Test description", hash['description']
    assert_equal "claude-3-5-sonnet-20241022", hash['model']
    assert_equal "Test prompt", hash['prompt']
    assert_equal "Read,Write,Edit", hash['allowed_tools']
    assert_equal "Delete,Destroy", hash['disallowed_tools']
    assert_equal true, hash['vibe']
    assert_equal "claude", hash['provider']
    assert_equal 0.7, hash['temperature']
    assert_equal "v1", hash['api_version']
    assert_equal "OPENAI_KEY", hash['openai_token_env']
    assert_equal "https://api.example.com", hash['base_url']
  end
  
  test "to_yaml_hash excludes nil values" do
    template = build(:instance_template,
      description: "Test",
      model: "claude-3-5-sonnet-20241022",
      prompt: "Test prompt",
      allowed_tools: nil,
      disallowed_tools: nil,
      vibe: nil,
      provider: "claude",
      temperature: nil,
      api_version: nil,
      openai_token_env: nil,
      base_url: nil
    )
    
    hash = template.to_yaml_hash
    
    assert hash.key?('description')
    assert hash.key?('model')
    assert hash.key?('prompt')
    assert hash.key?('provider')
    
    assert_not hash.key?('allowed_tools')
    assert_not hash.key?('disallowed_tools')
    assert_not hash.key?('vibe')
    assert_not hash.key?('temperature')
    assert_not hash.key?('api_version')
    assert_not hash.key?('openai_token_env')
    assert_not hash.key?('base_url')
  end
  
  test "to_yaml_hash excludes empty strings" do
    template = build(:instance_template,
      allowed_tools: "",
      disallowed_tools: "",
      vibe: ""
    )
    
    hash = template.to_yaml_hash
    
    assert_not hash.key?('allowed_tools')
    assert_not hash.key?('disallowed_tools')
    assert_not hash.key?('vibe')
  end
  
  # Test different provider configurations
  test "claude provider configuration" do
    template = build(:instance_template,
      provider: "claude",
      model: "claude-3-5-sonnet-20241022",
      temperature: 0.0
    )
    
    assert template.valid?
    hash = template.to_yaml_hash
    assert_equal "claude", hash['provider']
    assert_equal "claude-3-5-sonnet-20241022", hash['model']
    assert_equal 0.0, hash['temperature']
  end
  
  test "openai provider configuration" do
    template = build(:instance_template, :openai_provider)
    
    assert template.valid?
    hash = template.to_yaml_hash
    assert_equal "openai", hash['provider']
    assert_equal "gpt-4", hash['model']
    assert_equal "2023-03-15", hash['api_version']
    assert_equal "OPENAI_API_KEY", hash['openai_token_env']
    assert_equal "https://api.openai.com/v1", hash['base_url']
  end
  
  # Test instance type variations
  test "frontend instance type" do
    template = create(:instance_template, :frontend)
    assert_equal "frontend", template.instance_type
    assert_includes template.prompt, "frontend"
  end
  
  test "devops instance type" do
    template = create(:instance_template, :devops)
    assert_equal "devops", template.instance_type
    assert_includes template.prompt, "DevOps"
  end
  
  # Test with tools
  test "with_tools trait adds allowed and disallowed tools" do
    template = create(:instance_template, :with_tools)
    assert_equal ["Bash", "Read", "Write"], template.allowed_tools
    assert_equal ["Delete"], template.disallowed_tools
  end
  
  test "tools can include patterns" do
    template = build(:instance_template,
      allowed_tools: "Bash(npm:*),Read,Write",
      disallowed_tools: "Bash(rm:*),Delete"
    )
    
    assert template.valid?
    # Check the actual array values stored
    assert_equal ["Bash(npm:*)", "Read", "Write"], template.allowed_tools
    assert_equal ["Bash(rm:*)", "Delete"], template.disallowed_tools
    
    # Check the YAML hash output converts back to comma-separated strings
    hash = template.to_yaml_hash
    assert_equal "Bash(npm:*),Read,Write", hash['allowed_tools']
    assert_equal "Bash(rm:*),Delete", hash['disallowed_tools']
  end
  
  # Test temperature validations
  test "temperature can be zero" do
    template = build(:instance_template, temperature: 0.0)
    assert template.valid?
  end
  
  test "temperature can be decimal" do
    template = build(:instance_template, temperature: 0.7)
    assert template.valid?
  end
  
  # Test default values
  test "has default provider of claude" do
    template = create(:instance_template)
    assert_equal "claude", template.provider
  end
  
  test "has default temperature of 0.0" do
    template = create(:instance_template)
    assert_equal 0.0, template.temperature
  end
end