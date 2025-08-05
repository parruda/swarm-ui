# frozen_string_literal: true

FactoryBot.define do
  factory :instance_template do
    sequence(:name) { |n| "instance-template-#{n}" }
    description { "A test instance template" }
    system_prompt { "You are a helpful assistant" }
    usage_count { 0 }
    tags { [] }
    required_variables { [] }
    config do
      {
        "provider" => "claude",
        "model" => "sonnet",
        "directory" => ".",
        "allowed_tools" => [],
      }
    end

    trait :with_prompt do
      system_prompt { "Help me with coding" }
      config do
        {
          "provider" => "claude",
          "model" => "sonnet",
          "directory" => ".",
          "allowed_tools" => [],
        }
      end
    end

    trait :claude_opus do
      system_prompt { "You are Claude Opus, the most capable model" }
      config do
        {
          "provider" => "claude",
          "model" => "opus",
          "directory" => ".",
          "allowed_tools" => ["Read", "Write", "Edit"],
        }
      end
    end

    trait :openai_gpt4 do
      system_prompt { "You are GPT-4o" }
      config do
        {
          "provider" => "openai",
          "model" => "gpt-4o",
          "directory" => ".",
          "api_version" => "chat_completion",
          "temperature" => 0.7,
          "allowed_tools" => InstanceTemplate::AVAILABLE_TOOLS,
          "vibe" => true,
        }
      end
    end

    trait :openai_o1 do
      system_prompt { "You are O1 with reasoning" }
      config do
        {
          "provider" => "openai",
          "model" => "o1",
          "directory" => ".",
          "api_version" => "responses",
          "reasoning_effort" => "medium",
          "allowed_tools" => InstanceTemplate::AVAILABLE_TOOLS,
          "vibe" => true,
        }
      end
    end

    trait :with_worktree do
      system_prompt { "You are a helpful assistant" }
      config do
        {
          "provider" => "claude",
          "model" => "sonnet",
          "directory" => "/tmp/worktree",
          "worktree" => true,
          "allowed_tools" => [],
        }
      end
    end

    trait :vibe_mode do
      system_prompt { "You are in vibe mode" }
      config do
        {
          "provider" => "claude",
          "model" => "sonnet",
          "directory" => ".",
          "vibe" => true,
          "allowed_tools" => InstanceTemplate::AVAILABLE_TOOLS,
        }
      end
    end

    trait :with_variables do
      system_prompt { "You work in ${ENVIRONMENT} environment" }
      config do
        {
          "provider" => "claude",
          "model" => "sonnet",
          "directory" => "${PROJECT_DIR}/src",
          "allowed_tools" => [],
        }
      end
      required_variables { ["ENVIRONMENT", "PROJECT_DIR"] }
    end

    trait :with_tags do
      tags { ["ruby", "testing", "ai"] }
    end
  end
end
