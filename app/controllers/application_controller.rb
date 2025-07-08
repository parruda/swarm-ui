# frozen_string_literal: true

class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  before_action :set_theme_class

  helper_method :dark_mode?

  private

  def set_theme_class
    @theme_class = dark_mode? ? "dark" : ""
  end

  def dark_mode?
    # Check cookie first, then fall back to system preference detection via Accept header
    return cookies[:theme] == "dark" if cookies[:theme].present?

    # Check if the request indicates a preference for dark mode
    # This is a simplified check - in production you might want more sophisticated detection
    request.headers["Sec-CH-Prefers-Color-Scheme"] == "dark"
  end
end
