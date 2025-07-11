import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "content", "loading"]

  connect() {
    this.boundCloseOnEscape = this.closeOnEscape.bind(this)
    this.boundCloseOnClickOutside = this.closeOnClickOutside.bind(this)
  }

  disconnect() {
    document.removeEventListener("keydown", this.boundCloseOnEscape)
    document.removeEventListener("click", this.boundCloseOnClickOutside)
  }

  async open(event) {
    event.preventDefault()
    
    const directory = event.currentTarget.dataset.directory
    const instanceName = event.currentTarget.dataset.instanceName
    const sessionId = event.currentTarget.dataset.sessionId
    
    this.modalTarget.classList.remove("hidden")
    this.loadingTarget.classList.remove("hidden")
    this.contentTarget.innerHTML = ""
    
    document.addEventListener("keydown", this.boundCloseOnEscape)
    document.addEventListener("click", this.boundCloseOnClickOutside)
    
    try {
      const response = await fetch(`/sessions/${sessionId}/git_diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({ directory, instance_name: instanceName })
      })
      
      if (response.ok) {
        const data = await response.json()
        this.loadingTarget.classList.add("hidden")
        this.contentTarget.innerHTML = data.html
        
        // Initialize diff2html UI if available
        if (typeof Diff2HtmlUI !== 'undefined' && this.contentTarget.querySelector('#diff')) {
          const targetElement = this.contentTarget.querySelector('#diff')
          const configuration = {
            drawFileList: true,
            fileListToggle: true,
            fileListStartVisible: false,
            synchronisedScroll: true,
            highlightCode: true
          }
          const diff2htmlUi = new Diff2HtmlUI(targetElement, data.diff, configuration)
          diff2htmlUi.draw()
          diff2htmlUi.highlightCode()
        }
      } else {
        this.loadingTarget.classList.add("hidden")
        this.contentTarget.innerHTML = '<div class="text-red-600 dark:text-red-400">Error loading diff</div>'
      }
    } catch (error) {
      this.loadingTarget.classList.add("hidden")
      this.contentTarget.innerHTML = '<div class="text-red-600 dark:text-red-400">Error loading diff</div>'
    }
  }

  close(event) {
    if (event) event.preventDefault()
    this.modalTarget.classList.add("hidden")
    document.removeEventListener("keydown", this.boundCloseOnEscape)
    document.removeEventListener("click", this.boundCloseOnClickOutside)
  }

  closeOnEscape(event) {
    if (event.key === "Escape") {
      this.close()
    }
  }

  closeOnClickOutside(event) {
    if (this.modalTarget.contains(event.target) && !this.contentTarget.contains(event.target)) {
      this.close()
    }
  }
}