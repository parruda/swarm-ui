import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="dropdown"
export default class extends Controller {
  static targets = ["button", "menu"]

  connect() {
    // Close dropdown when clicking outside
    this.clickOutside = this.clickOutside.bind(this)
    document.addEventListener('click', this.clickOutside)
  }

  disconnect() {
    document.removeEventListener('click', this.clickOutside)
  }

  toggle(event) {
    event.stopPropagation()
    const isHidden = this.menuTarget.classList.contains('hidden')

    if (isHidden) {
      this.show()
    } else {
      this.hide()
    }
  }

  show() {
    this.menuTarget.classList.remove('hidden')
    this.buttonTarget.setAttribute('aria-expanded', 'true')
  }

  hide() {
    this.menuTarget.classList.add('hidden')
    this.buttonTarget.setAttribute('aria-expanded', 'false')
  }

  clickOutside(event) {
    if (!this.element.contains(event.target)) {
      this.hide()
    }
  }
}