# frozen_string_literal: true

# Clean up any orphaned tmux sessions on startup
Rails.application.config.after_initialize do
  SessionCleanupService.cleanup_orphaned_sessions
rescue StandardError => e
  Rails.logger.error "Failed to cleanup orphaned sessions on startup: #{e.message}"
end