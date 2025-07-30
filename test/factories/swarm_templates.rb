# frozen_string_literal: true

FactoryBot.define do
  factory :swarm_template do
    sequence(:name) { |n| "swarm-template-#{n}" }
    description { "A test swarm template" }
    system_template { false }
    usage_count { 0 }
    tags { [] }
    metadata { {} }

    config_data do
      {
        "version" => "1.0",
        "swarm" => {
          "name" => "Test Swarm",
          "main" => "coordinator",
          "instances" => {
            "coordinator" => {
              "model" => "opus",
              "prompt" => "You are the main coordinator",
              "tools" => ["Read", "Edit", "Bash"],
              "directory" => ".",
            },
            "developer" => {
              "model" => "sonnet",
              "prompt" => "You are a developer",
              "tools" => ["Read", "Edit", "Bash", "WebSearch"],
              "directory" => ".",
            },
          },
        },
      }
    end

    trait :for_project do
      association :project
    end

    trait :simple do
      config_data do
        {
          "version" => "1.0",
          "swarm" => {
            "name" => "Simple Swarm",
            "main" => "coordinator",
            "instances" => {
              "coordinator" => {
                "model" => "opus",
                "prompt" => "Simple coordinator",
                "directory" => ".",
              },
            },
          },
        }
      end
    end

    trait :complex do
      config_data do
        {
          "version" => "1.0",
          "swarm" => {
            "name" => "Complex Development Swarm",
            "main" => "architect",
            "instances" => {
              "architect" => {
                "model" => "opus",
                "prompt" => "You are the system architect",
                "directory" => "${PROJECT_ROOT}",
              },
              "backend" => {
                "model" => "sonnet",
                "prompt" => "You handle backend development in ${LANGUAGE}",
                "directory" => "${PROJECT_ROOT}/backend",
              },
              "frontend" => {
                "model" => "sonnet",
                "prompt" => "You handle frontend development",
                "directory" => "${PROJECT_ROOT}/frontend",
              },
              "tester" => {
                "model" => "haiku",
                "prompt" => "You write and run tests",
                "directory" => ["${PROJECT_ROOT}/test", "${PROJECT_ROOT}/spec"],
              },
            },
          },
        }
      end
      metadata do
        {
          "required_variables" => ["PROJECT_ROOT", "LANGUAGE"],
        }
      end
    end

    trait :without_version do
      config_data do
        {
          "swarm" => {
            "name" => "No Version Swarm",
            "main" => "worker",
            "instances" => {
              "worker" => { "model" => "sonnet" },
            },
          },
        }
      end
    end

    trait :without_swarm_key do
      config_data do
        {
          "version" => "1.0",
          "instances" => {
            "worker" => { "model" => "sonnet" },
          },
        }
      end
    end

    trait :without_main do
      config_data do
        {
          "version" => "1.0",
          "swarm" => {
            "name" => "No Main Swarm",
            "instances" => {
              "worker" => { "model" => "sonnet" },
            },
          },
        }
      end
    end

    trait :with_nonexistent_main do
      config_data do
        {
          "version" => "1.0",
          "swarm" => {
            "name" => "Bad Main Swarm",
            "main" => "nonexistent",
            "instances" => {
              "worker" => { "model" => "sonnet" },
            },
          },
        }
      end
    end

    trait :system do
      system_template { true }
    end

    trait :public do
      public { true }
    end

    trait :with_tags do
      tags { ["ruby", "testing", "ai"] }
    end

    trait :with_yaml_cache do
      yaml_cache { "version: \"1.0\"\nswarm:\n  name: \"Cached Swarm\"" }
      yaml_cache_generated_at { Time.current }
    end
  end
end
