# frozen_string_literal: true

class GithubWebhookEvent < ApplicationRecord
  # Associations
  belongs_to :project

  # Common GitHub webhook events
  AVAILABLE_EVENTS = [
    "push",
    "pull_request",
    "pull_request_review",
    "pull_request_review_comment",
    "issues",
    "issue_comment",
    "release",
    "deployment",
    "deployment_status",
    "repository_dispatch",
    "workflow_dispatch",
    "workflow_run",
    "check_run",
    "check_suite",
    "status",
    "commit_comment",
    "create",
    "delete",
    "fork",
    "star",
    "watch",
    "discussion",
    "discussion_comment",
    "milestone",
    "project",
    "project_card",
    "project_column",
    "public",
    "label",
    "branch_protection_rule",
  ].freeze

  # Validations
  validates :event_type, presence: true, inclusion: { in: AVAILABLE_EVENTS }
  validates :event_type, uniqueness: { scope: :project_id }

  # Scopes
  scope :enabled, -> { where(enabled: true) }
  scope :disabled, -> { where(enabled: false) }

  # Common event presets
  class << self
    def common_events
      ["push", "pull_request", "issues", "release"]
    end

    def create_defaults_for_project(project)
      common_events.each do |event|
        project.github_webhook_events.find_or_create_by(event_type: event) do |e|
          e.enabled = true
        end
      end
    end
  end
end
