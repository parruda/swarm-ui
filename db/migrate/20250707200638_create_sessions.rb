# frozen_string_literal: true

class CreateSessions < ActiveRecord::Migration[8.0]
  def change
    create_table(:sessions) do |t|
      t.string(:session_id, null: false, index: { unique: true })
      t.string(:swarm_name)
      t.string(:project_path)
      t.string(:project_folder_name)
      t.datetime(:started_at)
      t.datetime(:ended_at)
      t.integer(:duration_seconds)
      t.string(:status) # active, completed, failed
      t.text(:configuration) # Full YAML content used for this session
      t.string(:configuration_path) # Original file path
      t.jsonb(:metadata) # Additional metadata from session_metadata.json

      t.timestamps
    end
  end
end
