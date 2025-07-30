import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { 
    sessionId: Number,
    pollInterval: { type: Number, default: 5000 }
  }

  connect() {
    this.isPolling = false
    this.pollTimer = null
    
    // Start polling if page is visible
    if (!document.hidden) {
      this.startPolling()
    }
    
    // Listen for visibility changes
    document.addEventListener("visibilitychange", this.handleVisibilityChange)
  }

  disconnect() {
    this.stopPolling()
    document.removeEventListener("visibilitychange", this.handleVisibilityChange)
  }

  handleVisibilityChange = () => {
    if (document.hidden) {
      console.log("[GitStatus] Tab became hidden, stopping polling")
      this.stopPolling()
    } else {
      console.log("[GitStatus] Tab became visible, starting polling")
      this.startPolling()
    }
  }

  startPolling() {
    if (this.isPolling) return
    
    this.isPolling = true
    this.poll()
  }

  stopPolling() {
    this.isPolling = false
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  async poll() {
    if (!this.isPolling) return

    try {
      const response = await fetch(`/sessions/${this.sessionIdValue}/git_status_poll`, {
        method: "GET",
        headers: {
          "Accept": "text/vnd.turbo-stream.html"
        }
      })
      
      if (!response.ok) {
        console.error("[GitStatus] Poll failed:", response.status)
      }
    } catch (error) {
      console.error("[GitStatus] Poll error:", error)
    } finally {
      // Schedule next poll only if still active
      if (this.isPolling && !document.hidden) {
        this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalValue)
      }
    }
  }
}