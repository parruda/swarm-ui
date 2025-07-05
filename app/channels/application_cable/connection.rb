# frozen_string_literal: true

module ApplicationCable
  class Connection < ActionCable::Connection::Base
    # For now, accept all connections
    # In production, you might want to add authentication here
    
    identified_by :connection_id
    
    def connect
      # Generate a unique connection ID for this session
      self.connection_id = SecureRandom.uuid
      
      # Log the connection for debugging
      logger.add_tags 'ActionCable', connection_id
      logger.info "WebSocket connection established"
    end
    
    def disconnect
      logger.info "WebSocket connection closed"
    end
  end
end