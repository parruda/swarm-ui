# frozen_string_literal: true

FactoryBot.define do
  factory :mcp_server do
    sequence(:name, "aa") { |n| "mcp_server_#{n}" }
    description { "A test MCP server" }
    server_type { "stdio" }
    command { "/usr/bin/python" }
    args { ["-m", "mcp_server"] }
    env { {} }
    headers { {} }
    tags { [] }

    trait :stdio do
      server_type { "stdio" }
      command { "/usr/bin/python" }
      args { ["-m", "mcp_server"] }
      url { nil }
      headers { {} }
    end

    trait :sse do
      server_type { "sse" }
      command { nil }
      args { [] }
      url { "https://example.com/mcp" }
      headers { { "Authorization" => "Bearer test-token" } }
    end

    trait :with_tags do
      tags { ["test", "development"] }
    end

    trait :with_env do
      env { { "API_KEY" => "test-key", "DEBUG" => "true" } }
    end

    trait :cursor_import do
      description { "Imported from Cursor IDE configuration" }
      tags { ["cursor-import"] }
    end

    trait :vscode_import do
      description { "Imported from VS Code MCP configuration" }
      tags { ["vscode-import"] }
    end
  end
end
