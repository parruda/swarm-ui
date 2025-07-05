class CreateSwarmConfigurations < ActiveRecord::Migration[8.0]
  def change
    create_table :swarm_configurations do |t|
      t.string :name, null: false
      t.text :description
      t.text :config_yaml, null: false
      t.boolean :is_template, default: false
      t.text :before, array: true, default: []

      t.timestamps
    end
  end
end