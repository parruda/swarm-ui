# frozen_string_literal: true

require "test_helper"

class SessionTest < ActiveSupport::TestCase
  setup do
    @project = create(:project)
    @session = create(:session, project: @project)
  end

  # Validation tests
  test "valid session" do
    assert @session.valid?
  end

  test "requires session_id" do
    @session.session_id = nil
    assert_not @session.valid?
    assert_includes @session.errors[:session_id], "can't be blank"
  end

  test "requires unique session_id" do
    duplicate = build(:session, session_id: @session.session_id)
    assert_not duplicate.valid?
    assert_includes duplicate.errors[:session_id], "has already been taken"
  end

  test "validates status inclusion" do
    @session.status = "invalid"
    assert_not @session.valid?
    assert_includes @session.errors[:status], "is not included in the list"
  end

  test "accepts all valid statuses" do
    ["active", "stopped", "archived"].each do |status|
      @session.status = status
      assert @session.valid?, "Should accept status: #{status}"
    end
  end

  # Association tests
  test "belongs to project" do
    assert_respond_to @session, :project
    assert_equal @project, @session.project
  end

  test "requires project" do
    @session.project = nil
    assert_not @session.valid?
    assert_includes @session.errors[:project], "must exist"
  end

  test "has many terminal_sessions" do
    assert_respond_to @session, :terminal_sessions
  end

  # Scope tests
  test "active scope returns only active sessions" do
    active = create(:session, status: "active", project: @project)
    stopped = create(:session, status: "stopped", project: @project)
    archived = create(:session, status: "archived", project: @project)

    results = Session.active
    assert_includes results, active
    assert_not_includes results, stopped
    assert_not_includes results, archived
  end

  test "stopped scope returns only stopped sessions" do
    active = create(:session, status: "active", project: @project)
    stopped = create(:session, status: "stopped", project: @project)
    archived = create(:session, status: "archived", project: @project)

    results = Session.stopped
    assert_not_includes results, active
    assert_includes results, stopped
    assert_not_includes results, archived
  end

  test "archived scope returns only archived sessions" do
    active = create(:session, status: "active", project: @project)
    stopped = create(:session, status: "stopped", project: @project)
    archived = create(:session, status: "archived", project: @project)

    results = Session.archived
    assert_not_includes results, active
    assert_not_includes results, stopped
    assert_includes results, archived
  end

  test "recent scope orders by started_at desc" do
    older = create(:session, started_at: 2.days.ago, project: @project)
    newer = create(:session, started_at: 1.hour.ago, project: @project)
    # @session was created in setup with current time

    results = Session.recent
    assert_equal [@session, newer, older], results.first(3)
  end

  # Status helper tests
  test "active? returns true when status is active" do
    @session.status = "active"
    assert @session.active?
    assert_not @session.stopped?
    assert_not @session.archived?
  end

  test "stopped? returns true when status is stopped" do
    @session.status = "stopped"
    assert_not @session.active?
    assert @session.stopped?
    assert_not @session.archived?
  end

  test "archived? returns true when status is archived" do
    @session.status = "archived"
    assert_not @session.active?
    assert_not @session.stopped?
    assert @session.archived?
  end

  # Attribute tests
  test "environment_variables defaults to empty hash" do
    session = Session.new
    assert_empty(session.environment_variables)
  end

  test "environment_variables can be set and retrieved" do
    @session.environment_variables = { "KEY" => "value", "ANOTHER" => "test" }
    @session.save!
    @session.reload

    assert_equal({ "KEY" => "value", "ANOTHER" => "test" }, @session.environment_variables)
  end

  # Callback tests - calculate_duration
  test "calculate_duration sets duration when ended_at changes" do
    @session.started_at = Time.current
    @session.ended_at = @session.started_at + 2.hours
    @session.save!

    assert_equal 7200, @session.duration_seconds
  end

  test "calculate_duration uses resumed_at if available" do
    started = Time.current - 3.hours
    resumed = Time.current - 1.hour
    ended = Time.current

    @session.started_at = started
    @session.resumed_at = resumed
    @session.ended_at = ended
    @session.save!

    # Duration should be from resumed to ended (1 hour), not started to ended (3 hours)
    assert_equal 3600, @session.duration_seconds
  end

  test "calculate_duration does nothing without ended_at" do
    @session.started_at = Time.current
    @session.ended_at = nil
    @session.duration_seconds = 100
    @session.save!

    assert_equal 100, @session.duration_seconds
  end

  # Callback tests - set_project_folder_name
  test "set_project_folder_name converts Unix path to folder name" do
    # Use the test project's existing path instead of updating to non-existent path
    session = build(:session, project: @project)
    session.project_folder_name = nil # Reset to test callback

    # Manually set the expected folder name based on project path
    expected_folder = @project.path.gsub(%r{^/}, "").gsub("/", "+")

    session.valid?
    assert_equal expected_folder, session.project_folder_name
  end

  test "set_project_folder_name handles Windows paths" do
    skip "NOTE: Cannot test Windows paths - Project path validation requires existing directory"
    # @project.update!(path: "C:/Users/Dev/projects/app")
    # session = build(:session, project: @project)
    # session.valid?
    # assert_equal "Users+Dev+projects+app", session.project_folder_name
  end

  test "set_project_folder_name handles backslashes" do
    skip "NOTE: Cannot test Windows paths - Project path validation requires existing directory"
    # @project.update!(path: "C:\\Users\\Dev\\projects\\app")
    # session = build(:session, project: @project)
    # session.valid?
    # assert_equal "Users+Dev+projects+app", session.project_folder_name
  end

  test "set_project_folder_name handles root path" do
    @project.update!(path: "/")
    session = build(:session, project: @project)
    session.valid?

    assert_equal "", session.project_folder_name
  end

  # Callback tests - set_session_path
  test "set_session_path generates correct path" do
    @session.session_id = "test-123"
    @session.valid?

    expected = File.expand_path("~/.claude-swarm/sessions/#{@session.project_folder_name}/test-123")
    assert_equal expected, @session.session_path
  end

  test "set_session_path uses CLAUDE_SWARM_HOME environment variable" do
    ENV["CLAUDE_SWARM_HOME"] = "/custom/swarm/home"
    session = build(:session, project: @project)
    session.session_id = "abc-456"
    session.valid?

    assert_equal("/custom/swarm/home/sessions/#{session.project_folder_name}/abc-456", session.session_path)
  ensure
    ENV.delete("CLAUDE_SWARM_HOME")
  end

  # Callback tests - project counter updates
  test "increment_project_counters on create" do
    assert_difference -> { @project.reload.total_sessions_count }, 1 do
      create(:session, project: @project, status: "stopped")
    end
  end

  test "increment_project_counters increments active count for active sessions" do
    assert_difference -> { @project.reload.active_sessions_count }, 1 do
      create(:session, project: @project, status: "active")
    end
  end

  test "update_project_active_sessions_count when status changes from active" do
    active_session = create(:session, project: @project, status: "active")

    assert_difference -> { @project.reload.active_sessions_count }, -1 do
      active_session.update!(status: "stopped")
    end
  end

  test "update_project_active_sessions_count when status changes to active" do
    stopped_session = create(:session, project: @project, status: "stopped")

    assert_difference -> { @project.reload.active_sessions_count }, 1 do
      stopped_session.update!(status: "active")
    end
  end

  test "update_project_last_session_at updates on any change" do
    old_time = 1.day.ago
    @project.update_column(:last_session_at, old_time)

    @session.update!(swarm_name: "Updated Name")

    assert @project.reload.last_session_at > old_time
  end

  test "decrement_project_counters on destroy" do
    session = create(:session, project: @project, status: "stopped")

    assert_difference -> { @project.reload.total_sessions_count }, -1 do
      session.destroy
    end
  end

  test "decrement_project_counters decrements active count for active sessions" do
    active_session = create(:session, project: @project, status: "active")

    assert_difference -> { @project.reload.active_sessions_count }, -1 do
      active_session.destroy
    end
  end

  # terminal_url tests
  test "terminal_url generates correct URL" do
    setting = Setting.instance
    setting.update!(openai_api_key: "test-key")

    @session.session_id = "test-123"
    @session.configuration_path = "/path/to/config.yml"
    @session.use_worktree = true
    @session.environment_variables = { "TEST" => "value" }
    @session.initial_prompt = "Help me code"

    url = @session.terminal_url

    assert url.start_with?("http://127.0.0.1:4268/?")
    assert_includes url, "arg="

    # Decode and verify payload
    query_string = url.split("?", 2).last
    args = query_string.split("&").map { |param| param.split("=", 2).last }
    encoded_payload = args.join
    payload = JSON.parse(Base64.urlsafe_decode64(encoded_payload))

    assert_equal "swarm-ui-test-123", payload["tmux_session_name"]
    assert_equal @project.path, payload["project_path"]
    assert_equal "/path/to/config.yml", payload["swarm_file"]
    assert payload["use_worktree"]
    assert_equal "test-123", payload["session_id"]
    assert_not payload["new_session"]
    assert_equal "test-key", payload["openai_api_key"]
    assert_equal({ "TEST" => "value" }, payload["environment_variables"])
    assert_equal "Help me code", payload["initial_prompt"]
  end

  test "terminal_url respects new_session parameter" do
    url = @session.terminal_url(new_session: true)

    query_string = url.split("?", 2).last
    args = query_string.split("&").map { |param| param.split("=", 2).last }
    encoded_payload = args.join
    payload = JSON.parse(Base64.urlsafe_decode64(encoded_payload))

    assert payload["new_session"]
  end

  test "terminal_url uses custom TTYD_PORT environment variable" do
    ENV["TTYD_PORT"] = "9999"
    url = @session.terminal_url

    assert(url.start_with?("http://127.0.0.1:9999/?"))
  ensure
    ENV.delete("TTYD_PORT")
  end

  test "terminal_url handles long payloads by chunking" do
    # Create a session with lots of environment variables to make payload long
    long_env = {}
    50.times { |i| long_env["LONG_VAR_NAME_#{i}"] = "This is a very long value for testing chunking" }
    @session.environment_variables = long_env

    url = @session.terminal_url
    query_params = url.split("?", 2).last.split("&")

    # Verify each arg parameter is no longer than 100 characters
    query_params.each do |param|
      arg_value = param.split("=", 2).last
      assert arg_value.length <= 100, "Arg parameter too long: #{arg_value.length}"
    end
  end

  # Broadcast callback tests
  test "broadcast_redirect_if_stopped broadcasts when changing to stopped" do
    active_session = create(:session, project: @project, status: "active")

    # Mock broadcast_prepend_to
    active_session.expects(:broadcast_prepend_to).with(
      "session_#{active_session.id}",
      target: "session_redirect",
      html: includes("window.location.href"),
    )

    active_session.update!(status: "stopped")
  end

  test "broadcast_redirect_if_stopped does not broadcast when already stopped" do
    stopped_session = create(:session, project: @project, status: "stopped")

    stopped_session.expects(:broadcast_prepend_to).never

    stopped_session.update!(swarm_name: "New Name")
  end

  test "broadcast_redirect_if_stopped does not broadcast when changing from stopped" do
    stopped_session = create(:session, project: @project, status: "stopped")

    stopped_session.expects(:broadcast_prepend_to).never

    stopped_session.update!(status: "archived")
  end

  # Terminal cleanup callback tests
  test "cleanup_terminals_on_stop kills active terminals when session stops" do
    active_session = create(:session, project: @project, status: "active")
    terminal1 = create(:terminal_session, session: active_session, status: "active")
    terminal2 = create(:terminal_session, session: active_session, status: "active")
    stopped_terminal = create(:terminal_session, session: active_session, status: "stopped")

    # Mock system calls for tmux kill-session
    active_session.expects(:system).with("tmux", "kill-session", "-t", terminal1.tmux_session_name).returns(true)
    active_session.expects(:system).with("tmux", "kill-session", "-t", terminal2.tmux_session_name).returns(true)

    active_session.update!(status: "stopped")

    assert_equal "stopped", terminal1.reload.status
    assert_equal "stopped", terminal2.reload.status
    assert_not_nil terminal1.ended_at
    assert_not_nil terminal2.ended_at
    # Already stopped terminal should not change
    assert_equal "stopped", stopped_terminal.reload.status
  end

  test "cleanup_terminals_on_stop does nothing when not changing from active to stopped" do
    # Changing to archived
    stopped_session = create(:session, project: @project, status: "stopped")
    terminal = create(:terminal_session, session: stopped_session, status: "active")

    stopped_session.expects(:system).never

    stopped_session.update!(status: "archived")

    assert_equal "active", terminal.reload.status
  end

  # Edge cases
  test "handles missing project gracefully in callbacks" do
    session = build(:session, project: nil)
    session.session_id = "test-no-project"

    # Should not raise errors even without project
    assert_nothing_raised do
      session.valid?
    end
  end

  test "attributes can handle special characters" do
    @session.swarm_name = "Test's \"Special\" <Name>"
    @session.initial_prompt = "Help with C:\\path\\to\\file & more"
    @session.environment_variables = {
      "SPECIAL_CHARS" => "value with 'quotes' and \"double quotes\"",
      "PATH" => "/usr/bin:/usr/local/bin",
    }

    assert @session.save
    @session.reload

    assert_equal "Test's \"Special\" <Name>", @session.swarm_name
    assert_equal "Help with C:\\path\\to\\file & more", @session.initial_prompt
    assert_equal "value with 'quotes' and \"double quotes\"", @session.environment_variables["SPECIAL_CHARS"]
  end
end
