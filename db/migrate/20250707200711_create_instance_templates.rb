# frozen_string_literal: true

class CreateInstanceTemplates < ActiveRecord::Migration[8.0]
  def change
    create_table(:instance_templates) do |t|
      t.string(:name, null: false)
      t.text(:description, null: false) # Required in swarm YAML
      t.string(:category) # frontend, backend, security, database, etc.

      # Core configuration - stored as JSONB for flexibility
      t.jsonb(:config, default: {}, null: false)
      # Will contain: model, provider, directory, allowed_tools, disallowed_tools,
      # connections, mcps, prompt, worktree, vibe, temperature, api_version, etc.

      # Environment variables required by this template
      t.jsonb(:required_variables, default: [])
      # Example: ["PROJECT_DIR", "FRONTEND_DIR"]

      # Metadata
      t.jsonb(:metadata, default: {}) # tags, suggested_models, etc.
      t.boolean(:system_template, default: false) # Pre-built templates
      t.integer(:usage_count, default: 0)

      t.timestamps
    end

    add_index(:instance_templates, :name)
    add_index(:instance_templates, :category)
    add_index(:instance_templates, :system_template)
  end
end
