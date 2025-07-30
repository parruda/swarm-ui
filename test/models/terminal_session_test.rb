# frozen_string_literal: true

require "test_helper"

class TerminalSessionTest < ActiveSupport::TestCase
  setup do
    @session = create(:session)
    @terminal = create(:terminal_session, session: @session)
  end

  # Validation tests
  test "valid terminal session" do
    assert @terminal.valid?
  end

  test "requires terminal_id" do
    @terminal.terminal_id = nil
    assert_not @terminal.valid?
    assert_includes @terminal.errors[:terminal_id], "can't be blank"
  end

  test "requires unique terminal_id" do
    duplicate = build(:terminal_session, terminal_id: @terminal.terminal_id)
    assert_not duplicate.valid?
    assert_includes duplicate.errors[:terminal_id], "has already been taken"
  end

  test "requires directory" do
    @terminal.directory = nil
    assert_not @terminal.valid?
    assert_includes @terminal.errors[:directory], "can't be blank"
  end

  test "requires instance_name" do
    @terminal.instance_name = nil
    assert_not @terminal.valid?
    assert_includes @terminal.errors[:instance_name], "can't be blank"
  end

  test "requires name" do
    @terminal.name = nil
    assert_not @terminal.valid?
    assert_includes @terminal.errors[:name], "can't be blank"
  end

  test "validates status inclusion" do
    @terminal.status = "invalid"
    assert_not @terminal.valid?
    assert_includes @terminal.errors[:status], "is not included in the list"
  end

  test "accepts valid statuses" do
    ["active", "stopped"].each do |status|
      @terminal.status = status
      assert @terminal.valid?, "Should accept status: #{status}"
    end
  end

  # Association tests
  test "belongs to session" do
    assert_respond_to @terminal, :session
    assert_equal @session, @terminal.session
  end

  test "requires session" do
    @terminal.session = nil
    assert_not @terminal.valid?
    assert_includes @terminal.errors[:session], "must exist"
  end

  # Scope tests
  test "active scope returns only active terminals" do
    active = create(:terminal_session, session: @session, status: "active")
    stopped = create(:terminal_session, session: @session, status: "stopped")

    results = TerminalSession.active
    assert_includes results, active
    assert_not_includes results, stopped
  end

  test "stopped scope returns only stopped terminals" do
    active = create(:terminal_session, session: @session, status: "active")
    stopped = create(:terminal_session, session: @session, status: "stopped")

    results = TerminalSession.stopped
    assert_not_includes results, active
    assert_includes results, stopped
  end

  test "ordered scope sorts by created_at" do
    older = create(:terminal_session, session: @session, created_at: 2.hours.ago)
    newer = create(:terminal_session, session: @session, created_at: 1.hour.ago)
    # @terminal was created more recently

    results = TerminalSession.ordered
    assert_equal [older, newer, @terminal], results.first(3)
  end

  # Status helper tests
  test "active? returns true when status is active" do
    @terminal.status = "active"
    assert @terminal.active?
    assert_not @terminal.stopped?
  end

  test "stopped? returns true when status is stopped" do
    @terminal.status = "stopped"
    assert_not @terminal.active?
    assert @terminal.stopped?
  end

  # Instance method tests
  test "tmux_session_name generates correct name" do
    @terminal.terminal_id = "term-123"
    @session.session_id = "session-456"

    assert_equal "swarm-ui-session-456-term-term-123", @terminal.tmux_session_name
  end

  test "terminal_url generates correct URL" do
    @terminal.terminal_id = "test-123"
    @terminal.directory = "/home/user/project"
    @session.session_id = "sess-456"

    url = @terminal.terminal_url

    assert url.start_with?("http://127.0.0.1:8999/?")
    assert_includes url, "arg="

    # Decode and verify payload
    query_string = url.split("?", 2).last
    args = query_string.split("&").map { |param| param.split("=", 2).last }
    encoded_payload = args.join
    payload = JSON.parse(Base64.urlsafe_decode64(encoded_payload))

    assert_equal "terminal", payload["mode"]
    assert_equal "test-123", payload["terminal_id"]
    assert_equal "swarm-ui-sess-456-term-test-123", payload["tmux_session_name"]
    assert_equal "/home/user/project", payload["working_directory"]
    assert_equal "sess-456", payload["session_id"]
  end

  test "terminal_url uses custom TTYD_PORT" do
    ENV["TTYD_PORT"] = "9999"
    url = @terminal.terminal_url

    assert(url.start_with?("http://127.0.0.1:9999/?"))
  ensure
    ENV.delete("TTYD_PORT")
  end

  test "terminal_url handles long payloads with chunking" do
    @terminal.directory = "/very/long/path" * 20

    url = @terminal.terminal_url
    query_params = url.split("?", 2).last.split("&")

    # Verify each arg parameter is no longer than 100 characters
    query_params.each do |param|
      arg_value = param.split("=", 2).last
      assert arg_value.length <= 100, "Arg parameter too long: #{arg_value.length}"
    end
  end

  # Callback tests
  test "set_opened_at sets timestamp on create" do
    terminal = build(:terminal_session, session: @session, opened_at: nil)
    terminal.save!

    assert_not_nil terminal.opened_at
    assert terminal.opened_at <= Time.current
  end

  test "set_opened_at doesn't override existing value" do
    specific_time = 1.hour.ago
    terminal = build(:terminal_session, session: @session, opened_at: specific_time)
    terminal.save!

    assert_equal specific_time.to_i, terminal.opened_at.to_i
  end

  test "set_opened_at only runs on create" do
    original_time = @terminal.opened_at
    @terminal.name = "Updated Name"
    @terminal.save!

    assert_equal original_time.to_i, @terminal.opened_at.to_i
  end

  # Broadcast callback tests
  test "broadcasts removal when changing to stopped" do
    active_terminal = create(:terminal_session, session: @session, status: "active")

    active_terminal.expects(:broadcast_remove_to).with(
      "session_#{active_terminal.session_id}_terminals",
      target: "terminal_tab_#{active_terminal.terminal_id}",
    )

    active_terminal.update!(status: "stopped")
  end

  test "doesn't broadcast when already stopped" do
    stopped_terminal = create(:terminal_session, :stopped, session: @session)

    stopped_terminal.expects(:broadcast_remove_to).never

    stopped_terminal.update!(name: "New Name")
  end

  test "doesn't broadcast when changing from stopped" do
    stopped_terminal = create(:terminal_session, :stopped, session: @session)

    stopped_terminal.expects(:broadcast_remove_to).never

    # This would be unusual but test it anyway
    stopped_terminal.update!(status: "active")
  end

  # Edge cases
  test "handles special characters in attributes" do
    @terminal.terminal_id = "term-with-special-123"
    @terminal.instance_name = "instance_name_with_underscores"
    @terminal.name = "Terminal with spaces & symbols!"
    @terminal.directory = "C:\\Windows\\Path with spaces\\project"

    assert @terminal.valid?
    assert @terminal.save

    # Verify tmux_session_name handles special chars
    assert_includes @terminal.tmux_session_name, "term-with-special-123"
  end

  test "handles very long directory paths" do
    @terminal.directory = "/very/deeply/nested" + "/subdir" * 50
    assert @terminal.valid?

    # Terminal URL should still work
    url = @terminal.terminal_url
    assert url.present?
  end

  test "handles unicode in name and directory" do
    @terminal.name = "Terminal 日本語"
    @terminal.directory = "/home/user/проект/src"

    assert @terminal.valid?
    assert @terminal.save
  end

  test "session cascade behavior" do
    # When session is destroyed, terminal_sessions should be destroyed too
    session = create(:session)
    terminal1 = create(:terminal_session, session: session)
    terminal2 = create(:terminal_session, session: session)

    assert_difference "TerminalSession.count", -2 do
      session.destroy
    end

    assert_not TerminalSession.exists?(terminal1.id)
    assert_not TerminalSession.exists?(terminal2.id)
  end
end
