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
    begin
      # Create tmux session
      tmux_session_name = "claude-swarm-#{@session.session_id}"
      success = system("tmux", "new-session", "-d", "-s", tmux_session_name)
      
      unless success
        @session.update!(status: "error")
        return false
      end

      # Create session directory and write config
      config_path = write_config_file
      
      # Build and send command to tmux
      command = build_command(config_path)
      tmux_command = [
        "tmux", "send-keys", "-t", tmux_session_name,
        "cd #{@working_directory} && #{command.join(' ')}",
        "Enter"
      ]
      
      success = system(*tmux_command)
      
      if success
        @session.update!(
          status: "active",
          tmux_session: tmux_session_name,
          launched_at: Time.current
        )
        true
      else
        @session.update!(status: "error")
        false
      end
    rescue StandardError => e
      Rails.logger.error "Failed to launch interactive session: #{e.message}"
      @session.update!(status: "error")
      false
    end
  end

  def launch_non_interactive
    begin
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
          launched_at: Time.current
        )
        
        # Start monitoring job
        MonitorNonInteractiveSessionJob.perform_later(@session)
      end
      
      true
    rescue StandardError => e
      Rails.logger.error "Failed to launch non-interactive session: #{e.message}"
      @session.update!(status: "error")
      false
    end
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
      "--worktree-directory", @session.worktree_path || @working_directory,
      "--config", config_path,
      "--start-directory", @working_directory
    ]
  end
end