class AddGithubTrackingToSessions < ActiveRecord::Migration[8.0]
  def change
    add_column :sessions, :github_issue_number, :integer
    add_column :sessions, :github_pr_number, :integer
    add_column :sessions, :github_issue_type, :string
    
    add_index :sessions, [:project_id, :github_issue_number]
    add_index :sessions, [:project_id, :github_pr_number]
  end
end
