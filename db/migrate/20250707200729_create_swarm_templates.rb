# frozen_string_literal: true

class CreateSwarmTemplates < ActiveRecord::Migration[8.0]
  def change
    create_table(:swarm_templates) do |t|
      t.string(:name, null: false)
      t.text(:description)
      t.references(:project, foreign_key: true) # Optional - null means general-purpose
      t.string(:category) # project_specific, expert, utility
      t.jsonb(:config_data, default: {}) # Full normalized swarm structure
      t.text(:yaml_cache) # Generated YAML for performance
      t.datetime(:yaml_cache_generated_at)
      t.jsonb(:metadata, default: {}) # tags, required_vars, etc.

      # Version control
      t.integer(:version, default: 1)
      t.boolean(:system_template, default: false) # Pre-built templates

      # Usage tracking
      t.integer(:usage_count, default: 0)

      t.timestamps
    end

    add_index(:swarm_templates, :name)
    add_index(:swarm_templates, :category)
    add_index(:swarm_templates, :project_id)
    add_index(:swarm_templates, :system_template)
  end
end
