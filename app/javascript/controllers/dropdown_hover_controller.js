import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="dropdown-hover"
export default class extends Controller {
  static targets = ["menu", "trigger"]
  static values = {
    hasItems: Boolean,
    clickable: { type: Boolean, default: true }
  }

  connect() {
    this.hideTimeout = null
    this.isHovering = false
  }

  disconnect() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
    }
  }

  show() {
    if (!this.hasItemsValue || !this.hasMenuTarget) return

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }

    this.isHovering = true
    this.menuTarget.classList.remove("hidden")

    // Set a flag on the body to indicate dropdown is open
    document.body.dataset.gitDropdownOpen = "true"
  }

  hide() {
    this.isHovering = false

    // Small delay to allow moving cursor from trigger to menu
    this.hideTimeout = setTimeout(() => {
      if (!this.isHovering && this.hasMenuTarget) {
        this.menuTarget.classList.add("hidden")

        // Remove the flag from body
        delete document.body.dataset.gitDropdownOpen
      }
    }, 100)
  }

  menuEnter() {
    this.isHovering = true
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }
  }

  menuLeave() {
    this.hide()
  }

  // Prevent dropdown from closing when clicking inside menu items
  menuClick(event) {
    // Don't stop propagation, just prevent the dropdown from closing
    this.isHovering = true
  }

  // Handle trigger click
  triggerClick(event) {
    if (!this.clickableValue) {
      event.preventDefault()
    }
    // If clickable is true, allow default behavior (navigation)
  }
}