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
    console.log("=== FORM SUBMIT START (turbo:submit-start) ===")
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
        console.log("Found claude-chat controller, calling beforeSend")
        // Check if we should proceed with sending
        const canSend = controller.beforeSend()
        if (!canSend) {
          console.log("beforeSend returned false, stopping submission")
          event.preventDefault()
          event.detail.formSubmission.stop()
          return
        }
        console.log("beforeSend returned true, allowing submission to proceed")
        // Let the form submit naturally
      } else {
        console.log("Could not find claude-chat controller instance!")
      }
    } else {
      console.log("Could not find element with claude-chat controller!")
    }
  }
  
  submit(event) {
    console.log("=== FORM SUBMIT ACTION (submit->claude-chat-form#submit) ===")
    // Don't call beforeSend here since handleSubmitStart already did
    // This would cause beforeSend to be called twice and isWaitingForResponse would already be true
    console.log("Skipping beforeSend in submit action (already handled in turbo:submit-start)")
  }
  
  handleSubmitEnd(event) {
    console.log("=== FORM SUBMIT END (turbo:submit-end) ===")
    console.log("Submit completed with status:", event.detail.success ? "success" : "failure")
    
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
        console.log("Calling afterSend on claude-chat controller")
        controller.afterSend()
      }
    }
  }
}