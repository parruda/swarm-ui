# frozen_string_literal: true

module Api
  class SessionsController < ApplicationController
    skip_before_action :verify_authenticity_token

    def mark_ended
      update_status("stopped")
    end

    def update_status(new_status = nil)
      new_status ||= params[:status]
      session = Session.find_by(session_id: params[:id])

      if session.nil?
        render(json: { error: "Session not found" }, status: :not_found)
        return
      end

      unless ["active", "stopped"].include?(new_status)
        render(json: { error: "Invalid status. Must be 'active' or 'stopped'" }, status: :bad_request)
        return
      end

      session.status = new_status

      if new_status == "active"
        # If session was previously stopped, we're resuming
        if session.ended_at.present?
          session.resumed_at = Time.current
        else
          # First time starting
          session.started_at ||= Time.current
        end
        session.ended_at = nil
      elsif new_status == "stopped"
        session.ended_at = Time.current
      end

      if session.save
        render(json: {
          message: "Session marked as #{new_status}",
          session: {
            id: session.session_id,
            status: session.status,
            started_at: session.started_at,
            ended_at: session.ended_at,
          },
        })
      else
        render(json: { error: session.errors.full_messages }, status: :unprocessable_entity)
      end
    end
  end
end
