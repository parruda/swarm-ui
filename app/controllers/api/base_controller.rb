module Api
  class BaseController < ApplicationController
    # Base controller for API endpoints
    # Returns JSON responses by default
    
    # Skip CSRF protection for API endpoints
    skip_before_action :verify_authenticity_token
    
    # Ensure JSON format
    before_action :set_default_format
    
    private
    
    def set_default_format
      request.format = :json
    end
    
    # Standard error response
    def render_error(message, status = :unprocessable_entity)
      render json: { error: message }, status: status
    end
    
    # Standard success response
    def render_success(data = {}, status = :ok)
      render json: data, status: status
    end
  end
end