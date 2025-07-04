class OutputStreamingJob < ApplicationJob
  def perform(session)
    return unless session.mode == 'non-interactive' && session.output_file
    
    File.open(session.output_file, 'r') do |file|
      file.seek(0, IO::SEEK_END)  # Start at end of file
      
      loop do
        line = file.gets
        if line
          ActionCable.server.broadcast("output_#{session.session_id}", {
            line: line
          })
        else
          sleep 0.1
          break unless session.reload.status == 'active'
        end
      end
    end
  end
end