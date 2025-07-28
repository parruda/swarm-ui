# frozen_string_literal: true

class AddColumnsToSwarmTemplates < ActiveRecord::Migration[8.0]
  def change
    # Add new columns for enhanced functionality
    add_reference(:swarm_templates, :project, foreign_key: true) # Optional - null means general-purpose
    add_column(:swarm_templates, :category, :string) # project_specific, expert, utility
    add_column(:swarm_templates, :config_data, :jsonb, default: {}) # Full normalized swarm structure
    add_column(:swarm_templates, :yaml_cache, :text) # Generated YAML for performance
    add_column(:swarm_templates, :yaml_cache_generated_at, :datetime)
    add_column(:swarm_templates, :metadata, :jsonb, default: {}) # tags, required_vars, etc.
    add_column(:swarm_templates, :version, :integer, default: 1)
    add_column(:swarm_templates, :system_template, :boolean, default: false) # Pre-built templates
    add_column(:swarm_templates, :usage_count, :integer, default: 0)

    # Add indexes
    add_index(:swarm_templates, :category)
    add_index(:swarm_templates, :system_template)

    # Migrate existing data
    reversible do |dir|
      dir.up do
        SwarmTemplate.reset_column_information
        SwarmTemplate.find_each do |template|
          # Migrate instance_config to config_data with proper structure
          if template.instance_config.present?
            template.config_data = {
              "version" => 1,
              "swarm" => {
                "name" => template.name,
                "main" => template.main_instance,
                "instances" => template.instance_config["instances"] || {},
              },
            }
            template.save!(validate: false)
          end
        end
      end
    end
  end
end
