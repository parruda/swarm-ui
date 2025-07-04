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
    
    private
    
    def session_params
      params.permit(:status, :limit, :offset)
    end
  end
end