# frozen_string_literal: true

class CreateGithubWebhookProcesses < ActiveRecord::Migration[8.0]
  def change
    create_table(:github_webhook_processes) do |t|
      t.references(:project, null: false, foreign_key: true)
      t.integer(:pid)
      t.string(:status)
      t.datetime(:started_at)
      t.datetime(:stopped_at)

      t.timestamps
    end
  end
end
