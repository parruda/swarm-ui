class CreateDirectories < ActiveRecord::Migration[8.0]
  def change
    create_table :directories do |t|
      t.text :path, null: false
      t.string :name
      t.boolean :is_git_repository, default: false
      t.references :default_swarm_configuration, foreign_key: { to_table: :swarm_configurations }
      t.datetime :last_accessed_at

      t.timestamps
    end

    add_index :directories, :path, unique: true
  end
end