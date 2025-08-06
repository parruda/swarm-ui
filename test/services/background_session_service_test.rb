# frozen_string_literal: true

require "test_helper"

class BackgroundSessionServiceTest < ActiveSupport::TestCase
  setup do
    @project = create(:project, github_repo_owner: "test", github_repo_name: "repo")
    @project.update!(default_config_path: "/path/to/config.yaml", default_use_worktree: false)
    @existing_session = create(
      :session,
      project: @project,
      github_issue_number: 123,
      status: "active",
      configuration_path: "/path/to/config.yaml",
    )
  end

  teardown do
    FileUtils.rm_rf(@project.path) if File.exist?(@project.path)
  end

  # find_or_create_session tests
  test "finds existing session for issue" do
    session = BackgroundSessionService.find_or_create_session(
      project: @project,
      issue_number: 123,
      initial_prompt: "Test prompt",
      start_background: false,
    )

    assert_equal @existing_session, session
  end

  test "finds existing session for PR" do
    pr_session = create(:session, project: @project, github_pr_number: 456, status: "active", configuration_path: "/path/to/config.yaml")

    session = BackgroundSessionService.find_or_create_session(
      project: @project,
      pr_number: 456,
      initial_prompt: "Test prompt",
      start_background: false,
    )

    assert_equal pr_session, session
  end

  test "creates new session when none exists" do
    assert_difference("Session.count") do
      session = BackgroundSessionService.find_or_create_session(
        project: @project,
        issue_number: 999,
        issue_type: "issue",
        initial_prompt: "New issue",
        user_login: "testuser",
        issue_title: "Fix bug",
        start_background: false,
      )

      assert_equal @project, session.project
      assert_equal 999, session.github_issue_number
      assert_equal "issue", session.github_issue_type
      assert_match(/Fix bug/, session.swarm_name)
      assert_match(/New issue/, session.initial_prompt)
    end
  end

  test "creates session with PR context" do
    session = BackgroundSessionService.find_or_create_session(
      project: @project,
      pr_number: 789,
      issue_type: "pull_request",
      initial_prompt: "Review PR",
      issue_title: "Add new feature",
      start_background: false,
    )

    assert_equal 789, session.github_pr_number
    assert_match(/PR #789/, session.swarm_name)
    assert_match(/Pull Request #789/, session.initial_prompt)
  end

  test "truncates long issue titles" do
    long_title = "This is a very long issue title that should be truncated to prevent overly long session names"

    session = BackgroundSessionService.find_or_create_session(
      project: @project,
      issue_number: 100,
      initial_prompt: "Test",
      issue_title: long_title,
      start_background: false,
    )

    # Title should be truncated to 50 chars + "..."
    assert_match(/This is a very long issue ti/, session.swarm_name)
  end

  test "includes GitHub repository context in prompt" do
    session = BackgroundSessionService.find_or_create_session(
      project: @project,
      issue_number: 100,
      initial_prompt: "Fix this",
      user_login: "octocat",
      start_background: false,
    )

    prompt = session.initial_prompt
    assert_match(/Issue #100/, prompt)
    assert_match(%r{Repository: test/repo}, prompt)
    assert_match(/@octocat/, prompt)
    assert_match(/Fix this/, prompt)
  end

  test "starts session in background when requested" do
    BackgroundSessionService.expects(:start_session_background).once

    BackgroundSessionService.find_or_create_session(
      project: @project,
      issue_number: 999,
      initial_prompt: "Test",
      start_background: true,
    )
  end

  test "creates non-GitHub session" do
    session = BackgroundSessionService.find_or_create_session(
      project: @project,
      initial_prompt: "General work",
      start_background: false,
    )

    assert_nil session.github_issue_number
    assert_nil session.github_pr_number
    assert_equal "General work", session.initial_prompt
    assert_match(/#{@project.name}.*\d{4}-\d{2}-\d{2}/, session.swarm_name)
  end

  # send_comment_to_session tests
  test "sends comment to active session" do
    Open3.expects(:capture3).with("tmux", "send-keys", "-t", "swarm-ui-#{@existing_session.session_id}", "-l", anything).returns(["", "", stub(success?: true)])
    Open3.expects(:capture3).with("tmux", "send-keys", "-t", "swarm-ui-#{@existing_session.session_id}", "Enter").returns(["", "", stub(success?: true)])

    result = BackgroundSessionService.send_comment_to_session(@existing_session, "Hello world", user_login: "testuser")

    assert result
  end

  test "formats comment with user info and timestamp" do
    # We'll use a sequence to ensure both calls happen in order
    call_sequence = sequence("tmux_calls")

    # First call sends the formatted text
    Open3.expects(:capture3).with(
      "tmux",
      "send-keys",
      "-t",
      anything,
      "-l",
      regexp_matches(/\n\[GitHub Comment from @testuser at \d{2}:\d{2}:\d{2}\]: Test comment\n/),
    ).in_sequence(call_sequence).returns(["", "", stub(success?: true)])

    # Second call sends Enter
    Open3.expects(:capture3).with(
      "tmux", "send-keys", "-t", anything, "Enter"
    ).in_sequence(call_sequence).returns(["", "", stub(success?: true)])

    result = BackgroundSessionService.send_comment_to_session(@existing_session, "Test comment", user_login: "testuser")

    assert result, "Expected comment to be sent successfully"
  end

  test "does not send comment to inactive session" do
    stopped_session = create(:session, project: @project, status: "stopped")
    Open3.expects(:capture3).never

    result = BackgroundSessionService.send_comment_to_session(stopped_session, "Test")

    assert_not result
  end

  test "handles tmux command failure" do
    Open3.expects(:capture3).returns(["", "tmux: session not found", stub(success?: false)])

    result = BackgroundSessionService.send_comment_to_session(@existing_session, "Test")

    assert_not result
  end

  test "handles exception when sending comment" do
    Open3.expects(:capture3).raises(StandardError, "Command failed")

    result = BackgroundSessionService.send_comment_to_session(@existing_session, "Test")

    assert_not result
  end


  # find_existing_github_session tests
  test "finds most recent active session for issue" do
    create(
      :session,
      project: @project,
      github_issue_number: 123,
      status: "active",
      created_at: 2.days.ago,
      configuration_path: "/path/to/config.yaml",
    )

    result = BackgroundSessionService.find_existing_github_session(@project, 123, nil, "/path/to/config.yaml")

    assert_equal @existing_session, result # Should return the newer one
  end

  test "does not find stopped sessions" do
    stopped_session = create(
      :session,
      project: @project,
      github_pr_number: 999,
      status: "stopped",
      created_at: 1.hour.ago,
    )

    result = BackgroundSessionService.find_existing_github_session(@project, nil, 999)

    assert_nil result
  end

  test "ignores archived sessions" do
    create(
      :session,
      project: @project,
      github_issue_number: 888,
      status: "archived",
    )

    result = BackgroundSessionService.find_existing_github_session(@project, 888, nil)

    assert_nil result
  end

  test "returns nil when no issue or pr number provided" do
    result = BackgroundSessionService.find_existing_github_session(@project, nil, nil)

    assert_nil result
  end

  test "finds session matching configuration path when provided" do
    # Create two sessions for the same issue but different swarms
    session_with_review = create(
      :session,
      project: @project,
      github_issue_number: 777,
      configuration_path: "swarms/review.yml",
      status: "active",
    )
    session_with_test = create(
      :session,
      project: @project,
      github_issue_number: 777,
      configuration_path: "swarms/test.yml",
      status: "active",
    )

    # Should find the review session when searching with review config
    result = BackgroundSessionService.find_existing_github_session(@project, 777, nil, "swarms/review.yml")
    assert_equal session_with_review, result

    # Should find the test session when searching with test config
    result = BackgroundSessionService.find_existing_github_session(@project, 777, nil, "swarms/test.yml")
    assert_equal session_with_test, result

    # Should return nil when searching with different config
    result = BackgroundSessionService.find_existing_github_session(@project, 777, nil, "swarms/other.yml")
    assert_nil result
  end

  test "creates separate sessions for same issue with different swarms" do
    # First session with default swarm
    session1 = BackgroundSessionService.find_or_create_session(
      project: @project,
      issue_number: 555,
      initial_prompt: "Review this",
      start_background: false,
      swarm_path: "swarms/review.yml",
    )
    
    # Second session with test swarm for same issue
    session2 = BackgroundSessionService.find_or_create_session(
      project: @project,
      issue_number: 555,
      initial_prompt: "Test this",
      start_background: false,
      swarm_path: "swarms/test.yml",
    )

    refute_equal session1, session2
    assert_equal "swarms/review.yml", session1.configuration_path
    assert_equal "swarms/test.yml", session2.configuration_path
    assert_equal 555, session1.github_issue_number
    assert_equal 555, session2.github_issue_number
  end

  test "creates new session when existing session is stopped" do
    # Create a stopped session
    stopped_session = create(
      :session,
      project: @project,
      github_issue_number: 666,
      configuration_path: "swarms/default.yml",
      status: "stopped",
    )

    # Try to find or create a session for the same issue
    new_session = BackgroundSessionService.find_or_create_session(
      project: @project,
      issue_number: 666,
      initial_prompt: "New request",
      start_background: false,
      swarm_path: "swarms/default.yml",
    )

    # Should create a new session, not reuse the stopped one
    refute_equal stopped_session, new_session
    assert_equal "active", new_session.status
    assert_equal 666, new_session.github_issue_number
    assert_equal "swarms/default.yml", new_session.configuration_path
  end

  # Private method tests (testing through public interface)
  test "generates appropriate session names" do
    # For PR
    pr_session = BackgroundSessionService.find_or_create_session(
      project: @project,
      pr_number: 42,
      issue_title: "Add feature",
      initial_prompt: "Test",
      start_background: false,
    )
    assert_equal "#{@project.name} - PR #42: Add feature", pr_session.swarm_name

    # For Issue
    issue_session = BackgroundSessionService.find_or_create_session(
      project: @project,
      issue_number: 24,
      issue_title: "Fix bug",
      initial_prompt: "Test",
      start_background: false,
    )
    assert_equal "#{@project.name} - Issue #24: Fix bug", issue_session.swarm_name

    # Without title
    no_title_session = BackgroundSessionService.find_or_create_session(
      project: @project,
      issue_number: 99,
      initial_prompt: "Test",
      start_background: false,
    )
    assert_equal "#{@project.name} - Issue #99", no_title_session.swarm_name
  end

  test "uses project defaults for session configuration" do
    @project.update!(
      environment_variables: { "API_KEY" => "secret" },
      default_use_worktree: true,
    )

    session = BackgroundSessionService.find_or_create_session(
      project: @project,
      issue_number: 555,
      initial_prompt: "Test",
      start_background: false,
    )

    assert_equal @project.default_config_path, session.configuration_path
    assert session.use_worktree
    assert_equal({ "API_KEY" => "secret" }, session.environment_variables)
  end

  test "start_session_background executes ttyd-bg" do
    session = create(:session, project: @project)
    session.expects(:terminal_url).returns("http://localhost/terminal?arg=abc&arg=def")

    # Expect system call to ttyd-bg
    BackgroundSessionService.expects(:system).with("bin/ttyd-bg", "abcdef").returns(true)
    BackgroundSessionService.expects(:sleep).with(0.5)

    # Call private method through send
    result = BackgroundSessionService.send(:start_session_background, session)

    assert result
  end

  test "start_session_background handles failures gracefully" do
    session = create(:session, project: @project)
    session.expects(:terminal_url).raises(StandardError, "Failed to generate URL")

    result = BackgroundSessionService.send(:start_session_background, session)

    assert_not result
  end
end
