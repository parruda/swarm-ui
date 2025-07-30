# frozen_string_literal: true

class GitStatusMonitorJob < ApplicationJob
  queue_as :default

  # Intelligent polling intervals based on activity
  ACTIVE_INTERVAL = 2.seconds # When changes detected recently
  NORMAL_INTERVAL = 10.seconds   # Default interval
  IDLE_INTERVAL = 30.seconds     # When no changes for a while

  class << self
    def running_key(session_id)
      "git_monitor_job:#{session_id}"
    end

    def cache_key(session_id)
      "git_status_cache:#{session_id}"
    end

    def last_change_key(session_id)
      "git_last_change:#{session_id}"
    end
  end

  def perform(session_id, force_update: false)
    session = Session.find_by(id: session_id)
    return unless session&.active?

    # Check if another job is already running for this session
    running_key = self.class.running_key(session_id)
    return unless Rails.cache.write(running_key, true, expires_in: 60.seconds, unless_exist: true)

    begin
      # Get cached status if available and not forcing update
      cache_key = self.class.cache_key(session_id)
      last_change_key = self.class.last_change_key(session_id)

      cached_status = Rails.cache.read(cache_key) unless force_update

      if cached_status && !should_refresh?(session_id, cached_status)
        # Use cached status
        broadcast_update(session, cached_status)
      else
        # Fetch fresh status
        git_service = OptimizedGitStatusService.new(session)
        Rails.logger.debug("[GitStatusMonitorJob] Fetching fresh git status for session #{session_id}")
        git_statuses = git_service.fetch_all_statuses

        # Check if status changed
        status_changed = cached_status != git_statuses

        if status_changed
          Rails.logger.debug("[GitStatusMonitorJob] Git status changed for session #{session_id}")
          Rails.cache.write(last_change_key, Time.current, expires_in: 1.hour)
        end

        # Cache the status
        Rails.cache.write(cache_key, git_statuses, expires_in: 5.minutes)

        # Broadcast the update
        broadcast_update(session, git_statuses)
      end

      # Schedule next update with intelligent interval
      if session.reload.active?
        next_interval = calculate_next_interval(session_id, cached_status != git_statuses)
        Rails.cache.delete(running_key)
        GitStatusMonitorJob.set(wait: next_interval).perform_later(session.id)
      else
        cleanup_cache(session_id)
      end
    rescue ActiveRecord::RecordNotFound
      cleanup_cache(session_id)
    ensure
      Rails.cache.delete(running_key)
    end
  end

  private

  def should_refresh?(session_id, cached_status)
    # Force refresh if:
    # 1. Cached data is older than 30 seconds
    # 2. A git operation was performed recently
    return true unless cached_status.is_a?(Hash)

    # Check if any status has last_fetched older than 30 seconds
    cached_status.values.flatten.any? do |status|
      next true unless status.is_a?(Hash) && status[:last_fetched]

      Time.current - Time.parse(status[:last_fetched].to_s) > 30.seconds
    end
  end

  def calculate_next_interval(session_id, status_changed)
    last_change_key = self.class.last_change_key(session_id)
    last_change = Rails.cache.read(last_change_key)

    if status_changed
      # Changes detected, use active interval
      ACTIVE_INTERVAL
    elsif last_change && Time.current - last_change < 1.minute
      # Recent changes, stay on active interval
      ACTIVE_INTERVAL
    elsif last_change && Time.current - last_change < 10.minutes
      # Some recent activity, use normal interval
      NORMAL_INTERVAL
    else
      # No recent activity, use idle interval
      IDLE_INTERVAL
    end
  end

  def broadcast_update(session, git_statuses)
    Turbo::StreamsChannel.broadcast_update_to(
      "session_#{session.id}",
      target: "git-status-display",
      partial: "shared/git_status",
      locals: { session: session, git_statuses: git_statuses },
    )
  end

  def cleanup_cache(session_id)
    Rails.cache.delete(self.class.running_key(session_id))
    Rails.cache.delete(self.class.cache_key(session_id))
    Rails.cache.delete(self.class.last_change_key(session_id))
  end
end
