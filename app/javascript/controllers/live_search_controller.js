import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="live-search"
export default class extends Controller {
  static targets = ["input"]
  
  connect() {
    // Auto-focus the search input when the page loads
    if (this.hasInputTarget) {
      this.inputTarget.focus()
      // Move cursor to end of existing text if any
      const length = this.inputTarget.value.length
      this.inputTarget.setSelectionRange(length, length)
    }
    
    // Initialize debounce timer
    this.searchTimer = null
  }
  
  disconnect() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
    }
  }
  
  search() {
    // Clear any existing timer
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
    }
    
    // Set a new timer to submit after user stops typing
    this.searchTimer = setTimeout(() => {
      // Find the form element (the controller is attached to the form)
      const form = this.element
      if (form && form.requestSubmit) {
        form.requestSubmit()
      } else if (form) {
        // Fallback for browsers that don't support requestSubmit
        form.submit()
      }
    }, 300) // 300ms delay after user stops typing
  }
  
  submitNow(event) {
    // If Enter key is pressed, submit immediately
    if (event.key === 'Enter') {
      if (this.searchTimer) {
        clearTimeout(this.searchTimer)
      }
      // The form will submit naturally, no need to call submit
    }
  }
}