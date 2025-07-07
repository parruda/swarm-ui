# frozen_string_literal: true

class CreateInstanceTemplates < ActiveRecord::Migration[8.0]
  def change
    create_table(:instance_templates) do |t|
      t.string(:name, null: false)
      t.text(:description)
      t.string(:model) # opus, sonnet, haiku, gpt-4o, etc
      t.string(:provider) # claude, openai
      t.text(:prompt)
      t.string(:directory)
      t.jsonb(:tools) # Array of tool names ["Read", "Edit", "Bash", etc]
      t.jsonb(:allowed_tools) # Optional restriction of tools
      t.jsonb(:disallowed_tools) # Optional tools to explicitly disallow
      t.boolean(:worktree, default: false)
      t.boolean(:vibe, default: false) # Dangerous mode with fewer restrictions

      # OpenAI-specific settings
      t.float(:temperature)
      t.string(:api_version) # chat_completion, responses
      t.string(:reasoning_effort) # low, medium, high (for o-series models only)

      t.timestamps
    end

    add_index(:instance_templates, :name)
  end
end
