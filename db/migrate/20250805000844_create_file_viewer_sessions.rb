# frozen_string_literal: true

class CreateFileViewerSessions < ActiveRecord::Migration[8.0]
  def change
    create_table(:file_viewer_sessions) do |t|
      t.references(:session, null: false, foreign_key: true)
      t.string(:viewer_id, null: false)
      t.string(:directory, null: false)
      t.string(:instance_name, null: false)
      t.string(:name, null: false)
      t.string(:status, default: "active", null: false)
      t.datetime(:opened_at)
      t.datetime(:closed_at)

      t.timestamps
    end

    add_index(:file_viewer_sessions, :viewer_id, unique: true)
    add_index(:file_viewer_sessions, :status)
  end
end
