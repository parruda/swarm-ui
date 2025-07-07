# frozen_string_literal: true

FactoryBot.define do
  factory :instance_template do
    sequence(:name) { |n| "instance-template-#{n}" }
    description { "A test instance template" }
    provider { "claude" }
    model { "sonnet" }
    prompt { "You are a helpful assistant" }

    trait :claude_opus do
      provider { "claude" }
      model { "opus" }
      prompt { "You are Claude Opus, the most capable model" }
    end

    trait :claude_haiku do
      provider { "claude" }
      model { "haiku" }
      prompt { "You are Claude Haiku, optimized for speed" }
    end

    trait :openai_gpt4 do
      provider { "openai" }
      model { "gpt-4o" }
      api_version { "chat_completion" }
      temperature { 0.7 }
    end

    trait :openai_o1 do
      provider { "openai" }
      model { "o1" }
      api_version { "responses" }
      reasoning_effort { "medium" }
    end

    trait :with_tools do
      tools { ["Read", "Edit", "Bash", "WebSearch"] }
    end

    trait :restricted_tools do
      tools { ["Read", "Edit", "Bash", "WebSearch"] }
      allowed_tools { ["Read", "Edit"] }
    end

    trait :disallowed_tools do
      tools { ["Read", "Edit", "Bash", "WebSearch"] }
      disallowed_tools { ["Bash"] }
    end

    trait :with_worktree do
      worktree { true }
      directory { "/tmp/worktree" }
    end

    trait :vibe_mode do
      vibe { true }
      description { "Dangerous mode with fewer restrictions" }
    end
  end
end
