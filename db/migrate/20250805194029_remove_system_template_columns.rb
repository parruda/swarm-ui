# frozen_string_literal: true

class RemoveSystemTemplateColumns < ActiveRecord::Migration[8.0]
  def change
    # Remove system_template column and index from swarm_templates
    remove_index(:swarm_templates, :system_template) if index_exists?(:swarm_templates, :system_template)
    remove_column(:swarm_templates, :system_template, :boolean)

    # Remove system_template column and index from instance_templates
    remove_index(:instance_templates, :system_template) if index_exists?(:instance_templates, :system_template)
    remove_column(:instance_templates, :system_template, :boolean)
  end
end
