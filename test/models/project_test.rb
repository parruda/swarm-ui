# frozen_string_literal: true

require "test_helper"

class ProjectTest < ActiveSupport::TestCase
  setup do
    # Create a temporary directory for tests
    @test_dir = "/tmp/test_projects_#{Process.pid}"
    FileUtils.mkdir_p(@test_dir)
  end

  teardown do
    # Clean up test directories
    FileUtils.rm_rf(@test_dir) if File.exist?(@test_dir)
  end

  # Validation tests
  test "valid project" do
    project = build(:project)
    assert project.valid?
  end

  test "requires name" do
    project = build(:project, name: nil)
    assert_not project.valid?
    assert_includes project.errors[:name], "can't be blank"
  end

  test "requires path" do
    project = build(:project, path: nil)
    assert_not project.valid?
    assert_includes project.errors[:path], "can't be blank"
  end

  test "requires unique path" do
    existing_project = create(:project)
    new_project = build(:project, path: existing_project.path)
    assert_not new_project.valid?
    assert_includes new_project.errors[:path], "has already been taken"
  end

  test "validates vcs_type inclusion" do
    # Create a project with a valid path first
    project = create(:project)
    # Then try to update with invalid vcs_type
    project.vcs_type = "svn"
    assert_not project.valid?
    assert_includes project.errors[:vcs_type], "is not included in the list"
  end

  test "allows nil vcs_type" do
    project = build(:project)
    project.vcs_type = nil
    # It will be auto-detected on validation
    assert project.valid?
  end

  test "allows valid vcs_types" do
    ["git", "none"].each do |vcs_type|
      project = build(:project, vcs_type: vcs_type)
      assert project.valid?, "Should allow vcs_type: #{vcs_type}"
    end
  end

  test "validates path must exist" do
    nonexistent_path = File.join(@test_dir, "nonexistent_#{SecureRandom.hex}")
    # Skip the factory after_build callback by creating without build
    project = Project.new(name: "Test", path: nonexistent_path)
    assert_not project.valid?
    assert_includes project.errors[:path], "must be a valid directory"
  end

  test "encrypts environment_variables" do
    skip "Skipping encryption test - encryption keys need to be configured"
    # TODO: Enable this test once encryption is properly configured
    # project = create(:project, :with_environment_variables)
    # assert project.environment_variables.present?
    # assert_equal "test-key-123", project.environment_variables["CLAUDE_API_KEY"]
    # assert_equal "development", project.environment_variables["PROJECT_ENV"]
  end

  # Scope tests
  test "active scope" do
    active_project = create(:project)
    archived_project = create(:project, :archived)

    active_projects = Project.active
    assert_includes active_projects, active_project
    assert_not_includes active_projects, archived_project
  end

  test "archived scope" do
    active_project = create(:project)
    archived_project = create(:project, :archived)

    archived_projects = Project.archived
    assert_includes archived_projects, archived_project
    assert_not_includes archived_projects, active_project
  end

  test "with_git scope" do
    git_project = create(:project, vcs_type: "git")
    non_git_project = create(:project, :non_git)

    git_projects = Project.with_git
    assert_includes git_projects, git_project
    assert_not_includes git_projects, non_git_project
  end

  test "ordered scope" do
    project_b = create(:project, name: "B Project")
    project_a = create(:project, name: "A Project")
    project_c = create(:project, name: "C Project")

    ordered = Project.ordered
    assert_equal [project_a, project_b, project_c], ordered.to_a
  end

  test "recent scope" do
    old_project = create(:project, last_session_at: 3.days.ago)
    new_project = create(:project, last_session_at: 1.hour.ago)
    middle_project = create(:project, last_session_at: 1.day.ago)

    recent = Project.recent
    assert_equal [new_project, middle_project, old_project], recent.to_a
  end

  # Callback tests
  test "detects git vcs_type on create" do
    git_path = File.join(@test_dir, "git_project")
    FileUtils.mkdir_p(File.join(git_path, ".git"))

    project = Project.create!(name: "Git Project", path: git_path)
    assert_equal "git", project.vcs_type
  end

  test "detects none vcs_type on create" do
    non_git_path = File.join(@test_dir, "non_git_project")
    FileUtils.mkdir_p(non_git_path)

    project = Project.create!(name: "Non-Git Project", path: non_git_path)
    assert_equal "none", project.vcs_type
  end

  test "normalizes path before validation" do
    path = File.join(@test_dir, "project/../project")
    normalized_path = File.expand_path(path)
    FileUtils.mkdir_p(normalized_path)

    project = Project.create!(name: "Project", path: path)
    assert_equal normalized_path, project.path
  end

  # Class method tests
  test "find_by_path normalizes path" do
    project = create(:project)
    relative_path = project.path + "/../" + File.basename(project.path)

    found_project = Project.find_by_path(relative_path)
    assert_equal project, found_project
  end

  # Instance method tests
  test "git? returns true for git projects" do
    project = build(:project, vcs_type: "git")
    assert project.git?
  end

  test "git? returns false for non-git projects" do
    project = build(:project, vcs_type: "none")
    assert_not project.git?
  end

  test "active? returns true for non-archived projects" do
    project = build(:project, archived: false)
    assert project.active?
  end

  test "active? returns false for archived projects" do
    project = build(:project, archived: true)
    assert_not project.active?
  end

  test "archive! sets archived to true" do
    project = create(:project, archived: false)
    project.archive!
    assert project.archived?
  end

  test "unarchive! sets archived to false" do
    project = create(:project, archived: true)
    project.unarchive!
    assert_not project.archived?
  end

  test "to_s returns the project name" do
    project = build(:project, name: "My Project")
    assert_equal "My Project", project.to_s
  end

  # Default values tests
  test "default_use_worktree defaults to false" do
    project = Project.new
    refute project.default_use_worktree
  end

  test "archived defaults to false" do
    project = Project.new
    refute project.archived
  end

  test "total_sessions_count defaults to 0" do
    project = Project.new
    assert_equal 0, project.total_sessions_count
  end

  test "active_sessions_count defaults to 0" do
    project = Project.new
    assert_equal 0, project.active_sessions_count
  end

  test "preferred_models defaults to empty hash" do
    project = Project.new
    assert_empty(project.preferred_models)
  end

  # NOTE: Tests for has_active_sessions? and update_session_counts!
  # will be added after the Session model gets the project association
end
