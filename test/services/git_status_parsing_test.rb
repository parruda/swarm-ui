# frozen_string_literal: true

require "test_helper"

class GitStatusParsingTest < ActiveSupport::TestCase
  setup do
    @project = create(:project, path: "/tmp/test-project")
    @session = create(:session, project: @project, status: "active")
    @service = OptimizedGitStatusService.new(@session)
  end

  test "correctly parses modified but not staged files" do
    # Mock git status output with modified files (not staged)
    mock_output = <<~OUTPUT
      BRANCH:
      main
      STATUS:
       M file1.rb
       M file2.rb
      ?? new_file.rb
      AHEAD_BEHIND:
      0\t0
      WORKTREE:
      false
    OUTPUT

    Open3.stubs(:capture3).returns([mock_output, "", stub(success?: true)])
    Dir.stubs(:exist?).returns(true)
    File.stubs(:directory?).returns(true)

    @service.stubs(:instance_directories).returns({
      "instance1" => ["/tmp/test-project"],
    })

    statuses = @service.fetch_all_statuses
    status = statuses["instance1"].first

    assert_equal 0, status[:staged], "Should have 0 staged files"
    assert_equal 2, status[:modified], "Should have 2 modified files"
    assert_equal 1, status[:untracked], "Should have 1 untracked file"
  end

  test "correctly parses staged files" do
    # Mock git status output with staged files
    mock_output = <<~OUTPUT
      BRANCH:
      main
      STATUS:
      M  file1.rb
      A  file2.rb
      D  file3.rb
      AHEAD_BEHIND:
      0\t0
      WORKTREE:
      false
    OUTPUT

    Open3.stubs(:capture3).returns([mock_output, "", stub(success?: true)])
    Dir.stubs(:exist?).returns(true)
    File.stubs(:directory?).returns(true)

    @service.stubs(:instance_directories).returns({
      "instance1" => ["/tmp/test-project"],
    })

    statuses = @service.fetch_all_statuses
    status = statuses["instance1"].first

    assert_equal 3, status[:staged], "Should have 3 staged files"
    assert_equal 0, status[:modified], "Should have 0 modified files"
    assert_equal 0, status[:untracked], "Should have 0 untracked files"
  end

  test "correctly parses mixed staged and modified files" do
    # Mock git status output with various states
    mock_output = <<~OUTPUT
      BRANCH:
      main
      STATUS:
      MM file1.rb
      M  file2.rb
       M file3.rb
      A  file4.rb
      ?? file5.rb
      AHEAD_BEHIND:
      0\t0
      WORKTREE:
      false
    OUTPUT

    Open3.stubs(:capture3).returns([mock_output, "", stub(success?: true)])
    Dir.stubs(:exist?).returns(true)
    File.stubs(:directory?).returns(true)

    @service.stubs(:instance_directories).returns({
      "instance1" => ["/tmp/test-project"],
    })

    statuses = @service.fetch_all_statuses
    status = statuses["instance1"].first

    # Based on git documentation:
    # MM = Modified in index, then modified in working tree (counts in both)
    # M  = Modified in index only (staged)
    #  M = Modified in working tree only (not staged)
    # A  = Added to index (staged)
    # ?? = Untracked
    
    # Staged: MM (first M), M  (first M), A  (first A) = 3 files
    assert_equal 3, status[:staged], "Should have 3 staged files"
    
    # Modified in working tree: MM (second M),  M (second M) = 2 files  
    assert_equal 2, status[:modified], "Should have 2 modified files in working tree"
    
    # Untracked: ?? = 1 file
    assert_equal 1, status[:untracked], "Should have 1 untracked file"
  end
end
