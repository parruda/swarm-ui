import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["importToggle", "importSection", "browseSection", "configSection", "projectPathInput", "gitUrlInput", "nameInput"]

  connect() {
    this.toggleImportSection()
  }

  toggleImportSection() {
    const isImport = this.importToggleTarget.checked
    
    if (isImport) {
      this.importSectionTarget.classList.remove("hidden")
      this.browseSectionTarget.classList.add("hidden")
      this.configSectionTarget.classList.add("hidden")
      
      // Clear path when switching to import
      if (this.hasProjectPathInputTarget) {
        this.projectPathInputTarget.value = ""
      }
    } else {
      this.importSectionTarget.classList.add("hidden")
      this.browseSectionTarget.classList.remove("hidden")
      this.configSectionTarget.classList.remove("hidden")
      
      // Clear git URL when switching to browse
      if (this.hasGitUrlInputTarget) {
        this.gitUrlInputTarget.value = ""
      }
    }
  }

  extractProjectName() {
    const gitUrl = this.gitUrlInputTarget.value
    if (!gitUrl) return

    // Extract repo name from URL
    const patterns = [
      /https:\/\/[^\/]+\/[^\/]+\/([^\/\.]+?)(?:\.git)?$/,
      /git@[^:]+:[^\/]+\/([^\/\.]+?)(?:\.git)?$/,
      /ssh:\/\/git@[^\/]+\/[^\/]+\/([^\/\.]+?)(?:\.git)?$/
    ]

    for (const pattern of patterns) {
      const match = gitUrl.match(pattern)
      if (match) {
        const repoName = match[1]
        // Convert repo-name to Title Case
        const projectName = repoName
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
        
        // Only update if name field is empty
        if (this.nameInputTarget.value === '') {
          this.nameInputTarget.value = projectName
        }
        break
      }
    }
  }
}