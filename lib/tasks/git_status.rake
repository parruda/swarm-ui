# frozen_string_literal: true

namespace :git_status do
  desc "Clean up stale git status cache and locks"
  task cleanup: :environment do
    puts "Cleaning up stale git status data..."

    # Clean up locks older than 5 minutes
    lock_pattern = "#{GitOperationLockService::LOCK_PREFIX}:*"
    stale_locks = 0

    Rails.cache.redis.scan_each(match: lock_pattern) do |key|
      ttl = Rails.cache.redis.ttl(key)
      # If TTL is -1 (no expiry) or very long, delete it
      if ttl == -1 || ttl > 300
        Rails.cache.delete(key.sub("#{Rails.cache.options[:namespace]}:", ""))
        stale_locks += 1
      end
    end

    puts "Removed #{stale_locks} stale git operation locks"

    # Clean up old git status caches
    cache_pattern = "git_status_cache:*"
    monitor_pattern = "git_monitor_job:*"
    stale_caches = 0

    [cache_pattern, monitor_pattern].each do |pattern|
      Rails.cache.redis.scan_each(match: pattern) do |key|
        # Check if the session still exists and is active
        session_id = key.match(/:([\w-]+)$/)[1]
        session = Session.find_by(session_id: session_id)

        unless session&.active?
          Rails.cache.delete(key.sub("#{Rails.cache.options[:namespace]}:", ""))
          stale_caches += 1
        end
      end
    end

    puts "Removed #{stale_caches} stale git status caches"
    puts "Cleanup complete!"
  end

  desc "Show git status job statistics"
  task stats: :environment do
    puts "\nGit Status Job Statistics"
    puts "=" * 50

    # Count active monitoring jobs
    active_jobs = 0
    Rails.cache.redis.scan_each(match: "git_monitor_job:*") do |_key|
      active_jobs += 1
    end

    puts "Active monitoring jobs: #{active_jobs}"

    # Count cached statuses
    cached_statuses = 0
    Rails.cache.redis.scan_each(match: "git_status_cache:*") do |_key|
      cached_statuses += 1
    end

    puts "Cached git statuses: #{cached_statuses}"

    # Count active locks
    active_locks = 0
    Rails.cache.redis.scan_each(match: "#{GitOperationLockService::LOCK_PREFIX}:*") do |_key|
      active_locks += 1
    end

    puts "Active git operation locks: #{active_locks}"

    # Show active sessions
    active_sessions = Session.active.count
    puts "\nActive SwarmUI sessions: #{active_sessions}"

    # Show job queue stats
    if defined?(SolidQueue)
      queued_jobs = SolidQueue::Job.where(queue_name: "default").where("finished_at IS NULL").count
      puts "Queued background jobs: #{queued_jobs}"
    end
  end
end
