class CreateSwarmInstanceTemplates < ActiveRecord::Migration[8.0]
  def change
    create_table :swarm_instance_templates do |t|
      t.references :swarm_configuration, null: false, foreign_key: { on_delete: :cascade }
      t.references :instance_template, foreign_key: true
      t.string :instance_name, null: false
      t.text :directory
      t.text :connections, array: true, default: []

      t.timestamps
    end

    add_index :swarm_instance_templates, [:swarm_configuration_id, :instance_name], 
              unique: true, name: 'index_swarm_instance_templates_unique'
  end
end