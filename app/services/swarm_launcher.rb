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
    # Create tmux session
    tmux_session_name = "claude-swarm-#{@session.session_id}"

    Rails.logger.info("Creating tmux session: #{tmux_session_name} in directory: #{@working_directory}")
    # Create session with default size (80x24 is standard terminal size)
    success = system("tmux", "new-session", "-d", "-s", tmux_session_name, "-c", @working_directory, "-x", "132", "-y", "43")

    unless success
      Rails.logger.error("Failed to create tmux session")
      @session.update!(status: "error")
      return false
    end

    # Create session directory and write config
    config_path = write_config_file
    Rails.logger.info("Config written to: #{config_path}")

    # Send a welcome message to the tmux session
    tmux_command = [
      "tmux",
      "send-keys",
      "-t",
      tmux_session_name,
      "clear && echo 'Claude Swarm session started in: #{@working_directory}'",
      "Enter",
    ]

    Rails.logger.info("Running tmux command: #{tmux_command.inspect}")
    success = system(*tmux_command)

    if success
      @session.update!(
        status: "active",
        tmux_session: tmux_session_name,
        launched_at: Time.current,
      )
      Rails.logger.info("Session launched successfully")
      true
    else
      Rails.logger.error("Failed to send command to tmux")
      @session.update!(status: "error")
      false
    end
  rescue StandardError => e
    Rails.logger.error("Failed to launch interactive session: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    @session.update!(status: "error")
    false
  end

  def launch_non_interactive
    # Create session directory and write config
    config_path = write_config_file

    # Create output file
    output_file = File.join(@session.session_path, "output.log")

    # Build command
    command = build_command(config_path)

    # Launch process
    File.open(output_file, "w") do |file|
      pid = spawn(*command, out: file, err: file)
      Process.detach(pid)

      @session.update!(
        status: "active",
        pid: pid,
        output_file: output_file,
        launched_at: Time.current,
      )

      # Start monitoring job
      MonitorNonInteractiveSessionJob.perform_later(@session)
    end

    true
  rescue StandardError => e
    Rails.logger.error("Failed to launch non-interactive session: #{e.message}")
    @session.update!(status: "error")
    false
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
