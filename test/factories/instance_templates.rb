FactoryBot.define do
  factory :instance_template do
    sequence(:name) { |n| "Test Template #{n}" }
    description { "A test instance template" }
    instance_type { "backend" }
    model { "claude-3-5-sonnet-20241022" }
    prompt { "You are a helpful backend developer." }
    provider { "claude" }
    temperature { 0.0 }
    
    trait :frontend do
      instance_type { "frontend" }
      prompt { "You are a frontend developer specializing in React." }
    end
    
    trait :devops do
      instance_type { "devops" }
      prompt { "You are a DevOps engineer." }
    end
    
    trait :with_tools do
      allowed_tools { "Bash,Read,Write" }
      disallowed_tools { "Delete" }
    end
    
    trait :with_vibe do
      vibe { true }
    end
    
    trait :openai_provider do
      provider { "openai" }
      model { "gpt-4" }
      api_version { "2023-03-15" }
      openai_token_env { "OPENAI_API_KEY" }
      base_url { "https://api.openai.com/v1" }
    end
  end
end