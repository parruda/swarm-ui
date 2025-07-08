# frozen_string_literal: true

class AddSessionPathToSessions < ActiveRecord::Migration[8.0]
  def change
    add_column(:sessions, :session_path, :string)

    # Update existing records
    reversible do |dir|
      dir.up do
        Session.find_each do |session|
          if session.project_path.present? && session.session_id.present?
            folder_name = session.project_path.dup
            folder_name = folder_name[1..] if folder_name.start_with?("/")
            folder_name = folder_name[2..] if folder_name.match?(/^[A-Z]:/)
            folder_name = folder_name.gsub(%r{[/\\]}, "+")

            home = ENV["CLAUDE_SWARM_HOME"] || File.expand_path("~/.claude-swarm")
            session_path = File.join(home, "sessions", folder_name, session.session_id)

            session.update_column(:session_path, session_path)
          end
        end
      end
    end

    # Now make it not null
    change_column_null(:sessions, :session_path, false)
  end
end
