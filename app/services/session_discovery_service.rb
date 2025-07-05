# frozen_string_literal: true

# Service for discovering claude-swarm sessions from the filesystem
class SessionDiscoveryService
  # List all sessions from the sessions directory
  def self.list_all_sessions(limit: nil)
    sessions_dir = File.expand_path("~/.claude-swarm/sessions")
    return [] unless Dir.exist?(sessions_dir)

    sessions = []
    Dir.glob("#{sessions_dir}/*/*").each do |session_path|
      next unless File.directory?(session_path)
      next unless File.exist?(File.join(session_path, "session_metadata.json"))

      begin
        metadata = load_session_metadata(session_path)
        sessions << build_session_info(session_path, metadata)
      rescue StandardError => e
        Rails.logger.error "Failed to load session #{session_path}: #{e.message}"
      end
    end

    # Sort by start time desc and apply limit
    sessions.sort_by! { |s| -s[:start_time].to_i }
    sessions = sessions.first(limit) if limit
    sessions
  end

  # Get active sessions from run directory symlinks
  def self.active_sessions
    run_dir = File.expand_path("~/.claude-swarm/run")
    return [] unless File.directory?(run_dir)

    Dir.glob(File.join(run_dir, "*")).map do |symlink|
      next unless File.symlink?(symlink)

      session_id = File.basename(symlink)
      session_path = File.readlink(symlink)

      # Verify session still exists
      next unless File.exist?(File.join(session_path, "session_metadata.json"))

      metadata = load_session_metadata(session_path)
      build_session_info(session_path, metadata).merge(active: true)
    end.compact
  end

  def self.load_session_metadata(session_path)
    metadata_file = File.join(session_path, "session_metadata.json")
    JSON.parse(File.read(metadata_file))
  end
  private_class_method :load_session_metadata

  def self.build_session_info(session_path, metadata)
    session_id = File.basename(session_path)
    project_name = File.basename(File.dirname(session_path))

    {
      session_id: session_id,
      session_path: session_path,
      project_name: project_name,
      swarm_name: metadata["swarm_name"],
      start_time: Time.parse(metadata["start_time"]),
      worktree: metadata["worktree"],
      start_directory: metadata["start_directory"]
    }
  end
  private_class_method :build_session_info
end