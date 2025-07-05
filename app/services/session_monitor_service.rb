# frozen_string_literal: true

# Service for monitoring claude-swarm session status and metrics
class SessionMonitorService
  def initialize(session_path)
    @session_path = session_path
    @log_path = File.join(@session_path, "session.log.json")
  end

  # Calculate total cost from JSONL events
  def calculate_costs
    costs_by_instance = Hash.new(0.0)

    return costs_by_instance unless File.exist?(@log_path)

    File.foreach(@log_path) do |line|
      entry = JSON.parse(line)
      event = entry["event"]

      # Look for result events with cost information
      if event && event["type"] == "result" && event["total_cost"]
        instance_name = entry["instance"] || "unknown"
        costs_by_instance[instance_name] += event["total_cost"].to_f
      end
    rescue JSON::ParserError
      next
    end

    costs_by_instance
  end

  # Check if session is still active
  def active?
    # Check PIDs in pids/ directory
    pids_dir = File.join(@session_path, "pids")
    if Dir.exist?(pids_dir)
      Dir.glob(File.join(pids_dir, "*")).each do |pid_file|
        pid = File.basename(pid_file).to_i
        begin
          Process.kill(0, pid)
          return true # At least one process is running
        rescue Errno::ESRCH, Errno::EPERM
          # Process not found or no permission, continue checking
        end
      end
    end

    # Also check for active run symlink
    run_dir = File.expand_path("~/.claude-swarm/run")
    session_id = File.basename(@session_path)
    symlink_path = File.join(run_dir, session_id)

    File.symlink?(symlink_path) && File.readlink(symlink_path) == @session_path
  end

  # Get instance hierarchy from MCP configurations
  def instance_hierarchy
    hierarchy = {}
    costs_by_instance = calculate_costs

    # Load main instance from config
    config_file = File.join(@session_path, "config.yml")
    return hierarchy unless File.exist?(config_file)

    begin
      config = YAML.safe_load(File.read(config_file))
      main_instance = config.dig("swarm", "main")
    rescue StandardError => e
      Rails.logger.error "Failed to parse config.yml: #{e.message}"
      return hierarchy
    end

    # Build hierarchy from MCP files
    Dir.glob(File.join(@session_path, "*.mcp.json")).each do |mcp_file|
      instance_name = File.basename(mcp_file, ".mcp.json")
      mcp_data = JSON.parse(File.read(mcp_file))

      # Extract connections from mcpServers
      connections = mcp_data["mcpServers"]&.keys || []

      # Get instance state if available
      state_file = File.join(@session_path, "state", "#{instance_name}.json")
      instance_id = nil
      claude_session_id = nil

      if File.exist?(state_file)
        state_data = JSON.parse(File.read(state_file))
        instance_id = state_data["instance_id"]
        claude_session_id = state_data["claude_session_id"]
      end

      hierarchy[instance_name] = {
        is_main: instance_name == main_instance,
        connections: connections,
        costs: costs_by_instance[instance_name] || 0.0,
        instance_id: instance_id,
        claude_session_id: claude_session_id
      }
    rescue StandardError => e
      Rails.logger.error "Failed to parse MCP file #{mcp_file}: #{e.message}"
    end

    hierarchy
  end

  # Stream log events for real-time updates
  def stream_events(&block)
    return unless File.exist?(@log_path)

    File.open(@log_path, "r") do |file|
      file.seek(0, IO::SEEK_END) # Start at end of file

      loop do
        line = file.gets
        if line
          entry = JSON.parse(line)
          block.call(entry)
        else
          sleep 0.1
        end
      rescue JSON::ParserError
        next
      end
    end
  end
end