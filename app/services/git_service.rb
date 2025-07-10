# frozen_string_literal: true

require "open3"

class GitService
  attr_reader :project_path

  def initialize(project_path)
    @project_path = project_path
  end

  def git_repository?
    return false unless File.directory?(project_path)

    File.directory?(File.join(project_path, ".git"))
  end

  def current_branch
    return unless git_repository?

    run_git_command("rev-parse --abbrev-ref HEAD").strip
  rescue StandardError
    nil
  end

  def dirty?
    return false unless git_repository?

    !run_git_command("status --porcelain").strip.empty?
  rescue StandardError
    false
  end

  def status_summary
    return {} unless git_repository?

    output = run_git_command("status --porcelain")
    lines = output.strip.split("\n")

    modified = 0
    staged = 0
    untracked = 0

    lines.each do |line|
      status = line[0..1]
      if status.include?("?")
        untracked += 1
      elsif status.strip.empty?
        # Ignored
      elsif status[0] != " "
        staged += 1
      else
        modified += 1
      end
    end

    {
      modified: modified,
      staged: staged,
      untracked: untracked,
      total: lines.length,
    }
  rescue StandardError
    {}
  end

  def ahead_behind(base_branch = "main")
    return { ahead: 0, behind: 0, base_branch: base_branch } unless git_repository?

    # First check if base branch exists
    branches = run_git_command("branch -a").strip
    unless branches.include?(base_branch) || branches.include?("remotes/origin/#{base_branch}")
      base_branch = "master" if branches.include?("master") || branches.include?("remotes/origin/master")
    end

    # Check if remote exists
    remotes = run_git_command("remote").strip
    return { ahead: 0, behind: 0, base_branch: base_branch } if remotes.empty?

    # Get ahead/behind counts
    output = run_git_command("rev-list --left-right --count HEAD...origin/#{base_branch}").strip
    if output.empty?
      return { ahead: 0, behind: 0, base_branch: base_branch }
    end

    ahead, behind = output.split("\t").map(&:to_i)

    {
      ahead: ahead || 0,
      behind: behind || 0,
      base_branch: base_branch,
    }
  rescue StandardError
    { ahead: 0, behind: 0, base_branch: base_branch }
  end

  def last_commit
    return unless git_repository?

    hash = run_git_command("rev-parse HEAD").strip[0..7]
    message = run_git_command("log -1 --pretty=%s").strip
    author = run_git_command("log -1 --pretty=%an").strip
    date = run_git_command("log -1 --pretty=%ar").strip

    {
      hash: hash,
      message: message,
      author: author,
      date: date,
    }
  rescue StandardError
    nil
  end

  def remote_url
    return unless git_repository?

    url = run_git_command("config --get remote.origin.url").strip
    url.empty? ? nil : url
  rescue StandardError
    nil
  end

  def fetch
    return { success: false, error: "Not a git repository" } unless git_repository?

    output, error, status = run_git_command_with_output("fetch")

    {
      success: status.success?,
      output: output,
      error: error,
    }
  end

  def pull
    return { success: false, error: "Not a git repository" } unless git_repository?

    # Check if there are uncommitted changes
    if dirty?
      return {
        success: false,
        error: "Cannot pull: You have uncommitted changes. Please commit or stash them first.",
      }
    end

    output, error, status = run_git_command_with_output("pull")

    {
      success: status.success?,
      output: output,
      error: error,
    }
  end

  def sync_with_remote
    return { success: false, error: "Not a git repository" } unless git_repository?

    # First fetch
    fetch_result = fetch
    return fetch_result unless fetch_result[:success]

    # Then pull if no uncommitted changes
    pull_result = pull

    {
      success: pull_result[:success],
      fetch_output: fetch_result[:output],
      pull_output: pull_result[:output],
      error: pull_result[:error],
    }
  end

  private

  def run_git_command(command)
    Dir.chdir(project_path) do
      %x(git #{command} 2>/dev/null)
    end
  end

  def run_git_command_with_output(command)
    Dir.chdir(project_path) do
      Open3.capture3("git", *command.split)
    end
  end
end
