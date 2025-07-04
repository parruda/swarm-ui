class CleanupStaleSessionsJob < ApplicationJob
  queue_as :maintenance
  
  def perform(days: 7)
    # Clean up tmux sessions first
    SessionCleanupService.cleanup_orphaned_sessions
    
    # Clean up stale files and worktrees
    cleaned = SessionCleanupService.cleanup_stale_sessions(days: days)
    Rails.logger.info "Cleaned up #{cleaned} stale sessions/worktrees"
  end
end