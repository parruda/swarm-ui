# SwarmUI Implementation Bugs Report

This document lists all implementation bugs discovered during test suite fixes. We have 81 skipped tests revealing various implementation issues. Each bug includes an explanation, the affected source file(s), and the corresponding test file(s).

## Controller Bugs

### 1. SwarmTemplates Controller - Missing @project Instance Variable

**Explanation**: The `new.html.erb` view expects `@project` to be set, but the controller only sets it when a `project_id` parameter is provided. This causes nil errors when creating swarm templates without a project context.

**Source File**: `app/controllers/swarm_templates_controller.rb` (line 68)
**View File**: `app/views/swarm_templates/new.html.erb` (line 12)
**Test File**: `test/controllers/swarm_templates_controller_test.rb`
- Multiple tests affected: "should get new", "new with visual mode", etc.

### 2. SwarmTemplates Controller - JSON Validation

**Explanation**: The controller rescues JSON parse errors and creates templates with empty config instead of validating and rejecting malformed JSON.

**Source File**: `app/controllers/swarm_templates_controller.rb` (lines 309-317)
**Test File**: `test/controllers/swarm_templates_controller_test.rb`

### 3. SwarmTemplates Controller - Text/Plain Response Format

**Explanation**: The preview_yaml action returns text/html content type even when format.text is requested.

**Source File**: `app/controllers/swarm_templates_controller.rb` (lines 146-154)
**Test File**: `test/controllers/swarm_templates_controller_test.rb`

### 4. SwarmTemplates Controller - Project Deletion Cascade

**Explanation**: Cannot delete all projects due to foreign key constraints - needs cascade delete handling.

**Test File**: `test/controllers/swarm_templates_controller_test.rb`

### 5. SwarmTemplates Controller - Nil Project URL Generation

**Explanation**: URL generation fails when passing nil to project_swarm_templates_url.

**Test File**: `test/controllers/swarm_templates_controller_test.rb`

### 6. SettingsController - Empty Strings vs Nil Values

**Explanation**: The controller saves empty form fields as empty strings `""` instead of `nil`.

**Source File**: `app/controllers/settings_controller.rb`
**Test File**: `test/controllers/settings_controller_test.rb`

### 7. InstanceTemplatesController - OpenAI Logic Missing

**Explanation**: Controller not implementing openai-specific logic to force vibe mode and clear tools.

**Test File**: `test/controllers/instance_templates_controller_test.rb`

### 8. InstanceTemplatesController - Library Route Format

**Explanation**: Library route not accepting HTML format - returns 406 Not Acceptable.

**Test File**: `test/controllers/instance_templates_controller_test.rb`

### 9. SwarmTemplateInstancesController - Empty Arrays Handling

**Explanation**: Controller receives [''] instead of [] for empty connections.

**Test File**: `test/controllers/swarm_template_instances_controller_test.rb`

### 10. ProjectsController - GitHub Username Configuration

**Explanation**: Test requires Setting.github_username_configured? to return true which needs openai_api_key.

**Test File**: `test/controllers/projects_controller_test.rb`

## View/Template Bugs

### 11. Missing SwarmTemplates Views

**Missing Files**:
- `app/views/swarm_templates/show.html.erb`
- `app/views/swarm_templates/library.html.erb`

**Test File**: `test/controllers/swarm_templates_controller_test.rb`

### 12. Missing SwarmTemplateInstances Views

**Missing Files**:
- `app/views/swarm_template_instances/` directory doesn't exist
- Expected views: new.html.erb, edit.html.erb, show.html.erb

**Test File**: `test/controllers/swarm_template_instances_controller_test.rb`

### 13. Settings Form - Missing Error Display

**Explanation**: The settings edit view doesn't include code to display validation errors.

**View File**: `app/views/settings/edit.html.erb`
**Test File**: `test/controllers/settings_controller_test.rb`

### 14. SwarmTemplates Form - Missing Error Display

**Explanation**: View doesn't display validation errors properly.

**Test File**: `test/controllers/swarm_templates_controller_test.rb`

### 15. InstanceTemplates Form - Missing Error Display

**Explanation**: Error messages not displayed with expected CSS class - view implementation missing div.text-red-600.

**Test File**: `test/controllers/instance_templates_controller_test.rb`

### 16. Application Layout - Update Notification UI

**Explanation**: The update notification UI referenced in tests is not implemented.

**View File**: `app/views/layouts/application.html.erb`
**Test File**: `test/controllers/application_controller_test.rb`

### 17. Projects Index - Active Sessions Sidebar

**Explanation**: The active sessions sidebar is not displayed on the projects index page.

**View File**: `app/views/projects/index.html.erb`
**Test File**: `test/controllers/application_controller_test.rb`

## Service Bugs

### 18. FileSecurityService - Overly Broad Regex Pattern

**Explanation**: The DANGEROUS_PATTERNS regex `\.git/` matches any path containing a dot, not just `.git` directories.

**Source File**: `app/services/file_security_service.rb` (line 12)
**Test File**: `test/services/file_security_service_test.rb`
- Multiple tests affected

### 19. FileSecurityService - Empty Path Handling

**Explanation**: FileSecurityService rejects empty paths with dangerous pattern error.

**Test File**: `test/services/file_security_service_test.rb`

### 20. FileSecurityService - Absolute Path Validation

**Explanation**: FileSecurityService rejects valid absolute paths - dangerous pattern check is too broad.

**Test File**: `test/services/file_security_service_test.rb`

### 21. FileSecurityService - Test Directory Paths

**Explanation**: FileSecurityService rejects valid paths in test directory.

**Test File**: `test/services/file_security_service_test.rb`

### 22. FileSecurityService - User Path Validation

**Explanation**: FileSecurityService dangerous pattern check incorrectly rejects valid user paths.

**Test File**: `test/services/file_security_service_test.rb`

### 23. FileSecurityService - Config Directory Access

**Explanation**: FileSecurityService allows access to sensitive config directories when used as base_dir.

**Test File**: `test/services/file_security_service_test.rb`

### 24. FileSecurityService - File Size Check Order

**Explanation**: File size check is not working correctly - path validation happening before file existence check.

**Test File**: `test/services/file_security_service_test.rb`

### 25. FileSecurityService - Backslash Escaping

**Explanation**: FileSecurityService.safe_for_tmux doesn't escape backslashes correctly.

**Source File**: `app/services/file_security_service.rb`
**Test File**: `test/services/file_security_service_test.rb`

### 26. GitImportService - URL Normalization

**Explanation**: The normalize_url method doesn't properly chain gsub operations.

**Source File**: `app/services/git_import_service.rb` (lines 97-106)
**Test File**: `test/services/git_import_service_test.rb`

### 27. GitImportService - Command Mocking

**Explanation**: Cannot properly mock %x operator in GitImportService.

**Test File**: `test/services/git_import_service_test.rb`

### 28. GitHub Reaction Service - Comment ID Extraction

**Explanation**: The service's comment ID extraction logic doesn't handle anchor URLs correctly.

**Source File**: `app/services/github_reaction_service.rb`
**Test File**: `test/services/github_reaction_service_test.rb`

### 29. ClaudeService - Multiple Message Processing

**Explanation**: Service only captures text from first yielded message - doesn't process multiple yields correctly.

**Source File**: `app/services/claude_service.rb` (lines 20-40)
**Test File**: `test/services/claude_service_test.rb`

### 30. OptimizedGitStatusService - Directory Deduplication

**Explanation**: Service doesn't properly deduplicate directories when used by multiple instances.

**Source File**: `app/services/optimized_git_status_service.rb`
**Test File**: `test/services/optimized_git_status_service_test.rb`

### 31. OptimizedGitStatusService - Staged Count Calculation

**Explanation**: Test expectations don't match implementation - staged count calculation differs.

**Test File**: `test/services/optimized_git_status_service_test.rb`

### 32. WebhookManager - Redis Subscription

**Explanation**: WebhookManager#run tries to subscribe to Redis even when @running is false.

**Source File**: `app/services/webhook_manager.rb`
**Test File**: `test/services/webhook_manager_test.rb`

### 33. LogTailer - Threading Test

**Explanation**: Threading test is flaky - timing dependent.

**Test File**: `test/services/log_tailer_test.rb`

## Model Bugs

### 34. InstanceTemplate - Config Validation

**Explanation**: Setting config to non-hash causes NoMethodError instead of validation error.

**Source File**: `app/models/instance_template.rb`
**Test File**: `test/models/instance_template_test.rb`

### 35. SwarmTemplate - Config Data Validation

**Explanation**: Setting config_data to non-hash causes NoMethodError instead of validation error.

**Source File**: `app/models/swarm_template.rb`
**Test File**: `test/models/swarm_template_test.rb`

### 36. SwarmTemplate - Swarm Hash Validation

**Explanation**: Setting swarm to non-hash causes TypeError instead of validation error.

**Test File**: `test/models/swarm_template_test.rb`

### 37. SwarmTemplate - Environment Variables

**Explanation**: apply_environment_variables fails when to_yaml returns nil.

**Test File**: `test/models/swarm_template_test.rb`

### 38. Project - Session Association

**Explanation**: Session model needs project association.

**Source File**: `app/models/project.rb`, `app/models/session.rb`
**Test File**: `test/models/project_test.rb`

### 39. VersionChecker - Build Metadata

**Explanation**: Gem::Version doesn't handle build metadata properly.

**Source File**: `app/models/version_checker.rb`
**Test File**: `test/models/version_checker_test.rb`

## Configuration/Infrastructure Bugs

### 40. Encryption Configuration

**Explanation**: Multiple tests skipped due to missing encryption key configuration.

**Test Files**:
- `test/controllers/projects_controller_test.rb`
- `test/models/project_test.rb`
- `test/models/setting_test.rb`
- `test/system/sessions_environment_variables_test.rb`

### 41. Redis/Cache Configuration

**Explanation**: Caching doesn't work in test environment (null_store), RedisClient may not be properly defined.

**Test File**: `test/models/project_test.rb`

### 42. Theme Controller Routing

**Explanation**: Rails test framework doesn't properly raise RoutingError for undefined routes in integration tests.

**Test File**: `test/controllers/theme_controller_test.rb`

### 43. File System Issues

**Explanation**: File.write fails with Invalid argument error in test environment.

**Test File**: `test/controllers/swarm_templates_controller_test.rb`

### 44. Temp File Persistence

**Explanation**: Cannot reliably test temp file content - temp files may not persist between controller and test.

**Test File**: `test/controllers/swarm_templates_controller_test.rb`

## Test Environment Issues

### 45. Browser Version Check

**Explanation**: Browser version check is complex to test and might depend on Rails version.

**Test File**: `test/controllers/application_controller_test.rb`

### 46. Windows Path Testing

**Explanation**: Cannot test Windows paths - Project path validation requires existing directory.

**Test File**: `test/models/session_test.rb`

### 47. Setting Model Atomic Updates

**Explanation**: Need better test for atomic updates - SQLite doesn't allow setting id to nil.

**Test File**: `test/models/setting_test.rb`

### 48. Platform-Specific Tests

**Explanation**: Some tests skip based on platform (Darwin vs Linux).

**Test File**: `test/services/file_security_service_test.rb`

## Summary

**Total Bugs Found**: 48 unique issues across 81 skipped tests

**Categories**:
- Service Bugs: 16 issues
- Controller Bugs: 10 issues  
- View/Template Bugs: 7 issues
- Model Bugs: 6 issues
- Configuration/Infrastructure: 4 issues
- Test Environment: 5 issues

**Most Critical Production Issues**:
1. FileSecurityService blocking legitimate files (8 related bugs)
2. Missing view files causing 406 errors
3. ClaudeService not processing messages correctly
4. GitImportService URL normalization broken
5. Model validations causing NoMethodError instead of validation errors
6. Missing encryption configuration

**Patterns Observed**:
- Many validation errors throw exceptions instead of adding to errors collection
- Multiple views missing error display code
- Service classes have complex regex/parsing issues
- Test environment configuration issues (encryption, caching, file paths)
- Platform-specific code not properly tested across environments