# frozen_string_literal: true

class AddProjectToSessions < ActiveRecord::Migration[8.0]
  def change
    add_reference(:sessions, :project, foreign_key: true, index: true)

    # Remove index on project_path if it exists since we'll use project_id
    remove_index(:sessions, :project_path) if index_exists?(:sessions, :project_path)
  end
end
