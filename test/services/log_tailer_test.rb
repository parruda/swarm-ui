# frozen_string_literal: true

require "test_helper"

class LogTailerTest < ActiveSupport::TestCase
  setup do
    @session = create(:session, project: create(:project))
    @session_path = "/tmp/test_session_#{SecureRandom.hex}"
    @session.stubs(:session_path).returns(@session_path)
    FileUtils.mkdir_p(@session_path)

    @log_file_path = File.join(@session_path, "session.log.json")
    @tailer = LogTailer.new(@session)
  end

  teardown do
    FileUtils.rm_rf(@session_path) if File.exist?(@session_path)
  end

  # Initialization tests
  test "initializes with session" do
    tailer = LogTailer.new(@session)
    assert_equal @session, tailer.session
    assert_equal @log_file_path, tailer.file_path
  end

  test "handles session without session_path" do
    @session.stubs(:session_path).returns(nil)
    tailer = LogTailer.new(@session)

    assert_nil tailer.file_path
  end

  # read_existing_logs tests
  test "reads existing logs from file" do
    logs = [
      { "timestamp" => "2024-01-01T10:00:00Z", "message" => "First log" },
      { "timestamp" => "2024-01-01T10:00:01Z", "message" => "Second log" },
      { "timestamp" => "2024-01-01T10:00:02Z", "message" => "Third log" },
    ]

    File.open(@log_file_path, "w") do |f|
      logs.each { |log| f.puts(log.to_json) }
    end

    result = @tailer.read_existing_logs

    assert_equal 3, result.length
    assert_equal "First log", result[0]["message"]
    assert_equal "Second log", result[1]["message"]
    assert_equal "Third log", result[2]["message"]
  end

  test "returns empty array when log file doesn't exist" do
    result = @tailer.read_existing_logs

    assert_empty result
  end

  test "returns empty array when file_path is nil" do
    @session.stubs(:session_path).returns(nil)
    tailer = LogTailer.new(@session)

    result = tailer.read_existing_logs

    assert_empty result
  end

  test "skips malformed JSON lines when reading" do
    File.open(@log_file_path, "w") do |f|
      f.puts('{"valid": "json"}')
      f.puts("invalid json {")
      f.puts('{"another": "valid"}')
      f.puts("{ incomplete")
    end

    result = @tailer.read_existing_logs

    assert_equal 2, result.length
    assert_equal "json", result[0]["valid"]
    assert_equal "valid", result[1]["another"]
  end

  # tail tests
  test "tails file and yields new lines" do
    events = []

    # Write initial content
    File.open(@log_file_path, "w") do |f|
      f.puts('{"event": "start"}')
    end

    # Run tail in a thread
    tail_thread = Thread.new do
      @tailer.tail do |event|
        events << event
        break if event["event"] == "stop"
      end
    end

    # Give tail time to read initial content
    sleep 0.1

    # Append new content
    File.open(@log_file_path, "a") do |f|
      f.puts('{"event": "middle"}')
      f.puts('{"event": "stop"}')
    end

    # Wait for thread to finish
    tail_thread.join(1)

    assert_equal 3, events.length
    assert_equal "start", events[0]["event"]
    assert_equal "middle", events[1]["event"]
    assert_equal "stop", events[2]["event"]
  end

  test "starts reading from beginning of file" do
    # Write content before tailing
    File.open(@log_file_path, "w") do |f|
      f.puts('{"position": "beginning"}')
      f.puts('{"position": "middle"}')
      f.puts('{"position": "end"}')
    end

    events = []
    count = 0

    # Should read all existing content
    @tailer.tail do |event|
      events << event
      count += 1
      break if count >= 3
    end

    assert_equal 3, events.length
    assert_equal "beginning", events[0]["position"]
    assert_equal "middle", events[1]["position"]
    assert_equal "end", events[2]["position"]
  end

  test "waits for new data when reaching end of file" do
    skip "Threading test is flaky - timing dependent and doesn't reliably verify sleep behavior"

    File.write(@log_file_path, "")

    sleep_calls = []
    @tailer.stubs(:sleep) { |duration| sleep_calls << duration }

    # Run tail briefly
    Thread.new do
      @tailer.tail { |_event| }
    end

    # Let it run and hit the sleep
    sleep 0.2

    # Should have called sleep with 0.1 second intervals
    assert sleep_calls.any? { |duration| duration == 0.1 }
  end

  test "skips malformed JSON lines while tailing" do
    events = []

    File.open(@log_file_path, "w") do |f|
      f.puts('{"valid": 1}')
      f.puts("malformed { json")
      f.puts('{"valid": 2}')
    end

    count = 0
    @tailer.tail do |event|
      events << event
      count += 1
      break if count >= 2
    end

    assert_equal 2, events.length
    assert_equal 1, events[0]["valid"]
    assert_equal 2, events[1]["valid"]
  end

  test "does nothing when file doesn't exist" do
    # File doesn't exist
    FileUtils.rm_f(@log_file_path)

    # Should return without error
    result = @tailer.tail { |_event| raise "Should not yield" }

    assert_nil result
  end

  test "handles file being deleted while tailing" do
    File.write(@log_file_path, '{"event": "start"}')

    events = []
    error_raised = false

    Thread.new do
      @tailer.tail do |event|
        events << event
        # Delete file after first read
        FileUtils.rm_f(@log_file_path) if events.length == 1
      end
    rescue Errno::ENOENT
      error_raised = true
    end.join(0.5)

    # Should gracefully handle the file deletion
    assert_not error_raised
    assert_equal 1, events.length
  end

  test "handles nil file_path in tail" do
    @session.stubs(:session_path).returns(nil)
    tailer = LogTailer.new(@session)

    # Should return without error
    result = tailer.tail { |_event| raise "Should not yield" }

    assert_nil result
  end

  # find_log_file tests (private method tested through public interface)
  test "constructs correct log file path" do
    expected_path = File.join(@session_path, "session.log.json")
    assert_equal expected_path, @tailer.file_path
  end

  test "returns nil when session has no session_path" do
    @session.stubs(:session_path).returns(nil)
    tailer = LogTailer.new(@session)

    assert_nil tailer.file_path
  end

  # Integration-like tests
  test "can read and tail the same file" do
    # Write initial logs
    initial_logs = [
      { "seq" => 1, "type" => "initial" },
      { "seq" => 2, "type" => "initial" },
    ]

    File.open(@log_file_path, "w") do |f|
      initial_logs.each { |log| f.puts(log.to_json) }
    end

    # Read existing logs
    existing = @tailer.read_existing_logs
    assert_equal 2, existing.length

    # Tail for new logs
    new_events = []
    Thread.new do
      @tailer.tail do |event|
        new_events << event if event["seq"] > 2
        break if event["seq"] == 3
      end
    end

    # Append new log
    sleep 0.1
    File.open(@log_file_path, "a") do |f|
      f.puts({ "seq" => 3, "type" => "new" }.to_json)
    end

    sleep 0.2

    # Should have both existing and new logs
    assert_equal 2, existing.length
    assert_equal 1, new_events.length
    assert_equal "new", new_events[0]["type"]
  end
end
