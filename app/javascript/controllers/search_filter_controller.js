import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["input", "form"]
  
  connect() {
    this.timeout = null
  }
  
  debounceSearch() {
    clearTimeout(this.timeout)
    
    // Add loading indicator
    this.inputTarget.classList.add("opacity-75")
    
    this.timeout = setTimeout(() => {
      // Find the parent form
      const form = this.inputTarget.closest("form")
      if (form) {
        // Submit the form which will trigger Turbo
        form.requestSubmit()
      }
      
      this.inputTarget.classList.remove("opacity-75")
    }, 300) // 300ms debounce
  }
  
  clearSearch(event) {
    event.preventDefault()
    this.inputTarget.value = ""
    
    // Submit the form to clear results
    const form = this.inputTarget.closest("form")
    if (form) {
      form.requestSubmit()
    }
  }
}