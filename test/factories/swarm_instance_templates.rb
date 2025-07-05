FactoryBot.define do
  factory :swarm_instance_template do
    association :swarm_configuration
    association :instance_template
    sequence(:instance_name) { |n| "instance_#{n}" }
    directory { nil }
    connections { [] }
    
    trait :with_directory do
      directory { "./custom_directory" }
    end
    
    trait :with_connections do
      connections { ["frontend", "backend", "database"] }
    end
    
    trait :with_multiple_directories do
      directory { '["./src", "./lib", "./test"]' }
    end
  end
end