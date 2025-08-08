import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="dropdown-smart-position"
// Extends dropdown-hover functionality with viewport-aware positioning
export default class extends Controller {
  static targets = ["menu", "trigger"]
  static values = {
    hasItems: Boolean,
    clickable: { type: Boolean, default: true },
    menuWidth: { type: Number, default: 750 }
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
    this.positionMenu()
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

  positionMenu() {
    if (!this.hasMenuTarget) return

    const menu = this.menuTarget
    const trigger = this.triggerTarget
    const menuWidth = this.menuWidthValue

    // Get trigger position relative to viewport
    const triggerRect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth

    // Calculate if menu would overflow on the right
    const wouldOverflowRight = (triggerRect.left + menuWidth) > viewportWidth

    // Reset positioning classes
    menu.classList.remove("left-0", "right-0")

    if (wouldOverflowRight) {
      // Position menu to align with right edge of trigger or viewport
      const spaceOnLeft = triggerRect.right

      if (spaceOnLeft >= menuWidth) {
        // Align to right edge of trigger
        menu.classList.add("right-0")
      } else {
        // Position menu to stay within viewport
        // Calculate exact position needed
        const rightOffset = viewportWidth - triggerRect.right
        const leftPosition = viewportWidth - menuWidth - 20 // 20px padding from edge

        // Use inline style for precise positioning
        menu.style.left = `${leftPosition - triggerRect.left}px`
        menu.style.right = 'auto'
      }
    } else {
      // Default: align to left edge of trigger
      menu.classList.add("left-0")
      menu.style.left = ''
      menu.style.right = ''
    }
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

  // Reposition on window resize
  resize() {
    if (this.hasMenuTarget && !this.menuTarget.classList.contains("hidden")) {
      this.positionMenu()
    }
  }
}