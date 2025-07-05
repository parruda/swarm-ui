# frozen_string_literal: true

# Service for cleaning up stale claude-swarm sessions and worktrees
class SessionCleanupService
  def self.cleanup_stale_sessions(days: 7)
    cutoff_time = Time.now - (days * 24 * 60 * 60)
    cleaned_count = 0

    # Clean stale run symlinks
    run_dir = File.expand_path("~/.claude-swarm/run")
    if Dir.exist?(run_dir)
      Dir.glob(File.join(run_dir, "*")).each do |symlink|
        next unless File.symlink?(symlink)

        # Check if target exists and is old enough
        begin
          target = File.readlink(symlink)
          if !File.exist?(target) || File.stat(symlink).mtime < cutoff_time
            File.unlink(symlink)
            cleaned_count += 1
          end
        rescue StandardError => e
          Rails.logger.error "Error cleaning symlink #{symlink}: #{e.message}"
        end
      end
    end

    # Clean orphaned worktrees
    worktrees_dir = File.expand_path("~/.claude-swarm/worktrees")
    if Dir.exist?(worktrees_dir)
      Dir.glob(File.join(worktrees_dir, "*")).each do |session_dir|
        next unless File.directory?(session_dir)

        if File.stat(session_dir).mtime < cutoff_time
          FileUtils.rm_rf(session_dir)
          cleaned_count += 1
        end
      end
    end

    cleaned_count
  end

  def self.cleanup_orphaned_sessions
    # List all tmux sessions
    sessions = `tmux list-sessions -F '#S' 2>/dev/null`.lines.map(&:strip)

    # Find claude-swarm sessions
    claude_sessions = sessions.select { |s| s.start_with?("claude-swarm-") }

    # Check each session against database
    claude_sessions.each do |tmux_session|
      session_id = tmux_session.gsub("claude-swarm-", "")

      unless Session.active.exists?(session_id: session_id)
        system("tmux", "kill-session", "-t", tmux_session)
        Rails.logger.info "Killed orphaned tmux session: #{tmux_session}"
      end
    end
  end
end