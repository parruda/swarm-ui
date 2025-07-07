require 'yaml'

class SessionsController < ApplicationController
  def index
    # Merge database sessions with discovered sessions
    @sessions = merge_sessions_with_discovery
  end
  
  def new
    @config_files = []  # Config files will be loaded dynamically via AJAX
    @saved_configurations = SwarmConfiguration.all
    @directories = Directory.order(last_accessed_at: :desc).limit(10)
  end
  
  def create
    # Generate session ID
    session_id = Time.now.strftime("%Y%m%d_%H%M%S")
    
    # Create session path
    project_name = File.basename(session_params[:directory_path] || 'default')
    session_path = File.expand_path("~/.claude-swarm/sessions/#{project_name}/#{session_id}")
    
    # Determine configuration
    config = determine_configuration
    
    # Create session record
    @session = Session.create!(
      session_id: session_id,
      session_path: session_path,
      swarm_configuration: config[:swarm_configuration],
      swarm_name: config[:swarm_name] || "New Swarm",
      mode: session_params[:mode] || 'interactive',
      status: 'starting',
      working_directory: session_params[:directory_path],
      worktree_path: session_params[:use_worktree] ? generate_worktree_path(session_id) : nil
    )
    
    # Set configuration hash if using file or new config
    if config[:configuration_hash]
      @session.define_singleton_method(:configuration_hash) do
        config[:configuration_hash]
      end
    end
    
    # Launch the session
    launcher = SwarmLauncher.new(@session)
    
    if @session.mode == 'interactive'
      launcher.launch_interactive
    else
      launcher.launch_non_interactive(session_params[:prompt])
    end
    
    redirect_to session_path(session_id)
  rescue => e
    Rails.logger.error "Failed to create session: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")
    flash[:error] = "Failed to launch session: #{e.message}"
    redirect_to new_session_path
  end
  
  def restore
    @sessions = SessionDiscoveryService.list_all_sessions(limit: 50)
    @sessions = @sessions.map do |session_data|
      # Enrich with database info if exists
      db_session = Session.find_by(session_id: session_data[:session_id])
      
      # Check if session is still active
      monitor = SessionMonitorService.new(session_data[:session_path])
      active = monitor.active?
      
      session_data.merge(db_session: db_session, active: active)
    end
  end
  
  def do_restore
    session_id = params[:session_id]
    
    # Check original session mode from metadata
    session_path = find_session_path(session_id)
    metadata_file = File.join(session_path, "session_metadata.json")
    original_mode = 'interactive'  # default assumption
    
    if File.exist?(metadata_file)
      metadata = JSON.parse(File.read(metadata_file))
      # Check if original session was non-interactive by looking for prompt in first launch
      # This would need to be stored in metadata during initial launch
      original_mode = metadata['mode'] || 'interactive'
    end
    
    cmd = ["claude-swarm", "--session-id", session_id]
    
    if original_mode == 'interactive' || params[:force_interactive]
      # Launch in tmux for interactive restoration
      tmux_session = "claude-swarm-#{session_id}"
      tmux_cmd = ["tmux", "new-session", "-d", "-s", tmux_session, *cmd]
      
      if system(*tmux_cmd)
        # Update or create session record
        session = Session.find_or_create_by(session_id: session_id) do |s|
          s.session_path = session_path
        end
        session.update!(
          session_path: session_path,
          status: 'active',
          tmux_session: tmux_session,
          mode: 'interactive'
        )
        redirect_to session_path(session_id)
      else
        flash[:error] = "Failed to restore session"
        redirect_to restore_sessions_path
      end
    else
      # Non-interactive restoration needs a prompt
      flash[:alert] = "Original session was non-interactive. Restoration would require a new prompt."
      redirect_to restore_sessions_path
    end
  end
  
  def show
    @session = Session.find_by!(session_id: params[:id])
    
    # Get real-time session info from file system
    if @session.session_path && File.exist?(@session.session_path)
      monitor = SessionMonitorService.new(@session.session_path)
      @costs = monitor.calculate_costs
      @instance_hierarchy = monitor.instance_hierarchy
      @active = monitor.active?
      @total_cost = @costs.values.sum
    else
      @costs = {}
      @instance_hierarchy = {}
      @active = false
      @total_cost = 0.0
    end
    
    render layout: 'terminal'
  end
  
  def logs
    @session = Session.find_by!(session_id: params[:id])
    
    # Stream logs via ActionCable or return recent logs
    if request.headers['Accept'].include?('text/event-stream')
      # SSE streaming
      response.headers['Content-Type'] = 'text/event-stream'
      response.headers['Cache-Control'] = 'no-cache'
      
      monitor = SessionMonitorService.new(@session.session_path)
      monitor.stream_events do |event|
        response.stream.write("data: #{event.to_json}\n\n")
      end
    else
      # Return recent log events
      parser = LogParserService.new(File.join(@session.session_path, "session.log.json"))
      @events = parser.event_timeline(start_time: 1.hour.ago)
      render json: @events
    end
  ensure
    response.stream.close if response.stream.respond_to?(:close)
  end
  
  def destroy
    @session = Session.find_by!(session_id: params[:id])
    
    # Send SIGTERM to main process if PID file exists
    process_terminated = false
    if @session.session_path.present?
      pid_file = File.join(@session.session_path, "main_pid")
      if File.exist?(pid_file)
        begin
          pid = File.read(pid_file).strip.to_i
          if pid > 0
            Process.kill("TERM", pid)
            Rails.logger.info("Sent SIGTERM to main process PID: #{pid}")
            
            # Wait up to 10 seconds for process to terminate
            10.times do
              begin
                Process.kill(0, pid)  # Check if process still exists
                sleep 1
              rescue Errno::ESRCH
                # Process no longer exists
                process_terminated = true
                Rails.logger.info("Process #{pid} terminated successfully")
                break
              end
            end
            
            unless process_terminated
              Rails.logger.warn("Process #{pid} did not terminate within 10 seconds")
            end
          end
        rescue Errno::ESRCH
          Rails.logger.info("Process #{pid} not found (already terminated)")
          process_terminated = true
        rescue Errno::EPERM
          Rails.logger.error("Permission denied to kill process #{pid}")
        rescue => e
          Rails.logger.error("Error killing process: #{e.message}")
        end
      end
    end
    
    # Kill tmux session after process is terminated
    if @session.tmux_session.present? && process_terminated
      if system("tmux", "has-session", "-t", @session.tmux_session, err: File::NULL, out: File::NULL)
        system("tmux", "kill-session", "-t", @session.tmux_session)
        Rails.logger.info("Killed tmux session: #{@session.tmux_session}")
      end
    end
    
    @session.update!(status: 'terminated')
    
    redirect_to sessions_path
  end
  
  # GET /sessions/:id/output
  # Get output for non-interactive sessions
  def output
    @session = Session.find_by!(session_id: params[:id])
    
    if @session.mode == 'non-interactive' && @session.output_file && File.exist?(@session.output_file)
      render plain: File.read(@session.output_file)
    else
      render plain: "No output available for this session"
    end
  end
  
  private
  
  def session_params
    params.permit(:directory_path, :configuration_source, :config_path, 
                  :swarm_configuration_id, :mode, :prompt, :use_worktree, 
                  :worktree_name, :global_vibe, :debug_mode)
  end
  
  def determine_configuration
    case session_params[:configuration_source]
    when 'saved'
      config = SwarmConfiguration.find(session_params[:swarm_configuration_id])
      {
        swarm_configuration: config,
        swarm_name: config.name,
        configuration_hash: nil
      }
    when 'file'
      # Load from file
      config_content = File.read(session_params[:config_path])
      config_hash = YAML.safe_load(config_content)
      {
        swarm_configuration: nil,
        swarm_name: config_hash.dig('swarm', 'name') || 'File Config',
        configuration_hash: config_hash
      }
    when 'new'
      # Create basic config
      {
        swarm_configuration: nil,
        swarm_name: 'New Swarm',
        configuration_hash: {
          'swarm' => {
            'name' => 'New Swarm',
            'main' => 'leader',
            'instances' => {
              'leader' => {
                'description' => 'Main Claude instance',
                'model' => 'opus'
              }
            }
          }
        }
      }
    else
      # Default to looking for claude-swarm.yml in directory
      config_path = File.join(session_params[:directory_path], 'claude-swarm.yml')
      if File.exist?(config_path)
        config_content = File.read(config_path)
        config_hash = YAML.safe_load(config_content)
        {
          swarm_configuration: nil,
          swarm_name: config_hash.dig('swarm', 'name') || 'Default Config',
          configuration_hash: config_hash
        }
      else
        raise "No configuration found. Please select a configuration option."
      end
    end
  end
  
  def generate_worktree_path(session_id)
    File.expand_path("~/.claude-swarm/worktrees/#{session_id}")
  end
  
  def find_config_files
    # Find all YAML files that are valid swarm configurations
    config_files = []
    
    if params[:directory_path].present? && Dir.exist?(params[:directory_path])
      # Find all YAML files
      yaml_patterns = ['**/*.yml', '**/*.yaml']
      yaml_files = yaml_patterns.flat_map { |pattern| Dir.glob(File.join(params[:directory_path], pattern)) }
      
      yaml_files.each do |path|
        begin
          # Try to parse the YAML file
          content = File.read(path)
          config = YAML.safe_load(content)
          
          # Check if it's a valid swarm configuration
          if valid_swarm_config?(config)
            relative_path = path.sub(params[:directory_path] + '/', '')
            swarm_name = config.dig('swarm', 'name') || 'Unnamed Swarm'
            
            config_files << {
              path: path,
              name: "#{relative_path} - #{swarm_name}",
              relative_path: relative_path,
              swarm_name: swarm_name,
              modified_at: File.mtime(path)
            }
          end
        rescue => e
          # Skip files that can't be parsed
          Rails.logger.debug "Skipping #{path}: #{e.message}"
        end
      end
    end
    
    config_files.sort_by { |f| -f[:modified_at].to_i }
  end
  
  def valid_swarm_config?(config)
    return false unless config.is_a?(Hash)
    
    # Check for swarm key
    return false unless config['swarm'].is_a?(Hash)
    
    swarm = config['swarm']
    
    # Must have instances
    return false unless swarm['instances'].present?
    
    # Instances can be either an array or a hash
    if swarm['instances'].is_a?(Array)
      # Array format: each instance should have a name
      swarm['instances'].all? { |i| i.is_a?(Hash) && i['name'].present? }
    elsif swarm['instances'].is_a?(Hash)
      # Hash format: keys are instance names
      swarm['instances'].keys.any?
    else
      false
    end
  end
  
  def merge_sessions_with_discovery
    # Get sessions from database
    db_sessions = Session.includes(:swarm_configuration).to_a
    db_session_ids = db_sessions.map(&:session_id)
    
    # Get active sessions from file system (with metadata)
    active_sessions = SessionDiscoveryService.active_sessions
    
    # Also check for ANY symlinks in the run directory (including those without metadata)
    run_dir = File.expand_path("~/.claude-swarm/run")
    all_active_session_ids = []
    if File.directory?(run_dir)
      all_active_session_ids = Dir.entries(run_dir).select { |f| File.symlink?(File.join(run_dir, f)) }
    end
    
    # Import any active sessions that aren't in the database yet
    active_sessions.each do |discovered|
      next if db_session_ids.include?(discovered[:session_id])
      
      # Create database record for discovered session
      session = Session.create!(
        session_id: discovered[:session_id],
        session_path: discovered[:session_path],
        swarm_name: discovered[:swarm_name] || "Discovered Session",
        created_at: discovered[:start_time] || Time.current,
        status: 'active',
        mode: 'interactive',
        working_directory: discovered[:session_path]
      )
      db_sessions << session
      Rails.logger.info("Imported discovered session: #{discovered[:session_id]}")
    end
    
    # Update status based on what's actually running (check all symlinks, not just those with metadata)
    db_sessions.each do |session|
      # Check if session has a symlink in the run directory
      is_running = all_active_session_ids.include?(session.session_id)
      
      # Update status if it changed
      if is_running && session.status != 'active'
        session.update!(status: 'active')
      elsif !is_running && session.status == 'active'
        session.update!(status: 'inactive')
      end
      
      # Set the status for display (doesn't persist unless changed above)
      session.status = is_running ? 'active' : 'inactive'
    end
    
    db_sessions.sort_by { |s| -s.created_at.to_i }
  end
  
  def find_session_path(session_id)
    # Try to find session path from database first
    session = Session.find_by(session_id: session_id)
    return session.session_path if session&.session_path
    
    # Otherwise look in file system
    sessions_dir = File.expand_path("~/.claude-swarm/sessions")
    session_path = File.join(sessions_dir, session_id)
    
    return session_path if File.exist?(session_path)
    
    # Check if it's a symlink in run directory
    run_link = File.expand_path("~/.claude-swarm/run/#{session_id}")
    if File.exist?(run_link) && File.symlink?(run_link)
      return File.readlink(run_link)
    end
    
    raise "Session path not found for #{session_id}"
  end
end