# frozen_string_literal: true

FactoryBot.define do
  factory :instance_template do
    sequence(:name) { |n| "instance-template-#{n}" }
    description { "A test instance template" }
    category { "general" }
    system_template { false }
    usage_count { 0 }
    tags { [] }
    required_variables { [] }
    config do
      {
        "provider" => "claude",
        "model" => "sonnet",
        "directory" => ".",
        "system_prompt" => "You are a helpful assistant",
        "allowed_tools" => [],
      }
    end

    trait :with_prompt do
      config do
        {
          "provider" => "claude",
          "model" => "sonnet",
          "directory" => ".",
          "system_prompt" => "You are a helpful assistant",
          "prompt" => "Help me with coding",
          "allowed_tools" => [],
        }
      end
    end

    trait :claude_opus do
      config do
        {
          "provider" => "claude",
          "model" => "opus",
          "directory" => ".",
          "system_prompt" => "You are Claude Opus, the most capable model",
          "allowed_tools" => ["Read", "Write", "Edit"],
        }
      end
    end

    trait :openai_gpt4 do
      config do
        {
          "provider" => "openai",
          "model" => "gpt-4o",
          "directory" => ".",
          "system_prompt" => "You are GPT-4o",
          "api_version" => "chat_completion",
          "temperature" => 0.7,
          "allowed_tools" => InstanceTemplate::AVAILABLE_TOOLS,
          "vibe" => true,
        }
      end
    end

    trait :openai_o1 do
      config do
        {
          "provider" => "openai",
          "model" => "o1",
          "directory" => ".",
          "system_prompt" => "You are O1 with reasoning",
          "api_version" => "responses",
          "reasoning_effort" => "medium",
          "allowed_tools" => InstanceTemplate::AVAILABLE_TOOLS,
          "vibe" => true,
        }
      end
    end

    trait :with_worktree do
      config do
        {
          "provider" => "claude",
          "model" => "sonnet",
          "directory" => "/tmp/worktree",
          "system_prompt" => "You are a helpful assistant",
          "worktree" => true,
          "allowed_tools" => [],
        }
      end
    end

    trait :vibe_mode do
      config do
        {
          "provider" => "claude",
          "model" => "sonnet",
          "directory" => ".",
          "system_prompt" => "You are in vibe mode",
          "vibe" => true,
          "allowed_tools" => InstanceTemplate::AVAILABLE_TOOLS,
        }
      end
    end

    trait :with_variables do
      config do
        {
          "provider" => "claude",
          "model" => "sonnet",
          "directory" => "${PROJECT_DIR}/src",
          "system_prompt" => "You work in ${ENVIRONMENT} environment",
          "prompt" => "Help with ${TASK_TYPE}",
          "allowed_tools" => [],
        }
      end
      required_variables { ["ENVIRONMENT", "PROJECT_DIR", "TASK_TYPE"] }
    end

    trait :system do
      system_template { true }
    end

    trait :frontend do
      category { "frontend" }
    end

    trait :backend do
      category { "backend" }
    end

    trait :with_tags do
      tags { ["ruby", "testing", "ai"] }
    end
  end
end
