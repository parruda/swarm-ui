# frozen_string_literal: true

FactoryBot.define do
  factory :session do
    association :project
    session_id { SecureRandom.uuid }
    swarm_name { "MySwarm" }
    project_folder_name { "my-project" }
    started_at { Time.current }
    status { "active" }

    trait :completed do
      status { "completed" }
      ended_at { started_at + 1.hour }
      duration_seconds { 3600 }
    end

    trait :failed do
      status { "failed" }
      ended_at { started_at + 10.minutes }
      duration_seconds { 600 }
    end

    trait :with_configuration do
      configuration { "instances:\n  main:\n    model: opus\n    prompt: Main instance" }
      configuration_path { "/path/to/config.yaml" }
    end

    trait :with_metadata do
      metadata do
        {
          "user" => "test_user",
          "environment" => "development",
          "version" => "1.0.0",
        }
      end
    end
  end
end
