import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    // Refresh git status every 10 seconds
    this.refreshInterval = setInterval(() => {
      this.refreshStatus()
    }, 10000)
  }

  disconnect() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
    }
  }

  refreshStatus() {
    // Get the current URL and reload just the navbar
    fetch(window.location.href, {
      headers: {
        'Accept': 'text/html',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
    .then(response => response.text())
    .then(html => {
      // Parse the response and extract the git status section
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const newGitStatus = doc.querySelector('[data-controller="git-status"]')
      
      if (newGitStatus && this.element) {
        // Replace the current git status with the new one
        this.element.innerHTML = newGitStatus.innerHTML
      }
    })
    .catch(error => {
      console.error('Error refreshing git status:', error)
    })
  }
}