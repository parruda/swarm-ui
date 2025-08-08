import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="git-status-badge"
export default class extends Controller {
  static targets = ["indicator"]
  static values = { projectId: Number }

  connect() {
    // Check git status asynchronously after page load
    this.checkGitStatus()
  }

  async checkGitStatus() {
    try {
      const response = await fetch(`/projects/${this.projectIdValue}/git_dirty_check`)

      if (response.ok) {
        const data = await response.json()

        if (data.git && data.dirty) {
          this.indicatorTarget.classList.remove("hidden")
        }
      }
    } catch (error) {
      console.error("Failed to check git status:", error)
    }
  }
}