# frozen_string_literal: true

class RemoveGithubWebhookAutoStartFromProjects < ActiveRecord::Migration[8.0]
  def change
    remove_column(:projects, :github_webhook_auto_start, :boolean)
  end
end
