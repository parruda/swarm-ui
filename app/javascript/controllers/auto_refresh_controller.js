import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    interval: { type: Number, default: 3000 }
  }

  connect() {
    this.checkAndRefresh()
  }

  disconnect() {
    this.stopRefreshing()
  }

  checkAndRefresh() {
    // Check if there are any importing projects
    const hasImportingProjects = !!this.element.querySelector('[data-import-status="importing"]')

    if (hasImportingProjects) {
      this.startRefreshing()
    } else {
      this.stopRefreshing()
    }
  }

  startRefreshing() {
    if (!this.refreshTimer) {
      this.refreshTimer = setInterval(() => {
        // Simply reload the page to get updated content
        window.location.reload()
      }, this.intervalValue)
    }
  }

  stopRefreshing() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }
}