class LogStreamingJob < ApplicationJob
  def perform(session)
    reader = SessionLogReader.new(session.session_path)
    
    reader.tail_logs do |event|
      SessionChannel.broadcast_to(session, {
        type: 'log_event',
        event: event
      })
    end
  rescue => e
    Rails.logger.error "LogStreamingJob error: #{e.message}"
  end
end