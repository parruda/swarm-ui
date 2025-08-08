import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="swarm-count-badge"
export default class extends Controller {
  static targets = ["count"]
  static values = { projectId: Number }

  connect() {
    // Load swarm count asynchronously
    this.loadSwarmCount()
  }

  async loadSwarmCount() {
    try {
      const response = await fetch(`/projects/${this.projectIdValue}/swarm_count`)
      
      if (response.ok) {
        const data = await response.json()
        
        if (data.count > 0) {
          this.countTarget.textContent = data.count
          this.countTarget.classList.remove("hidden")
        }
      }
    } catch (error) {
      console.error("Failed to load swarm count:", error)
    }
  }
}