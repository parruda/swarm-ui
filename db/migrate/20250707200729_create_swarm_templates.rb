# frozen_string_literal: true

class CreateSwarmTemplates < ActiveRecord::Migration[8.0]
  def change
    create_table(:swarm_templates) do |t|
      t.string(:name, null: false)
      t.text(:description)
      t.jsonb(:instance_config) # Which instances and their connections
      t.string(:main_instance)

      t.timestamps
    end

    add_index(:swarm_templates, :name)
  end
end
