# frozen_string_literal: true

class AddProjectToSessions < ActiveRecord::Migration[8.0]
  def up
    # First add the column as nullable
    add_reference(:sessions, :project, foreign_key: true, index: true)

    # Create projects for existing sessions based on their project_path
    Session.reset_column_information
    Session.find_each do |session|
      next unless session.project_path.present?

      # Find or create a project for this session
      project = Project.find_or_create_by!(path: session.project_path) do |p|
        p.name = File.basename(session.project_path)
      end

      session.update_column(:project_id, project.id)
    end

    # Now make the column non-nullable
    change_column_null(:sessions, :project_id, false)

    # Remove project_path column since we'll use project relationship
    remove_column(:sessions, :project_path, :string)
  end

  def down
    add_column(:sessions, :project_path, :string)

    # Restore project_path from projects
    Session.reset_column_information
    Session.includes(:project).find_each do |session|
      session.update_column(:project_path, session.project.path) if session.project
    end

    remove_reference(:sessions, :project, foreign_key: true, index: true)
  end
end
