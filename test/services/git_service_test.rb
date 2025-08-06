# frozen_string_literal: true

require "test_helper"

class GitServiceTest < ActiveSupport::TestCase
  setup do
    @git_project_path = Rails.root.join("tmp", "test_git_repo_#{SecureRandom.hex(8)}")
    FileUtils.mkdir_p(@git_project_path)

    # Initialize a git repository
    Dir.chdir(@git_project_path) do
      system("git init", out: File::NULL, err: File::NULL)
      system("git config user.email 'test@example.com'", out: File::NULL, err: File::NULL)
      system("git config user.name 'Test User'", out: File::NULL, err: File::NULL)
      File.write("README.md", "# Test Project")
      system("git add README.md", out: File::NULL, err: File::NULL)
      system("git commit -m 'Initial commit'", out: File::NULL, err: File::NULL)
    end

    @git_service = GitService.new(@git_project_path)

    @non_git_path = Rails.root.join("tmp", "test_non_git_#{SecureRandom.hex(8)}")
    FileUtils.mkdir_p(@non_git_path)
    @non_git_service = GitService.new(@non_git_path)
  end

  teardown do
    FileUtils.rm_rf(@git_project_path) if File.exist?(@git_project_path)
    FileUtils.rm_rf(@non_git_path) if File.exist?(@non_git_path)
  end

  test "detects git repository" do
    assert @git_service.git_repository?
    assert_not @non_git_service.git_repository?
  end

  test "returns current branch" do
    # Get the actual default branch name (could be main or master)
    default_branch = @git_service.current_branch
    assert_includes ["main", "master"], default_branch

    # Create and switch to a new branch
    Dir.chdir(@git_project_path) do
      system("git checkout -b feature-branch", out: File::NULL, err: File::NULL)
    end

    assert_equal "feature-branch", @git_service.current_branch
    assert_nil @non_git_service.current_branch
  end

  test "detects dirty status" do
    assert_not @git_service.dirty?

    # Make a change
    Dir.chdir(@git_project_path) do
      File.write("new_file.txt", "Some content")
    end

    assert @git_service.dirty?
    assert_not @non_git_service.dirty?
  end

  test "returns status summary" do
    summary = @git_service.status_summary
    assert_equal 0, summary[:modified]
    assert_equal 0, summary[:staged]
    assert_equal 0, summary[:untracked]
    assert_equal 0, summary[:total]

    # Add untracked file
    Dir.chdir(@git_project_path) do
      File.write("untracked.txt", "Content")
    end

    summary = @git_service.status_summary
    assert_equal 0, summary[:modified]
    assert_equal 0, summary[:staged]
    assert_equal 1, summary[:untracked]
    assert_equal 1, summary[:total]

    # Stage the file
    Dir.chdir(@git_project_path) do
      system("git add untracked.txt", out: File::NULL, err: File::NULL)
    end

    summary = @git_service.status_summary
    assert_equal 0, summary[:modified]
    assert_equal 1, summary[:staged]
    assert_equal 0, summary[:untracked]
    assert_equal 1, summary[:total]

    assert_empty(@non_git_service.status_summary)
  end

  test "returns last commit info" do
    commit = @git_service.last_commit
    assert_not_nil commit
    assert_match(/^[a-f0-9]{8}$/, commit[:hash])
    assert_equal "Initial commit", commit[:message]
    assert_equal "Test User", commit[:author]
    assert_match(/ago/, commit[:date])

    assert_nil @non_git_service.last_commit
  end

  test "handles repositories without remotes" do
    assert_nil @git_service.remote_url

    # The ahead_behind method should handle missing remotes gracefully
    ahead_behind = @git_service.ahead_behind
    assert_instance_of Hash, ahead_behind
  end

  test "sync operations fail gracefully for non-git repos" do
    result = @non_git_service.fetch
    assert_not result[:success]
    assert_equal "Not a git repository", result[:error]

    result = @non_git_service.pull
    assert_not result[:success]
    assert_equal "Not a git repository", result[:error]

    result = @non_git_service.sync_with_remote
    assert_not result[:success]
    assert_equal "Not a git repository", result[:error]
  end

  test "pull fails with uncommitted changes" do
    # Make a change
    Dir.chdir(@git_project_path) do
      File.write("dirty_file.txt", "Some content")
    end

    result = @git_service.pull
    assert_not result[:success]
    assert_match(/uncommitted changes/, result[:error])
  end
end
