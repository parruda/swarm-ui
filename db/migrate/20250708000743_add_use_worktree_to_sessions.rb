class AddUseWorktreeToSessions < ActiveRecord::Migration[8.0]
  def change
    add_column :sessions, :use_worktree, :boolean, default: false, null: false
  end
end
