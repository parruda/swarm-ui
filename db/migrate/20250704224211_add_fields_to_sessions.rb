class AddFieldsToSessions < ActiveRecord::Migration[8.0]
  def change
    add_column :sessions, :working_directory, :text
    add_column :sessions, :worktree_path, :text
    add_column :sessions, :launched_at, :datetime
  end
end
