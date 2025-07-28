# frozen_string_literal: true

class CreateSwarmTemplateInstances < ActiveRecord::Migration[8.0]
  def change
    create_table(:swarm_template_instances) do |t|
      t.references(:swarm_template, null: false, foreign_key: true)
      t.references(:instance_template, null: false, foreign_key: true)
      t.string(:instance_key, null: false) # The key used in the swarm YAML
      t.json(:overrides, default: {}) # Instance-specific overrides
      t.integer(:position) # For ordering instances in the swarm

      t.timestamps
    end

    add_index(:swarm_template_instances, [:swarm_template_id, :instance_key], unique: true, name: "idx_swarm_template_instances_unique")
    add_index(:swarm_template_instances, :position)
  end
end
