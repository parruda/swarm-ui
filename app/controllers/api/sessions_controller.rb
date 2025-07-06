require 'yaml'

module Api
  class SessionsController < BaseController
    # GET /api/sessions
    # Return sessions in JSON format for AJAX requests
    def index
      # Get sessions from database
      sessions = Session.includes(:swarm_configuration)
      
      # Filter by status if provided
      if params[:status].present?
        sessions = sessions.where(status: params[:status])
      end
      
      # Apply pagination
      limit = params[:limit]&.to_i || 50
      offset = params[:offset]&.to_i || 0
      sessions = sessions.limit(limit).offset(offset).order(created_at: :desc)
      
      # Get active sessions from file system
      active_session_ids = SessionDiscoveryService.active_sessions.map { |s| s[:session_id] }
      
      # Build response data
      sessions_data = sessions.map do |session|
        session_json = session.as_json(
          include: { swarm_configuration: { only: [:id, :name] } }
        )
        
        # Add runtime status
        session_json['is_active'] = active_session_ids.include?(session.session_id)
        
        # Add costs if available
        if session.session_path && File.exist?(session.session_path)
          monitor = SessionMonitorService.new(session.session_path)
          session_json['costs'] = monitor.calculate_costs rescue {}
          session_json['total_cost'] = session_json['costs'].values.sum rescue 0.0
        end
        
        session_json
      end
      
      render_success({
        sessions: sessions_data,
        total: Session.count,
        limit: limit,
        offset: offset
      })
    end
    
    # GET /api/sessions/discover
    # Discover sessions from file system without database records
    def discover
      # If directory_path is provided, find config files
      if params[:directory_path].present?
        config_files = find_config_files(params[:directory_path])
        render_success({
          config_files: config_files,
          directory_path: params[:directory_path]
        })
        return
      end
      
      # Otherwise, discover sessions
      # Use SessionDiscoveryService to find all sessions
      all_sessions = SessionDiscoveryService.list_all_sessions(limit: 100)
      
      # Get session IDs that are already in database
      known_ids = Session.pluck(:session_id)
      
      # Filter to only undiscovered sessions
      undiscovered_sessions = all_sessions.reject do |session|
        known_ids.include?(session[:session_id])
      end
      
      # Enrich with active status
      sessions_data = undiscovered_sessions.map do |session|
        monitor = SessionMonitorService.new(session[:session_path])
        
        session.merge({
          is_active: monitor.active?,
          metadata: session[:metadata] || {},
          swarm_name: session[:swarm_name],
          start_time: session[:start_time],
          session_path: session[:session_path]
        })
      end
      
      render_success({
        discovered_sessions: sessions_data,
        total_discovered: sessions_data.size
      })
    end
    
    # GET /api/sessions/browse_directory
    # Browse directory contents for directory picker
    def browse_directory
      path = params[:path] || ENV['HOME']
      path = File.expand_path(path)
      
      # Security: Don't allow access outside of home directory or common paths
      allowed_paths = [
        ENV['HOME'],
        '/Users',
        '/home',
        '/tmp',
        '/var/tmp'
      ]
      
      unless allowed_paths.any? { |allowed| path.start_with?(allowed) }
        render_error("Access denied to this directory", :forbidden)
        return
      end
      
      begin
        entries = []
        
        # Add parent directory unless we're at root
        unless path == '/'
          entries << {
            name: '..',
            path: File.dirname(path),
            type: 'directory',
            is_parent: true
          }
        end
        
        # List directory contents
        Dir.entries(path).sort.each do |entry|
          next if entry.start_with?('.')
          
          full_path = File.join(path, entry)
          next unless File.readable?(full_path)
          
          if File.directory?(full_path)
            entries << {
              name: entry,
              path: full_path,
              type: 'directory',
              is_parent: false
            }
          end
        end
        
        render_success({
          current_path: path,
          entries: entries,
          home_path: ENV['HOME']
        })
      rescue Errno::EACCES
        render_error("Permission denied", :forbidden)
      rescue Errno::ENOENT
        render_error("Directory not found", :not_found)
      rescue => e
        render_error("Error browsing directory: #{e.message}", :internal_server_error)
      end
    end
    
    private
    
    def session_params
      params.permit(:status, :limit, :offset)
    end
    
    def find_config_files(directory_path)
      config_files = []
      
      # Expand tilde and other shell expansions
      expanded_path = File.expand_path(directory_path) if directory_path.present?
      
      return config_files unless expanded_path && Dir.exist?(expanded_path)
      
      # Find all YAML files
      yaml_patterns = ['**/*.yml', '**/*.yaml']
      yaml_files = yaml_patterns.flat_map { |pattern| Dir.glob(File.join(expanded_path, pattern)) }
      
      yaml_files.each do |path|
        begin
          # Try to parse the YAML file
          content = File.read(path)
          config = YAML.safe_load(content)
          
          # Check if it's a valid swarm configuration
          if valid_swarm_config?(config)
            relative_path = path.sub(expanded_path + '/', '')
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
  end
end