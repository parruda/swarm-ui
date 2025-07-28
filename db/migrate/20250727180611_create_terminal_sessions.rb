# frozen_string_literal: true

class CreateTerminalSessions < ActiveRecord::Migration[8.0]
  def change
    create_table(:terminal_sessions) do |t|
      t.references(:session, null: false, foreign_key: true)
      t.string(:terminal_id, null: false)
      t.string(:directory, null: false)
      t.string(:instance_name, null: false)
      t.string(:name, null: false)
      t.string(:status, null: false, default: "active")
      t.datetime(:opened_at, null: false)
      t.datetime(:ended_at)

      t.timestamps
    end
    add_index(:terminal_sessions, :terminal_id, unique: true)
    add_index(:terminal_sessions, [:session_id, :status])
  end
end
