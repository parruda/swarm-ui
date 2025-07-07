# frozen_string_literal: true

# Service for launching claude-swarm sessions
class SwarmLauncher
  def initialize(session)
    @session = session
    @working_directory = session.working_directory || Dir.pwd

    # Get config from either swarm_configuration or configuration_hash
    @config_hash = if session.swarm_configuration
      session.swarm_configuration.configuration
    elsif session.respond_to?(:configuration_hash) && session.configuration_hash
      session.configuration_hash
    else
      raise ArgumentError, "Session must have either swarm_configuration or configuration_hash"
    end
  end

  def launch_interactive
    # Create tmux session name
    tmux_session_name = "claude-swarm-#{@session.session_id}"

    Rails.logger.info("Creating tmux session: #{tmux_session_name} in directory: #{@working_directory}")

    # Create session directory and write config
    config_path = write_config_file
    Rails.logger.info("Config written to: #{config_path}")

    # Update session to active - ttyd will create the tmux session when iframe loads
    @session.update!(
      status: "active",
      tmux_session: tmux_session_name,
      launched_at: Time.current,
    )
    Rails.logger.info("Session marked as active, tmux session will be created on first access")
    true
  rescue StandardError => e
    Rails.logger.error("Failed to launch interactive session: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    @session.update!(status: "error")
    false
  end

  def launch_non_interactive
    # For now, treat it the same as interactive
    launch_interactive
  end

  private

  def write_config_file
    FileUtils.mkdir_p(@session.session_path)
    config_path = File.join(@session.session_path, "config.yml")
    File.write(config_path, @config_hash.to_yaml)
    config_path
  end

  def build_command(config_path)
    [
      "claude-swarm",
      "--worktree-directory",
      @session.worktree_path || @working_directory,
      "--config",
      config_path,
      "--start-directory",
      @working_directory,
    ]
  end
end
