# frozen_string_literal: true

class ProjectImportJob < ApplicationJob
  queue_as :default

  def perform(project_id)
    project = Project.find(project_id)
    return unless project.importing?

    service = GitImportService.new(project.git_url)

    # Start the import
    project.start_import!

    if service.clone!
      # Import successful
      project.complete_import!(service.clone_path)

      # Detect VCS type after import
      project.detect_vcs_type
      project.save!

      # Populate GitHub fields if it's a GitHub repo
      project.populate_github_fields_from_remote if project.git?
    else
      # Import failed
      project.fail_import!(service.error_message)
    end
  rescue => e
    Rails.logger.error("Project import failed for project #{project_id}: #{e.message}")
    project&.fail_import!("Import failed: #{e.message}")
  end
end
