# frozen_string_literal: true

module Api
  class TerminalSessionsController < ApplicationController
    skip_before_action :verify_authenticity_token

    def update_status
      new_status = params[:status]
      terminal = TerminalSession.find_by(terminal_id: params[:id])

      if terminal.nil?
        render(json: { error: "Terminal session not found" }, status: :not_found)
        return
      end

      unless ["active", "stopped"].include?(new_status)
        render(json: { error: "Invalid status. Must be 'active' or 'stopped'" }, status: :bad_request)
        return
      end

      terminal.status = new_status

      if new_status == "stopped"
        terminal.ended_at = Time.current
      end

      if terminal.save
        render(json: {
          message: "Terminal marked as #{new_status}",
          terminal: {
            id: terminal.terminal_id,
            status: terminal.status,
            opened_at: terminal.opened_at,
            ended_at: terminal.ended_at,
          },
        })
      else
        render(json: { error: terminal.errors.full_messages }, status: :unprocessable_entity)
      end
    end
  end
end
