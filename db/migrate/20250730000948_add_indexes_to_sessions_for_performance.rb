# frozen_string_literal: true

class AddIndexesToSessionsForPerformance < ActiveRecord::Migration[8.0]
  def change
    # Add composite index for finding active sessions efficiently
    unless index_exists?(:sessions, [:status, :updated_at])
      add_index(:sessions, [:status, :updated_at], name: "index_sessions_on_status_and_updated_at")
    end

    # Add index for session_id lookups (used in background jobs)
    unless index_exists?(:sessions, :session_id)
      add_index(:sessions, :session_id, name: "index_sessions_on_session_id")
    end

    # Add index for terminal sessions lookups
    unless index_exists?(:terminal_sessions, [:session_id, :status])
      add_index(:terminal_sessions, [:session_id, :status], name: "index_terminal_sessions_on_session_id_and_status")
    end

    unless index_exists?(:terminal_sessions, :terminal_id)
      add_index(:terminal_sessions, :terminal_id, name: "index_terminal_sessions_on_terminal_id")
    end
  end
end
