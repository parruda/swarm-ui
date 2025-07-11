# frozen_string_literal: true

namespace :webhook do
  desc "Kill all gh webhook forward processes"
  task kill_all: :environment do
    puts "Killing all gh webhook forward processes..."

    # Find all gh webhook processes
    pids = []

    # Try multiple patterns to find gh processes
    patterns = [
      "gh webhook forward",
      "gh.*webhook.*forward",
      "webhook forward --repo",
    ]

    patterns.each do |pattern|
      output = %x(ps aux | grep -E "#{pattern}" | grep -v grep)
      output.each_line do |line|
        parts = line.split
        pid = parts[1].to_i
        pids << pid if pid > 0
      end
    end

    pids.uniq!
    puts "Found #{pids.size} gh webhook processes: #{pids.join(", ")}"

    # Kill each process
    pids.each do |pid|
      puts "Killing process #{pid}..."
      Process.kill("TERM", pid)
      sleep(0.5)

      # Check if still alive
      Process.kill(0, pid)
      puts "Process #{pid} still alive, sending SIGKILL"
      Process.kill("KILL", pid)
    rescue Errno::ESRCH
      puts "Process #{pid} terminated"
    rescue => e
      puts "Error killing process #{pid}: #{e.message}"
    end

    # Update database
    GithubWebhookProcess.where(status: "running").update_all(
      status: "stopped",
      stopped_at: Time.current,
    )

    puts "Cleanup complete"
  end

  desc "Show all gh webhook processes"
  task show_processes: :environment do
    puts "\n=== Database Records ==="
    GithubWebhookProcess.where(status: "running").each do |process|
      project = process.project
      puts "PID: #{process.pid}, Project: #{project.name} (#{project.id}), Started: #{process.started_at}"
    end

    puts "\n=== System Processes ==="
    output = %x(ps aux | grep -E "gh.*webhook" | grep -v grep)
    puts output

    puts "\n=== Process Tree ==="
    # Try to show process tree if pstree is available
    begin
      pids = output.split("\n").map { |line| line.split[1] }.join(" ")
      if pids.present?
        tree = %x(pstree -p #{pids} 2>/dev/null)
        puts tree if tree.present?
      end
    rescue
      puts "(pstree not available)"
    end
  end
end
