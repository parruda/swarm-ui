import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
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
        
        // Let form submit normally with Turbo
        // After Turbo completes, call afterSend
        setTimeout(() => {
          controller.afterSend()
        }, 100)
      }
    }
  }
}