import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { projectId: Number, projectPath: String }
  static targets = ["branch", "dirty", "ahead", "behind"]
  
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
      
      if (hasAheadBehind) {
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
        
        // Show the parent container for ahead/behind
        if (this.hasAheadTarget || this.hasBehindTarget) {
          const target = this.hasAheadTarget ? this.aheadTarget : this.behindTarget
          const aheadBehindContainer = target.closest('p.text-xs.text-gray-500')
          if (aheadBehindContainer) {
            aheadBehindContainer.classList.remove('hidden')
          }
        }
      }
      
    } catch (error) {
      console.error('Failed to fetch git status:', error)
      // Silently fail - just don't show git status
    }
  }
}