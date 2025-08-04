# frozen_string_literal: true

class BuilderChannel < ApplicationCable::Channel
  def subscribed
    project = Project.find(params[:project_id])
    stream_from "project_#{project.id}_builder"
  end

  def unsubscribed
    # Any cleanup needed when channel is unsubscribed
    stop_all_streams
  end
end