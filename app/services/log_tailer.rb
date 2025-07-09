# frozen_string_literal: true

class LogTailer
  attr_reader :file_path, :session

  def initialize(session)
    @session = session
    @file_path = find_log_file
  end

  def tail(&block)
    return unless file_path && File.exist?(file_path)

    File.open(file_path, "r") do |file|
      # Start from the beginning to get all existing logs
      file.seek(0)
      
      loop do
        line = file.gets
        if line
          begin
            event = JSON.parse(line)
            yield event
          rescue JSON::ParserError
            # Skip malformed lines
          end
        else
          # Wait for new data
          sleep 0.1
        end
      end
    end
  rescue Errno::ENOENT
    # File doesn't exist yet
  end

  def read_existing_logs
    return [] unless file_path && File.exist?(file_path)

    logs = []
    File.foreach(file_path) do |line|
      begin
        logs << JSON.parse(line)
      rescue JSON::ParserError
        # Skip malformed lines
      end
    end
    logs
  end

  private

  def find_log_file
    return nil unless session.session_path
    File.join(session.session_path, "session.log.json")
  end
end