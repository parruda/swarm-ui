import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    // Listen for Turbo form submission events
    this.element.addEventListener("turbo:submit-end", this.handleSubmitEnd.bind(this))
  }
  
  disconnect() {
    this.element.removeEventListener("turbo:submit-end", this.handleSubmitEnd.bind(this))
  }
  
  submit(event) {
    // Get the claude chat controller
    const chatController = this.element.closest('[data-controller*="claude-chat"]')
    if (chatController) {
      const controller = this.application.getControllerForElementAndIdentifier(chatController, 'claude-chat')
      if (controller) {
        // Check if we should proceed with sending
        if (!controller.beforeSend()) {
          event.preventDefault()
          return
        }
      }
    }
  }
  
  handleSubmitEnd(event) {
    // Clear the input after Turbo submission completes
    const inputField = this.element.querySelector('textarea[name="prompt"]')
    if (inputField) {
      inputField.value = ''
    }
    
    // Get the claude chat controller and call afterSend
    const chatController = this.element.closest('[data-controller*="claude-chat"]')
    if (chatController) {
      const controller = this.application.getControllerForElementAndIdentifier(chatController, 'claude-chat')
      if (controller) {
        controller.afterSend()
      }
    }
  }
}