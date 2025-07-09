import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["pane", "content", "toggleButton"]
  static values = { open: Boolean }

  connect() {
    this.openValue = false
  }

  toggle() {
    this.openValue = !this.openValue
  }

  openValueChanged() {
    if (this.openValue) {
      this.paneTarget.classList.remove("translate-x-full")
      this.paneTarget.classList.add("translate-x-0")
      this.toggleButtonTarget.innerHTML = this.closeIcon()
    } else {
      this.paneTarget.classList.remove("translate-x-0")
      this.paneTarget.classList.add("translate-x-full")
      this.toggleButtonTarget.innerHTML = this.openIcon()
    }
  }

  openIcon() {
    return `<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>`
  }

  closeIcon() {
    return `<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>`
  }
}