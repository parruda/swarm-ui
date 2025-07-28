# frozen_string_literal: true

class AddColumnsToInstanceTemplates < ActiveRecord::Migration[8.0]
  def change
    # Add new columns for enhanced instance templates
    add_column(:instance_templates, :category, :string) # frontend, backend, security, database, etc.
    add_column(:instance_templates, :config, :jsonb, default: {}, null: false) # Full instance configuration
    add_column(:instance_templates, :required_variables, :jsonb, default: []) # Array of required env vars
    add_column(:instance_templates, :metadata, :jsonb, default: {}) # tags, suggested_models, etc.
    add_column(:instance_templates, :system_template, :boolean, default: false) # Pre-built templates
    add_column(:instance_templates, :usage_count, :integer, default: 0)

    # Add indexes
    add_index(:instance_templates, :category)
    add_index(:instance_templates, :system_template)

    # Migrate existing data to new structure
    reversible do |dir|
      dir.up do
        InstanceTemplate.reset_column_information
        InstanceTemplate.find_each do |template|
          # Build config from existing individual columns
          config = {
            "model" => template.model,
            "provider" => template.provider,
            "directory" => template.directory,
          }

          # Add optional fields if present
          config["prompt"] = template.prompt if template.prompt.present?
          config["allowed_tools"] = template.allowed_tools if template.allowed_tools.present?
          config["disallowed_tools"] = template.disallowed_tools if template.disallowed_tools.present?
          config["worktree"] = template.worktree if template.worktree
          config["vibe"] = template.vibe if template.vibe

          # OpenAI specific
          if template.provider == "openai"
            config["temperature"] = template.temperature if template.temperature.present?
            config["api_version"] = template.api_version if template.api_version.present?
            config["reasoning_effort"] = template.reasoning_effort if template.reasoning_effort.present?
          end

          # Infer required variables from directory
          required_vars = []
          if template.directory&.include?("${")
            template.directory.scan(/\$\{([^}:]+)(?::=[^}]*)?\}/) do |var|
              required_vars << var[0]
            end
          end

          template.config = config
          template.required_variables = required_vars
          template.save!(validate: false)
        end
      end
    end
  end
end
