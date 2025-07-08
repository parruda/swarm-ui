# frozen_string_literal: true

class ThemeController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:update]

  def update
    theme = params[:theme]
    
    if %w[light dark].include?(theme)
      cookies.permanent[:theme] = theme
      render json: { status: "ok", theme: theme }
    else
      render json: { error: "Invalid theme" }, status: :unprocessable_entity
    end
  end
end