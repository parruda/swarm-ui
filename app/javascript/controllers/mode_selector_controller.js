import { Controller } from "@hotwired/stimulus"

// Mode selector controller for choosing between interactive and non-interactive modes
export default class extends Controller {
  static targets = ["promptField"]
  
  connect() {
    // Check initial state on page load
    const currentMode = this.element.querySelector('input[name="mode"]:checked')?.value
    if (currentMode) {
      this.updateModeUI(currentMode)
    }
  }

  // Handle mode change (interactive vs non-interactive)
  updateMode(event) {
    const mode = event.target.value
    this.updateModeUI(mode)
  }

  // Update UI based on selected mode
  updateModeUI(mode) {
    if (mode === 'non-interactive') {
      this.showPromptField()
    } else {
      this.hidePromptField()
    }
  }

  // Show the prompt field for non-interactive mode
  showPromptField() {
    if (this.hasPromptFieldTarget) {
      this.promptFieldTarget.classList.remove('hidden')
      
      // Make prompt field required
      const promptTextarea = this.promptFieldTarget.querySelector('textarea[name="prompt"]')
      if (promptTextarea) {
        promptTextarea.required = true
      }
    }
  }

  // Hide the prompt field for interactive mode
  hidePromptField() {
    if (this.hasPromptFieldTarget) {
      this.promptFieldTarget.classList.add('hidden')
      
      // Make prompt field not required and clear value
      const promptTextarea = this.promptFieldTarget.querySelector('textarea[name="prompt"]')
      if (promptTextarea) {
        promptTextarea.required = false
        promptTextarea.value = ''
      }
    }
  }
}