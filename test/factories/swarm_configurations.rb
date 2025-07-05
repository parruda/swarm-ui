FactoryBot.define do
  factory :swarm_configuration do
    sequence(:name) { |n| "Test Swarm Configuration #{n}" }
    description { "A test swarm configuration" }
    is_template { false }
    
    transient do
      configuration { nil }
    end
    
    # Default config_yaml value - moved from after(:build) to attribute definition
    config_yaml do
      <<~YAML
        swarm:
          name: "Test Swarm"
          description: "A test swarm for testing"
          main: "lead"
          before:
            - CLAUDE_MODEL="claude-3-5-sonnet-20241022"
          instances:
            lead:
              description: "Lead agent"
              model: "${CLAUDE_MODEL}"
              prompt: "You are the lead agent."
              allowed_tools: "Bash,Read,Write"
            Agent1:
              description: "First test agent"
              model: "${CLAUDE_MODEL}"
              prompt: "You are a helpful assistant."
            Agent2:
              description: "Second test agent"
              model: "${CLAUDE_MODEL}"  
              prompt: "You are a code reviewer."
      YAML
    end
    
    after(:build) do |swarm_config, evaluator|
      if evaluator.configuration
        swarm_config.config_yaml = evaluator.configuration.to_yaml
      end
    end
    
    trait :template do
      is_template { true }
    end
    
    trait :invalid_yaml do
      config_yaml { "invalid: yaml: content:" }
    end
    
    trait :empty_instances do
      config_yaml do
        <<~YAML
          swarm:
            name: "Empty Swarm"
            instances: []
        YAML
      end
    end
  end
end