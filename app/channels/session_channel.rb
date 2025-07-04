# frozen_string_literal: true

# WebSocket channel for streaming session log events
class SessionChannel < ApplicationCable::Channel
  def subscribed
    session = Session.find(params[:session_id])
    stream_for session

    # Start log tailing job
    LogStreamingJob.perform_later(session)
  end
end