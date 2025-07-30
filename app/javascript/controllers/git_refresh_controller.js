import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["icon"]
  static values = { sessionId: Number }

  connect() {
    this.refreshing = false
  }

  async refresh() {
    if (this.refreshing) return
    
    this.refreshing = true
    this.iconTarget.classList.add("animate-spin")
    
    try {
      const response = await fetch(`/sessions/${this.sessionIdValue}/refresh_git_status`, {
        method: "POST",
        headers: {
          "X-CSRF-Token": document.querySelector("meta[name='csrf-token']").content,
          "Accept": "text/vnd.turbo-stream.html"
        }
      })
      
      if (!response.ok) {
        throw new Error("Failed to refresh git status")
      }
      
      // Turbo will handle the response and update the UI
    } catch (error) {
      console.error("Error refreshing git status:", error)
    } finally {
      // Keep spinning for a bit to show activity
      setTimeout(() => {
        this.iconTarget.classList.remove("animate-spin")
        this.refreshing = false
      }, 500)
    }
  }
}