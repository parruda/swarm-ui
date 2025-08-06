import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["commandList", "commandEntry", "commandTemplate"]

  addCommand() {
    const template = this.commandTemplateTarget.content.cloneNode(true)
    this.commandListTarget.appendChild(template)
  }

  removeCommand(event) {
    const entry = event.target.closest('.command-entry')
    if (entry) {
      entry.remove()
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
}