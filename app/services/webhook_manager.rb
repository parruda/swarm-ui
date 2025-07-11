# frozen_string_literal: true

class WebhookManager
  def run
    Rails.logger.info("Starting Webhook Manager with PostgreSQL LISTEN")

    # Initial sync on startup
    sync_all_webhooks

    # Listen for changes
    connection = ActiveRecord::Base.connection.raw_connection

    begin
      connection.exec("LISTEN webhook_changes")
      Rails.logger.info("Listening for webhook changes...")

      loop do
        # Wait for notifications (with timeout for periodic health checks)
        connection.wait_for_notify(30) do |channel, _pid, payload|
          handle_notification(payload) if channel == "webhook_changes"
        end

        # Periodic health check even without notifications
        check_process_health
      end
    rescue => e
      Rails.logger.error("WebhookManager error: #{e.message}")
      Rails.logger.error(e.backtrace.join("\n"))
      raise
    ensure
      begin
        connection.exec("UNLISTEN webhook_changes")
      rescue
        nil
      end
    end
  end

  private

  def handle_notification(payload)
    data = JSON.parse(payload)
    project_id = data["project_id"]
    enabled = data["enabled"]

    Rails.logger.info("Received webhook change: Project #{project_id}, enabled: #{enabled}")

    project = Project.find(project_id)

    if enabled
      ensure_process_running(project)
    else
      ensure_process_stopped(project)
    end
  rescue => e
    Rails.logger.error("Error handling notification: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
  end

  def sync_all_webhooks
    Rails.logger.info("Syncing all webhook states")

    # Start webhooks that should be running
    Project.where(github_webhook_enabled: true).find_each do |project|
      ensure_process_running(project)
    end

    # Stop webhooks that shouldn't be running
    Project.where(github_webhook_enabled: false).find_each do |project|
      ensure_process_stopped(project)
    end

    # Clean up orphaned processes
    cleanup_orphaned_processes
  end

  def check_process_health
    # Check if any running processes have died unexpectedly
    GithubWebhookProcess.where(status: "running").find_each do |process|
      Process.kill(0, process.pid) # Check if process exists
    rescue Errno::ESRCH
      # Process doesn't exist
      Rails.logger.warn("Process #{process.pid} for project #{process.project_id} is dead, updating status")
      process.update!(status: "stopped", stopped_at: Time.current)

      # Restart if webhook is still enabled
      if process.project.github_webhook_enabled?
        Rails.logger.info("Restarting webhook for project #{process.project_id}")
        ensure_process_running(process.project)
      end
    rescue => e
      Rails.logger.error("Error checking process #{process.pid}: #{e.message}")
    end
  end

  def ensure_process_running(project)
    current_process = project.github_webhook_processes.where(status: "running").first

    if current_process
      # Verify it's actually running
      begin
        Process.kill(0, current_process.pid)
        Rails.logger.debug("Webhook process for project #{project.id} already running (PID: #{current_process.pid})")
        return
      rescue Errno::ESRCH
        Rails.logger.info("Dead process found for project #{project.id}, cleaning up")
        current_process.update!(status: "stopped", stopped_at: Time.current)
      end
    end

    # Start new process
    Rails.logger.info("Starting webhook process for project #{project.id}")
    WebhookProcessService.start(project)
  rescue => e
    Rails.logger.error("Failed to ensure process running for project #{project.id}: #{e.message}")
  end

  def ensure_process_stopped(project)
    project.github_webhook_processes.where(status: "running").each do |process|
      Rails.logger.info("Stopping webhook process #{process.pid} for project #{project.id}")
      WebhookProcessService.stop(process)
    end
  end

  def cleanup_orphaned_processes
    # Mark any processes as stopped if they don't have a running PID
    GithubWebhookProcess.where(status: "running").find_each do |process|
      Process.kill(0, process.pid)
    rescue Errno::ESRCH
      Rails.logger.info("Cleaning up orphaned process record #{process.id}")
      process.update!(status: "stopped", stopped_at: Time.current)
    end
  end

  # Handle auto-start on boot
  def self.start_auto_webhooks
    Rails.logger.info("Starting auto-start webhooks")

    Project.where(github_webhook_auto_start: true, github_webhook_enabled: true).find_each do |project|
      Rails.logger.info("Auto-starting webhook for project #{project.id} (#{project.name})")
      WebhookProcessService.start(project)
    rescue => e
      Rails.logger.error("Failed to auto-start webhook for project #{project.id}: #{e.message}")
    end
  end
end
