# frozen_string_literal: true

# WebSocket channel for streaming output from non-interactive sessions
class OutputChannel < ApplicationCable::Channel
  def subscribed
    @session = Session.find_by!(session_id: params[:session_id])
    stream_from "output_#{@session.session_id}"

    # Start streaming output for non-interactive sessions
    if @session.mode == "non-interactive"
      OutputStreamingJob.perform_later(@session)
    end
  end
end