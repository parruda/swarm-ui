# frozen_string_literal: true

namespace :webhook do
  desc "Start the webhook manager process"
  task manager: :environment do
    # Handle graceful shutdown
    trap("TERM") do
      Rails.logger.info("Received TERM signal, shutting down webhook manager")
      exit
    end

    trap("INT") do
      Rails.logger.info("Received INT signal, shutting down webhook manager")
      exit
    end

    Rails.logger.info("Starting webhook manager")
    WebhookManager.new.run
  rescue => e
    Rails.logger.error("Webhook manager crashed: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    exit(1)
  end
end
