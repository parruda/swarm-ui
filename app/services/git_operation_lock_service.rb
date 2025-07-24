# frozen_string_literal: true

# Service to manage locks for git operations to prevent concurrent Dir.chdir issues
class GitOperationLockService
  # Use Rails cache to manage locks across threads/processes
  LOCK_TIMEOUT = 30.seconds # Maximum time a lock can be held
  LOCK_PREFIX = "git_operation_lock"

  class << self
    def with_lock(session_id, directory)
      lock_key = "#{LOCK_PREFIX}:#{session_id}:#{directory.gsub("/", "_")}"
      Rails.logger.debug("[GitLock] Attempting to acquire lock: #{lock_key}")

      # Try to acquire lock with exponential backoff
      retries = 0
      max_retries = 10

      while retries < max_retries
        if Rails.cache.write(lock_key, Process.pid, expires_in: LOCK_TIMEOUT, unless_exist: true)
          Rails.logger.debug("[GitLock] Lock acquired: #{lock_key}")
          begin
            # Execute the block with the lock
            return yield
          ensure
            # Always release the lock
            Rails.cache.delete(lock_key)
            Rails.logger.debug("[GitLock] Lock released: #{lock_key}")
          end
        else
          # Lock is held by another process
          retries += 1
          wait_time = [0.1 * (2**retries), 2].min # Exponential backoff, max 2 seconds
          Rails.logger.debug("[GitLock] Lock busy, waiting #{wait_time}s (retry #{retries}/#{max_retries})")
          sleep(wait_time)
        end
      end

      # If we couldn't acquire the lock after all retries
      Rails.logger.error("[GitLock] Failed to acquire lock after #{max_retries} retries: #{lock_key}")
      raise "Another git operation is in progress. Please try again."
    end

    # Check if a lock is currently held
    def locked?(session_id, directory)
      lock_key = "#{LOCK_PREFIX}:#{session_id}:#{directory.gsub("/", "_")}"
      Rails.cache.exist?(lock_key)
    end

    # Force release a lock (use with caution)
    def force_release(session_id, directory)
      lock_key = "#{LOCK_PREFIX}:#{session_id}:#{directory.gsub("/", "_")}"
      Rails.cache.delete(lock_key)
      Rails.logger.warn("[GitLock] Force released lock: #{lock_key}")
    end
  end
end
