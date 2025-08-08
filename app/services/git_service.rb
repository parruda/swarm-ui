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

    results, _, _ = run_git_command(["rev-parse", "--abbrev-ref", "--short", "HEAD"])
    results.strip
  rescue StandardError
    nil
  end

  def dirty?
    return false unless git_repository?

    # This can be expensive; but I don't know a way to simplify without ignoring untracked files.
    # Seems like untracked files is an important part of being dirty.
    results, _, _ = run_git_command(["status", "--porcelain"])
    !results.strip.empty?
  rescue StandardError
    false
  end

  def status_summary
    return {} unless git_repository?

    output, _, _ = run_git_command(["status", "--porcelain"])
    lines = output.lines.map(&:strip)

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
    branches, _, _ = run_git_command(["branch", "-a"]).strip
    unless branches.include?(base_branch) || branches.include?("remotes/origin/#{base_branch}")
      base_branch = "master" if branches.include?("master") || branches.include?("remotes/origin/master")
    end

    # Check if remote exists
    remotes, _, _ = run_git_command(["remote"]).strip
    return { ahead: 0, behind: 0, base_branch: base_branch } if remotes.empty?

    # Get ahead/behind counts
    output, _, _ = run_git_command(["rev-list", "--left-right", "--count", "HEAD...origin/#{base_branch}"]).strip
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

    results, _, _ = run_git_command(["log", "-1", "--pretty=%H%n%an%n%ar%n%s"])

    hash, author, date, *message = results.lines.map(&:strip)

    {
      hash: hash.strip[0..7],
      message: message.join("\n"),
      author: author,
      date: date,
    }
  rescue StandardError
    nil
  end

  def remote_url
    return unless git_repository?

    url, _, _ = run_git_command(["config", "--get", "remote.origin.url"]).strip
    url.empty? ? nil : url
  rescue StandardError
    nil
  end

  def fetch
    return { success: false, error: "Not a git repository" } unless git_repository?

    # so there's a few options here to optimize this command for large repos
    # but you might have dependencies on some behaviors. `--no-tags` and `--depth=1`
    # are the most impactful options but might have an impact on *other* git operations in the
    # repository. Right now I do not suggest implementing those, but perhaps we can put them behind
    # a feature flag.
    output, error, status = run_git_command(["fetch"])

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

    # `--ff-only` and `--no-tags` are options but unsure what people's workflows might be.
    # For example, `pull -r` is a common command and using `--ff-only` would not match up to that.
    # Like `this.fetch`'s commends, I suggest we put some options behind a feature flag or configuration
    # instead of implementing them for everyone/repo.
    output, error, status = run_git_command(["pull"])

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

  def run_git_command(command_array)
    # Use Open3 with array form for safety
    Open3.capture3("git", *command_array, chdir: project_path)
  end
end
