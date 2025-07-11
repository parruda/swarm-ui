# frozen_string_literal: true

class CreateGithubWebhookEvents < ActiveRecord::Migration[8.0]
  def change
    create_table(:github_webhook_events) do |t|
      t.references(:project, null: false, foreign_key: true)
      t.string(:event_type)
      t.boolean(:enabled, default: true)

      t.timestamps
    end
  end
end
