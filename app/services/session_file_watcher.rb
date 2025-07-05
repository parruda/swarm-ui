# frozen_string_literal: true

# Service for monitoring file system changes in session directories
class SessionFileWatcher
  def self.watch(session_path, &block)
    return unless Dir.exist?(session_path)

    require "listen"

    listener = Listen.to(session_path) do |modified, added, removed|
      changes = {
        modified: modified.map { |f| File.basename(f) },
        added: added.map { |f| File.basename(f) },
        removed: removed.map { |f| File.basename(f) }
      }

      # Call block with change details
      block.call(changes) if block_given?
    end

    listener.start
    listener
  end

  def self.watch_sessions_directory(&block)
    sessions_dir = File.expand_path("~/.claude-swarm/sessions")
    run_dir = File.expand_path("~/.claude-swarm/run")

    Listen.to(sessions_dir, run_dir) do |modified, added, removed|
      # Notify about new sessions or status changes
      block.call(modified, added, removed) if block_given?
    end
  end
end