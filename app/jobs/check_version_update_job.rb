# frozen_string_literal: true

require "net/http"

class CheckVersionUpdateJob < ApplicationJob
  queue_as :default

  def perform
    remote_version = fetch_remote_version
    return unless remote_version

    version_checker = VersionChecker.instance
    version_checker.update!(
      remote_version: remote_version,
      checked_at: Time.current,
    )
  end

  private

  def fetch_remote_version
    uri = URI("https://raw.githubusercontent.com/parruda/swarm-ui/refs/heads/main/VERSION")

    # Add cache-busting query parameter
    uri.query = "t=#{Time.current.to_i}"

    response = Net::HTTP.get_response(uri)
    return unless response.is_a?(Net::HTTPSuccess)

    version = response.body.strip
    Rails.logger.info("Fetched remote version: #{version}")
    version
  rescue StandardError => e
    Rails.logger.error("Failed to fetch remote version: #{e.message}")
    nil
  end
end
