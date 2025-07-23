# frozen_string_literal: true

class GitStatusUpdateJob < ApplicationJob
  queue_as :default

  # Use a Redis-based cache to track running jobs per session
  class << self
    def running_key(session_id)
      "git_status_job:#{session_id}"
    end
  end

  def perform(session_id)
    session = Session.find_by(id: session_id)
    return unless session&.active?

    # Check if another job is already running for this session
    cache_key = self.class.running_key(session_id)

    # Try to set the flag with a 10-second expiry (longer than update interval)
    return unless Rails.cache.write(cache_key, true, expires_in: 10.seconds, unless_exist: true)

    git_service = GitStatusService.new(session)
    git_statuses = git_service.fetch_all_statuses

    # Broadcast the update to the session's Turbo Stream channel
    Turbo::StreamsChannel.broadcast_update_to(
      "session_#{session.id}",
      target: "git-status-display",
      partial: "shared/git_status_content",
      locals: { session: session, git_statuses: git_statuses },
    )

    # Schedule the next update in 5 seconds if session is still active
    if session.reload.active?
      # Clear the flag before scheduling next job
      Rails.cache.delete(cache_key)
      GitStatusUpdateJob.set(wait: 5.seconds).perform_later(session.id)
    else
      # Clear the flag if session is no longer active
      Rails.cache.delete(cache_key)
    end
  rescue ActiveRecord::RecordNotFound
    # Session was deleted, stop the job and clear the flag
    Rails.cache.delete(self.class.running_key(session_id))
  end
end
