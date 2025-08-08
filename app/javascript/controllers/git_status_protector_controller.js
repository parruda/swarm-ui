import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    // Listen for Turbo Stream before-render events
    this.boundBeforeRender = this.beforeRender.bind(this)
    document.addEventListener("turbo:before-stream-render", this.boundBeforeRender)
  }

  disconnect() {
    document.removeEventListener("turbo:before-stream-render", this.boundBeforeRender)
  }

  beforeRender(event) {
    // Check if this is a git status update and dropdown is open
    const target = event.target
    if (target.target === "git-status-display" && document.body.dataset.gitDropdownOpen === "true") {
      // Prevent the update
      event.preventDefault()
    }
  }
}