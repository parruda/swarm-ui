import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    sessionId: Number,
    pollInterval: { type: Number, default: 10000 }  // Changed to 10 seconds
  }

  connect() {
    this.isPolling = false
    this.pollTimer = null

    // Check if we need to do initial load (no git status data present)
    const gitStatusDisplay = document.getElementById('git-status-display')
    const needsInitialLoad = gitStatusDisplay &&
                            gitStatusDisplay.textContent.includes('Loading git status')

    if (needsInitialLoad) {
      // Trigger immediate refresh for initial load
      this.manualRefresh()
    }

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
      this.stopPolling()
    } else {
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

  resetTimer() {
    // Clear existing timer
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }

    // Schedule next poll if still active
    if (this.isPolling && !document.hidden) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalValue)
    }
  }

  async poll() {
    if (!this.isPolling) return

    try {
      const response = await fetch(`/sessions/${this.sessionIdValue}/git_status_poll`, {
        method: "POST",  // Changed to POST
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
        }
      })

      if (!response.ok) {
        console.error("[GitStatus] Poll failed:", response.status)
      }
    } catch (error) {
      console.error("[GitStatus] Poll error:", error)
    } finally {
      // Schedule next poll only if still active
      this.resetTimer()
    }
  }

  // Method to manually trigger refresh (called by refresh button)
  async manualRefresh() {
    try {
      const response = await fetch(`/sessions/${this.sessionIdValue}/refresh_git_status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
        }
      })

      if (!response.ok) {
        console.error("[GitStatus] Manual refresh failed:", response.status)
      } else {
        // Reset the timer to prevent duplicate polls
        this.resetTimer()
      }
    } catch (error) {
      console.error("[GitStatus] Manual refresh error:", error)
    }
  }
}