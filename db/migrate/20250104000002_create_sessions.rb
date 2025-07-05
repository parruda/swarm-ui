class CreateSessions < ActiveRecord::Migration[8.0]
  def change
    create_table :sessions do |t|
      t.string :session_id, null: false
      t.text :session_path, null: false
      t.references :swarm_configuration, foreign_key: true
      t.string :swarm_name
      t.string :mode, default: 'interactive'
      t.string :status, default: 'active'
      t.string :tmux_session
      t.text :output_file
      t.integer :pid

      t.timestamps
    end

    add_index :sessions, :session_id, unique: true
  end
end