# frozen_string_literal: true

class CleanupDisallowedGithubWebhookEvents < ActiveRecord::Migration[8.0]
  def up
    # Delete any webhook events that are no longer in the allowed list
    allowed_events = ["issue_comment", "pull_request_review", "pull_request_review_comment"]

    GithubWebhookEvent.where.not(event_type: allowed_events).destroy_all
  end

  def down
    # This migration cannot be reversed as we've deleted data
    raise ActiveRecord::IrreversibleMigration
  end
end
