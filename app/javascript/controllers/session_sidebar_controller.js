import { Controller } from "@hotwired/stimulus"

// Manages the show/hide functionality for the session details sidebar
export default class extends Controller {
  static targets = ["panel", "showButton"]
  
  connect() {
    // Start hidden by default
    this.hide()
    
    // Check if there's a saved preference to show
    const isShown = localStorage.getItem('sessionSidebarShown') === 'true'
    if (isShown) {
      this.show()
    }
  }
  
  toggle() {
    if (this.panelTarget.classList.contains('hidden')) {
      this.show()
    } else {
      this.hide()
    }
  }
  
  show() {
    this.panelTarget.classList.remove('hidden')
    this.showButtonTarget.classList.add('hidden')
    
    localStorage.setItem('sessionSidebarShown', 'true')
  }
  
  hide() {
    this.panelTarget.classList.add('hidden')
    this.showButtonTarget.classList.remove('hidden')
    
    localStorage.setItem('sessionSidebarShown', 'false')
  }
}