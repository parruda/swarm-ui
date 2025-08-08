# frozen_string_literal: true

require "English"
require "open3"
class GitImportService
  GIT_URL_PATTERNS = [
    # HTTPS URLs
    %r{https://(?<provider>[^/]+)/(?<org>[^/]+)/(?<repo>[^/.]+?)(?:\.git)?$},
    # SSH URLs
    %r{git@(?<provider>[^:]+):(?<org>[^/]+)/(?<repo>[^/.]+?)(?:\.git)?$},
    # SSH with protocol
    %r{ssh://git@(?<provider>[^/]+)/(?<org>[^/]+)/(?<repo>[^/.]+?)(?:\.git)?$},
  ].freeze

  attr_reader :git_url, :errors

  def initialize(git_url)
    @git_url = git_url.strip
    @errors = []
  end

  def parse_url
    GIT_URL_PATTERNS.each do |pattern|
      if (match = git_url.match(pattern))
        return {
          provider: match[:provider],
          org: match[:org],
          repo: match[:repo],
        }
      end
    end

    @errors << "Invalid git URL format"
    nil
  end

  def clone_path
    parsed = parse_url
    return unless parsed

    base_path = File.expand_path("~/src")
    File.join(base_path, parsed[:provider], parsed[:org], parsed[:repo])
  end

  def clone!
    parsed = parse_url
    return false unless parsed

    target_path = clone_path

    # Check if directory already exists
    if File.directory?(target_path)
      # Check if it's already a git repository
      if File.directory?(File.join(target_path, ".git"))
        # Verify it's the same repository by checking remote URL
        if same_repository?(target_path)
          # Repository already exists and matches - this is success!
          return true
        else
          @errors << "A different git repository already exists at #{target_path}"
          return false
        end
      else
        @errors << "A non-git directory already exists at #{target_path}"
        return false
      end
    end

    # Create parent directories
    FileUtils.mkdir_p(File.dirname(target_path))

    # Clone the repository using Open3 for safety
    stdout, stderr, status = Open3.capture3("git", "clone", git_url, target_path)
    output = stdout + stderr
    success = status.success?

    unless success
      @errors << "Git clone failed: #{output}"
      # Clean up if clone failed
      FileUtils.rm_rf(target_path) if File.directory?(target_path)
    end

    success
  end

  def same_repository?(path)
    # Get the remote URL from the existing repository
    Dir.chdir(path) do
      stdout, _, status = Open3.capture3("git", "config", "--get", "remote.origin.url")
      return false unless status.success?

      remote_url = stdout.strip
      # Normalize URLs for comparison (remove .git suffix, handle different formats)
      normalize_url(remote_url) == normalize_url(git_url)
    end
  rescue
    false
  end

  def normalize_url(url)
    # Remove .git suffix and trailing slashes
    normalized = url.strip.downcase.gsub(/\.git$/, "").gsub(%r{/$}, "")

    # Convert SSH URLs to a comparable format
    # git@github.com:user/repo -> github.com/user/repo
    normalized.gsub(/^git@([^:]+):/, '\1/')
      .gsub(%r{^ssh://git@([^/]+)/}, '\1/')
      .gsub(%r{^https?://}, "")
  end

  def valid?
    parse_url.present?
  end

  def error_message
    @errors.join(", ")
  end
end
