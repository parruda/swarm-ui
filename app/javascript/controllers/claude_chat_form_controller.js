import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    // Listen for Turbo form submission events
    this.element.addEventListener("turbo:submit-start", this.handleSubmitStart.bind(this))
    this.element.addEventListener("turbo:submit-end", this.handleSubmitEnd.bind(this))
  }
  
  disconnect() {
    this.element.removeEventListener("turbo:submit-start", this.handleSubmitStart.bind(this))
    this.element.removeEventListener("turbo:submit-end", this.handleSubmitEnd.bind(this))
  }
  
  handleSubmitStart(event) {
    // This runs BEFORE Turbo processes the form
    // The form is a target of claude-chat, so we need to find its parent controller
    // First try to find the parent element with claude-chat controller
    let chatControllerElement = this.element.parentElement
    while (chatControllerElement && !chatControllerElement.dataset.controller?.includes('claude-chat')) {
      chatControllerElement = chatControllerElement.parentElement
    }
    
    if (chatControllerElement) {
      const controller = this.application.getControllerForElementAndIdentifier(chatControllerElement, 'claude-chat')
      if (controller) {
        // Check if we should proceed with sending
        const canSend = controller.beforeSend()
        if (!canSend) {
          event.preventDefault()
          event.detail.formSubmission.stop()
          return
        }
        // Let the form submit naturally
      }
    }
  }
  
  submit(event) {
    // Don't call beforeSend here since handleSubmitStart already did
    // This would cause beforeSend to be called twice and isWaitingForResponse would already be true
  }
  
  handleSubmitEnd(event) {
    // Clear the input after Turbo submission completes
    const inputField = this.element.querySelector('textarea[name="prompt"]')
    if (inputField) {
      inputField.value = ''
    }
    
    // Get the claude chat controller and call afterSend
    // Find the parent element with claude-chat controller
    let chatControllerElement = this.element.parentElement
    while (chatControllerElement && !chatControllerElement.dataset.controller?.includes('claude-chat')) {
      chatControllerElement = chatControllerElement.parentElement
    }
    
    if (chatControllerElement) {
      const controller = this.application.getControllerForElementAndIdentifier(chatControllerElement, 'claude-chat')
      if (controller) {
        controller.afterSend()
      }
    }
  }
}