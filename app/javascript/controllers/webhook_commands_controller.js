import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["commandList", "commandEntry", "commandTemplate", "emptyState"]

  addCommand() {
    const template = this.commandTemplateTarget.content.cloneNode(true)
    this.commandListTarget.appendChild(template)
    this.hideEmptyState()
  }

  removeCommand(event) {
    const entry = event.target.closest('.command-entry')
    if (entry) {
      entry.remove()
      this.checkEmptyState()
    }
  }

  normalizeCommand(event) {
    // Remove any leading slashes the user might type
    const input = event.target
    const value = input.value
    if (value.startsWith('/')) {
      input.value = value.substring(1)
    }
  }

  hideEmptyState() {
    if (this.hasEmptyStateTarget) {
      this.emptyStateTarget.classList.add('hidden')
    }
  }

  checkEmptyState() {
    // Show empty state if no commands left
    const entries = this.commandListTarget.querySelectorAll('.command-entry')
    if (entries.length === 0 && this.hasEmptyStateTarget) {
      this.emptyStateTarget.classList.remove('hidden')
    }
  }
}