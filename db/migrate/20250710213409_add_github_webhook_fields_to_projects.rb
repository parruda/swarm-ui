# frozen_string_literal: true

class AddGithubWebhookFieldsToProjects < ActiveRecord::Migration[8.0]
  def change
    add_column(:projects, :github_webhook_enabled, :boolean, default: false)
    add_column(:projects, :github_webhook_auto_start, :boolean, default: false)
    add_column(:projects, :github_repo_owner, :string)
    add_column(:projects, :github_repo_name, :string)
  end
end
