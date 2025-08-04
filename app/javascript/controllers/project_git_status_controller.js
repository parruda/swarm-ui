import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { projectId: Number, projectPath: String }
  static targets = ["branch", "dirty", "ahead", "behind", "indicatorContainer"]
  
  connect() {
    // Fetch git status immediately on connect
    this.fetchGitStatus()
  }
  
  async fetchGitStatus() {
    try {
      const response = await fetch(`/projects/${this.projectIdValue}/git_status`)
      const data = await response.json()
      
      if (!data.git) {
        // Not a git repository, nothing to show
        return
      }
      
      // Update branch badge
      if (this.hasBranchTarget && data.branch) {
        this.branchTarget.textContent = data.branch
        this.branchTarget.parentElement.classList.remove('hidden')
      }
      
      // Update dirty badge
      if (this.hasDirtyTarget) {
        if (data.dirty) {
          this.dirtyTarget.parentElement.classList.remove('hidden')
        } else {
          this.dirtyTarget.parentElement.classList.add('hidden')
        }
      }
      
      // Update ahead/behind indicators
      const hasAheadBehind = data.ahead > 0 || data.behind > 0
      
      if (this.hasAheadTarget) {
        const aheadContainer = this.aheadTarget.parentElement
        if (data.ahead > 0) {
          this.aheadTarget.textContent = `${data.ahead} ahead`
          aheadContainer.classList.remove('hidden')
        } else {
          aheadContainer.classList.add('hidden')
        }
      }
      
      if (this.hasBehindTarget) {
        const behindContainer = this.behindTarget.parentElement
        if (data.behind > 0) {
          this.behindTarget.textContent = `${data.behind} behind`
          behindContainer.classList.remove('hidden')
          // If we have ahead too, ensure ml-2 is present
          if (data.ahead > 0) {
            behindContainer.classList.add('ml-2')
          } else {
            behindContainer.classList.remove('ml-2')
          }
        } else {
          behindContainer.classList.add('hidden')
        }
      }
      
      // If no ahead/behind data, we could optionally show a placeholder
      // The container always stays visible to prevent layout shift
      if (this.hasIndicatorContainerTarget && !hasAheadBehind) {
        // Add a non-breaking space to maintain minimum height if completely empty
        if (this.indicatorContainerTarget.textContent.trim() === '') {
          this.indicatorContainerTarget.innerHTML = '&nbsp;'
        }
      }
      
    } catch (error) {
      console.error('Failed to fetch git status:', error)
      // Silently fail - just don't show git status
    }
  }
}