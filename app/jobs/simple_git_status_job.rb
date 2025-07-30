# frozen_string_literal: true

class SimpleGitStatusJob < ApplicationJob
  queue_as :default

  def perform(session_id)
    session = Session.find_by(id: session_id)
    return unless session&.active?

    # Fetch git status for all session directories
    git_service = OptimizedGitStatusService.new(session)
    git_statuses = git_service.fetch_all_statuses

    # Broadcast the update
    Turbo::StreamsChannel.broadcast_update_to(
      "session_#{session.id}",
      target: "git-status-display",
      partial: "shared/git_status",
      locals: { session: session, git_statuses: git_statuses },
    )
  end
end
