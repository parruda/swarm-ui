# frozen_string_literal: true

Rails.application.configure do
  # Configure allowed request origins for ActionCable
  # In development, allow localhost connections
  config.action_cable.allowed_request_origins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://0.0.0.0:3000',
    /http:\/\/localhost:.*/,  # Allow any localhost port
    /http:\/\/127\.0\.0\.1:.*/,  # Allow any 127.0.0.1 port
  ]
  
  # Mount ActionCable in the main server process
  config.action_cable.mount_path = '/cable'
  
  # Configure WebSocket URL (useful for production with separate cable server)
  # config.action_cable.url = 'wss://example.com/cable'
  
  # Disable request forgery protection for WebSocket connections
  # This is handled by allowed_request_origins instead
  config.action_cable.disable_request_forgery_protection = true
  
  # Configure the cable log level
  config.action_cable.logger = Logger.new(STDOUT) if Rails.env.development?
  
  # Connection pool size (for Redis/PostgreSQL adapters)
  # This should be at least as large as your expected concurrent connections
  config.action_cable.worker_pool_size = 4
end