# frozen_string_literal: true

# Service for parsing and analyzing claude-swarm JSONL log files
class LogParserService
  def initialize(log_file_path)
    @log_file = log_file_path
  end

  # Parse JSONL log file and extract specific event types
  def parse_events(event_types: nil)
    events = []
    return events unless File.exist?(@log_file)

    File.foreach(@log_file) do |line|
      entry = JSON.parse(line)
      event = entry["event"]

      next if event_types && !event_types.include?(event["type"])

      events << {
        timestamp: Time.parse(entry["timestamp"]),
        instance: entry["instance"],
        instance_id: entry["instance_id"],
        event: event
      }
    rescue StandardError => e
      Rails.logger.debug "Skipping malformed log line: #{e.message}"
    end

    events
  end

  # Extract tool usage statistics
  def tool_usage_stats
    stats = Hash.new { |h, k| h[k] = { count: 0, instances: Set.new } }

    parse_events(event_types: ["assistant"]).each do |entry|
      event = entry[:event]
      message = event["message"]
      next unless message && message["content"]

      # Look for tool uses in assistant messages
      message["content"].each do |content|
        if content["type"] == "tool_use"
          tool_name = content["name"]
          stats[tool_name][:count] += 1
          stats[tool_name][:instances] << entry[:instance]
        end
      end
    end

    stats.transform_values { |v| v.merge(instances: v[:instances].to_a) }
  end

  # Get timeline of events for visualization
  def event_timeline(start_time: nil, end_time: nil)
    events = parse_events

    # Filter by time range if provided
    events.select! { |e| e[:timestamp] >= start_time } if start_time
    events.select! { |e| e[:timestamp] <= end_time } if end_time

    events.sort_by { |e| e[:timestamp] }
  end
end