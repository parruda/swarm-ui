# frozen_string_literal: true

FactoryBot.define do
  factory :swarm_template do
    sequence(:name) { |n| "swarm-template-#{n}" }
    description { "A test swarm template" }
    main_instance { "coordinator" }

    instance_config do
      {
        "instances" => {
          "coordinator" => {
            "model" => "opus",
            "prompt" => "You are the main coordinator",
            "tools" => ["Read", "Edit", "Bash"],
          },
          "developer" => {
            "model" => "sonnet",
            "prompt" => "You are a developer",
            "tools" => ["Read", "Edit", "Bash", "WebSearch"],
          },
        },
        "connections" => [
          { "from" => "coordinator", "to" => "developer" },
        ],
      }
    end

    trait :simple do
      instance_config do
        {
          "instances" => {
            "coordinator" => {
              "model" => "opus",
              "prompt" => "Simple coordinator",
            },
          },
        }
      end
    end

    trait :complex do
      main_instance { "architect" }
      instance_config do
        {
          "instances" => {
            "architect" => {
              "model" => "opus",
              "prompt" => "You are the system architect",
            },
            "backend" => {
              "model" => "sonnet",
              "prompt" => "You handle backend development",
            },
            "frontend" => {
              "model" => "sonnet",
              "prompt" => "You handle frontend development",
            },
            "tester" => {
              "model" => "haiku",
              "prompt" => "You write and run tests",
            },
          },
          "connections" => [
            { "from" => "architect", "to" => "backend" },
            { "from" => "architect", "to" => "frontend" },
            { "from" => "backend", "to" => "tester" },
            { "from" => "frontend", "to" => "tester" },
          ],
        }
      end
    end

    trait :openai_mixed do
      main_instance { "planner" }
      instance_config do
        {
          "instances" => {
            "planner" => {
              "provider" => "openai",
              "model" => "o1",
              "api_version" => "responses",
              "reasoning_effort" => "high",
              "prompt" => "You are the strategic planner",
            },
            "executor" => {
              "provider" => "claude",
              "model" => "sonnet",
              "prompt" => "You execute the planned tasks",
            },
          },
          "connections" => [
            { "from" => "planner", "to" => "executor" },
          ],
        }
      end
    end
  end
end
