# frozen_string_literal: true

# Service for reading and tailing claude-swarm session log files
class SessionLogReader
  def initialize(session_path)
    @session_path = session_path
    @log_file = File.join(@session_path, "session.log.json")
  end

  def read_logs
    return [] unless File.exist?(@log_file)

    File.readlines(@log_file).map do |line|
      JSON.parse(line)
    rescue JSON::ParserError
      nil
    end.compact
  end

  def tail_logs(&block)
    return unless block_given?
    return unless File.exist?(@log_file)

    File.open(@log_file, "r") do |file|
      file.seek(0, IO::SEEK_END)
      loop do
        line = file.gets
        if line
          event = JSON.parse(line)
          block.call(event)
        else
          sleep 0.1
        end
      rescue JSON::ParserError
        # Skip malformed lines
        next
      end
    end
  end
end