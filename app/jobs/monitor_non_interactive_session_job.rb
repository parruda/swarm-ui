class MonitorNonInteractiveSessionJob < ApplicationJob
  def perform(session_id)
    session = Session.find_by!(session_id: session_id)
    
    # Check if process is still running
    loop do
      if session.pid && Process.kill(0, session.pid)
        sleep 2  # Check every 2 seconds
      else
        # Process has ended
        session.update!(status: 'completed')
        ActionCable.server.broadcast("output_#{session.session_id}", {
          status: 'completed'
        })
        break
      end
    end
  rescue Errno::ESRCH
    # Process doesn't exist
    session.update!(status: 'completed')
  end
end