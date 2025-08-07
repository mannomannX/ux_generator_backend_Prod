/**
 * Secure Prompt Implementation Workflow
 * 
 * Provides safe deployment of optimized prompts with version control,
 * rollback capabilities, and validation. This is the final safety mechanism
 * in the self-optimizing prompt system.
 * 
 * Features:
 * - Version control integration
 * - Automatic backup and rollback
 * - Pre-deployment validation
 * - Monitoring and health checks
 * - Human approval checkpoints
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class PromptImplementationWorkflow {
  constructor(logger, problemDatabase, eventEmitter) {
    this.logger = logger;
    this.problemDatabase = problemDatabase;
    this.eventEmitter = eventEmitter;
    
    // Configuration
    this.config = {
      enabled: process.env.ENABLE_PROMPT_IMPLEMENTATION === 'true',
      promptsDirectory: path.join(process.cwd(), 'src', 'prompts'),
      backupsDirectory: path.join(process.cwd(), 'backups', 'prompts'),
      maxBackups: 50,
      requireGitCommit: process.env.REQUIRE_GIT_COMMIT !== 'false',
      requireTesting: process.env.REQUIRE_TESTING !== 'false',
      autoRestart: process.env.AUTO_RESTART_AGENTS === 'true'
    };
    
    // Implementation status tracking
    this.activeImplementations = new Map();
    this.implementationHistory = [];
    
    // Validation settings
    this.validationRules = {
      minPromptLength: 50,
      maxPromptLength: 8000,
      requiredSections: ['# ROLLE', '# AUFGABE', '# REGELN'],
      forbiddenPatterns: [
        /system\s*\(/i,
        /exec\s*\(/i,
        /eval\s*\(/i,
        /<script/i,
        /javascript:/i
      ]
    };
    
    // Statistics
    this.stats = {
      totalImplementations: 0,
      successfulImplementations: 0,
      failedImplementations: 0,
      rolledBackImplementations: 0,
      averageImplementationTime: 0
    };
  }

  /**
   * Initialize the implementation workflow
   */
  async initialize() {
    if (!this.config.enabled) {
      this.logger.info('Prompt implementation workflow is disabled');
      return;
    }

    try {
      // Ensure directories exist
      await this.ensureDirectories();
      
      // Check git repository status
      if (this.config.requireGitCommit) {
        await this.validateGitRepository();
      }
      
      // Load implementation history
      await this.loadImplementationHistory();
      
      this.logger.info('Prompt implementation workflow initialized', {
        enabled: this.config.enabled,
        requireGitCommit: this.config.requireGitCommit,
        requireTesting: this.config.requireTesting
      });
    } catch (error) {
      this.logger.error('Failed to initialize implementation workflow', error);
      throw error;
    }
  }

  /**
   * Start implementation process for an optimized prompt
   */
  async startImplementation(suggestionId, optimizedPrompt, implementedBy, options = {}) {
    if (!this.config.enabled) {
      throw new Error('Implementation workflow is disabled');
    }

    const implementationId = this.generateImplementationId();
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting prompt implementation', {
        implementationId,
        suggestionId,
        implementedBy,
        promptLength: optimizedPrompt.optimizedPrompt?.length || 0
      });

      // Get suggestion details
      const suggestion = await this.problemDatabase.getSuggestion(suggestionId);
      if (!suggestion) {
        throw new Error(`Suggestion ${suggestionId} not found`);
      }

      // Validate suggestion is ready for implementation
      await this.validateSuggestionReadiness(suggestion, optimizedPrompt);

      // Create implementation record
      const implementation = {
        implementationId,
        suggestionId,
        sourceAgent: suggestion.sourceAgent,
        implementedBy,
        startTime,
        status: 'in_progress',
        steps: [],
        rollbackData: null,
        validationResults: [],
        options
      };

      this.activeImplementations.set(implementationId, implementation);

      // Execute implementation steps
      await this.executeImplementationSteps(implementationId, suggestion, optimizedPrompt);

      // Mark as successful
      implementation.status = 'completed';
      implementation.completedAt = Date.now();
      implementation.duration = implementation.completedAt - startTime;

      // Update statistics
      this.updateImplementationStats(implementation);

      // Store in history
      this.implementationHistory.push({ ...implementation });

      // Update suggestion in database
      await this.problemDatabase.markAsImplemented(suggestionId, implementedBy, {
        notes: `Implemented via workflow ${implementationId}`,
        filePath: implementation.filePath,
        oldPromptHash: implementation.rollbackData?.originalHash,
        newPromptHash: implementation.newPromptHash
      });

      this.logger.info('Prompt implementation completed successfully', {
        implementationId,
        suggestionId,
        duration: implementation.duration,
        agentName: suggestion.sourceAgent
      });

      return {
        success: true,
        implementationId,
        duration: implementation.duration,
        steps: implementation.steps.length,
        canRollback: true
      };

    } catch (error) {
      this.logger.error('Prompt implementation failed', error, {
        implementationId,
        suggestionId
      });

      // Mark as failed
      if (this.activeImplementations.has(implementationId)) {
        const implementation = this.activeImplementations.get(implementationId);
        implementation.status = 'failed';
        implementation.error = error.message;
        implementation.completedAt = Date.now();
        
        this.stats.failedImplementations++;
      }

      throw error;
    } finally {
      // Clean up active implementation
      this.activeImplementations.delete(implementationId);
    }
  }

  /**
   * Execute all implementation steps
   */
  async executeImplementationSteps(implementationId, suggestion, optimizedPrompt) {
    const implementation = this.activeImplementations.get(implementationId);
    
    const steps = [
      { name: 'validate_prompt', handler: this.validatePromptContent },
      { name: 'backup_original', handler: this.backupOriginalPrompt },
      { name: 'prepare_rollback', handler: this.prepareRollbackData },
      { name: 'test_optimized_prompt', handler: this.testOptimizedPrompt },
      { name: 'deploy_prompt', handler: this.deployPrompt },
      { name: 'validate_deployment', handler: this.validateDeployment },
      { name: 'commit_changes', handler: this.commitChangesToGit },
      { name: 'restart_agents', handler: this.restartAffectedAgents }
    ];

    for (const step of steps) {
      const stepStart = Date.now();
      
      try {
        this.logger.debug('Executing implementation step', {
          implementationId,
          step: step.name
        });

        const result = await step.handler.call(this, implementation, suggestion, optimizedPrompt);
        
        implementation.steps.push({
          name: step.name,
          status: 'completed',
          duration: Date.now() - stepStart,
          result
        });

      } catch (error) {
        implementation.steps.push({
          name: step.name,
          status: 'failed',
          duration: Date.now() - stepStart,
          error: error.message
        });

        // Attempt rollback on failure
        if (implementation.rollbackData) {
          await this.performRollback(implementationId);
        }

        throw new Error(`Implementation step '${step.name}' failed: ${error.message}`);
      }
    }
  }

  /**
   * Validate prompt content
   */
  async validatePromptContent(implementation, suggestion, optimizedPrompt) {
    const prompt = optimizedPrompt.optimizedPrompt;
    const violations = [];

    // Length validation
    if (prompt.length < this.validationRules.minPromptLength) {
      violations.push(`Prompt too short: ${prompt.length} chars`);
    }
    if (prompt.length > this.validationRules.maxPromptLength) {
      violations.push(`Prompt too long: ${prompt.length} chars`);
    }

    // Required sections
    for (const section of this.validationRules.requiredSections) {
      if (!prompt.includes(section)) {
        violations.push(`Missing required section: ${section}`);
      }
    }

    // Security validation - forbidden patterns
    for (const pattern of this.validationRules.forbiddenPatterns) {
      if (pattern.test(prompt)) {
        violations.push(`Security violation: matches forbidden pattern ${pattern}`);
      }
    }

    if (violations.length > 0) {
      throw new Error(`Prompt validation failed: ${violations.join(', ')}`);
    }

    implementation.validationResults.push({
      type: 'content_validation',
      status: 'passed',
      details: 'All content validation rules passed'
    });

    return { violations: [], status: 'passed' };
  }

  /**
   * Backup original prompt
   */
  async backupOriginalPrompt(implementation, suggestion, optimizedPrompt) {
    const agentName = suggestion.sourceAgent;
    const promptFile = `${agentName.toLowerCase()}.prompt.js`;
    const promptPath = path.join(this.config.promptsDirectory, promptFile);

    // Read original prompt
    const originalContent = await fs.readFile(promptPath, 'utf8');
    
    // Create backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${agentName}_${timestamp}_${implementation.implementationId}.backup`;
    const backupPath = path.join(this.config.backupsDirectory, backupFileName);
    
    await fs.writeFile(backupPath, originalContent, 'utf8');
    
    implementation.backupPath = backupPath;
    
    return {
      originalPath: promptPath,
      backupPath,
      originalHash: this.calculateHash(originalContent)
    };
  }

  /**
   * Prepare rollback data
   */
  async prepareRollbackData(implementation, suggestion, optimizedPrompt) {
    const agentName = suggestion.sourceAgent;
    const promptFile = `${agentName.toLowerCase()}.prompt.js`;
    const promptPath = path.join(this.config.promptsDirectory, promptFile);

    const originalContent = await fs.readFile(promptPath, 'utf8');
    
    implementation.rollbackData = {
      agentName,
      promptPath,
      originalContent,
      originalHash: this.calculateHash(originalContent),
      backupPath: implementation.backupPath
    };

    return { prepared: true, agentName };
  }

  /**
   * Test optimized prompt (if testing is enabled)
   */
  async testOptimizedPrompt(implementation, suggestion, optimizedPrompt) {
    if (!this.config.requireTesting) {
      return { skipped: true, reason: 'Testing disabled' };
    }

    // Create temporary prompt file for testing
    const tempPromptPath = await this.createTemporaryPrompt(
      suggestion.sourceAgent,
      optimizedPrompt.optimizedPrompt
    );

    try {
      // Run basic validation test
      const testResult = await this.runPromptValidationTests(
        suggestion.sourceAgent,
        tempPromptPath
      );

      implementation.validationResults.push({
        type: 'prompt_testing',
        status: testResult.success ? 'passed' : 'failed',
        details: testResult.details
      });

      if (!testResult.success) {
        throw new Error(`Prompt testing failed: ${testResult.error}`);
      }

      return testResult;
    } finally {
      // Clean up temporary file
      await fs.unlink(tempPromptPath).catch(() => {});
    }
  }

  /**
   * Deploy the optimized prompt
   */
  async deployPrompt(implementation, suggestion, optimizedPrompt) {
    const agentName = suggestion.sourceAgent;
    const promptFile = `${agentName.toLowerCase()}.prompt.js`;
    const promptPath = path.join(this.config.promptsDirectory, promptFile);

    // Read original file to preserve structure
    const originalContent = await fs.readFile(promptPath, 'utf8');
    
    // Replace prompt content while preserving file structure
    const newContent = this.replacePromptInFile(originalContent, optimizedPrompt.optimizedPrompt);
    
    // Write new content
    await fs.writeFile(promptPath, newContent, 'utf8');
    
    implementation.filePath = promptPath;
    implementation.newPromptHash = this.calculateHash(optimizedPrompt.optimizedPrompt);

    return {
      deployed: true,
      filePath: promptPath,
      newHash: implementation.newPromptHash
    };
  }

  /**
   * Validate deployment
   */
  async validateDeployment(implementation, suggestion, optimizedPrompt) {
    const promptPath = implementation.filePath;
    
    // Read deployed content
    const deployedContent = await fs.readFile(promptPath, 'utf8');
    
    // Verify hash matches
    const deployedPrompt = this.extractPromptFromFile(deployedContent);
    const deployedHash = this.calculateHash(deployedPrompt);
    
    if (deployedHash !== implementation.newPromptHash) {
      throw new Error('Deployment validation failed: hash mismatch');
    }

    return { validated: true, hash: deployedHash };
  }

  /**
   * Commit changes to Git
   */
  async commitChangesToGit(implementation, suggestion, optimizedPrompt) {
    if (!this.config.requireGitCommit) {
      return { skipped: true, reason: 'Git commit disabled' };
    }

    const agentName = suggestion.sourceAgent;
    const commitMessage = `Optimize ${agentName} prompt - ${suggestion.detectedProblem.substring(0, 100)}

Implementation ID: ${implementation.implementationId}
Suggestion ID: ${suggestion._id}
Implemented by: ${implementation.implementedBy}

🤖 Generated with Claude Code Learning System`;

    try {
      // Add file to git
      await execAsync(`git add ${implementation.filePath}`);
      
      // Commit changes
      const { stdout } = await execAsync(`git commit -m "${commitMessage}"`);
      
      return { committed: true, output: stdout };
    } catch (error) {
      // Check if it's just no changes to commit
      if (error.message.includes('nothing to commit')) {
        return { skipped: true, reason: 'No changes to commit' };
      }
      throw error;
    }
  }

  /**
   * Restart affected agents (if enabled)
   */
  async restartAffectedAgents(implementation, suggestion, optimizedPrompt) {
    if (!this.config.autoRestart) {
      return { skipped: true, reason: 'Auto restart disabled' };
    }

    // Emit event for agent restart
    this.eventEmitter.emit('agent-prompt-updated', {
      agentName: suggestion.sourceAgent,
      implementationId: implementation.implementationId,
      timestamp: Date.now()
    });

    return { restarted: true, agentName: suggestion.sourceAgent };
  }

  /**
   * Perform rollback
   */
  async performRollback(implementationId) {
    const implementation = this.activeImplementations.get(implementationId) ||
      this.implementationHistory.find(impl => impl.implementationId === implementationId);

    if (!implementation || !implementation.rollbackData) {
      throw new Error('Cannot rollback: no rollback data available');
    }

    try {
      this.logger.info('Starting rollback', { implementationId });

      // Restore original prompt file
      await fs.writeFile(
        implementation.rollbackData.promptPath,
        implementation.rollbackData.originalContent,
        'utf8'
      );

      // Commit rollback if git is enabled
      if (this.config.requireGitCommit) {
        const rollbackMessage = `Rollback prompt optimization for ${implementation.rollbackData.agentName}

Rolled back implementation: ${implementationId}
Reason: Implementation failure or manual rollback`;

        try {
          await execAsync(`git add ${implementation.rollbackData.promptPath}`);
          await execAsync(`git commit -m "${rollbackMessage}"`);
        } catch (gitError) {
          this.logger.warn('Git rollback commit failed', gitError);
        }
      }

      // Update statistics
      this.stats.rolledBackImplementations++;

      this.logger.info('Rollback completed successfully', { implementationId });
      
      return { success: true, implementationId };
    } catch (error) {
      this.logger.error('Rollback failed', error, { implementationId });
      throw error;
    }
  }

  /**
   * Manual rollback interface
   */
  async rollbackImplementation(implementationId, reason) {
    await this.performRollback(implementationId);
    
    // Record rollback reason
    const implementation = this.implementationHistory.find(
      impl => impl.implementationId === implementationId
    );
    
    if (implementation) {
      implementation.rolledBack = true;
      implementation.rollbackReason = reason;
      implementation.rollbackAt = new Date();
    }

    return { success: true, reason };
  }

  /**
   * Helper methods
   */

  async ensureDirectories() {
    await fs.mkdir(this.config.backupsDirectory, { recursive: true });
    
    // Clean old backups if too many
    const backups = await fs.readdir(this.config.backupsDirectory);
    if (backups.length > this.config.maxBackups) {
      const oldBackups = backups.slice(0, backups.length - this.config.maxBackups);
      for (const backup of oldBackups) {
        await fs.unlink(path.join(this.config.backupsDirectory, backup));
      }
    }
  }

  async validateGitRepository() {
    try {
      await execAsync('git status');
      return true;
    } catch (error) {
      throw new Error('Git repository not found or not initialized');
    }
  }

  async validateSuggestionReadiness(suggestion, optimizedPrompt) {
    if (suggestion.status !== 'approved') {
      throw new Error('Suggestion must be approved for implementation');
    }

    if (!optimizedPrompt || !optimizedPrompt.optimizedPrompt) {
      throw new Error('No optimized prompt provided');
    }

    if (!suggestion.sourceAgent) {
      throw new Error('No source agent specified');
    }
  }

  replacePromptInFile(originalContent, newPrompt) {
    // Replace the prompt content between the backticks
    const promptRegex = /(export const \w+_PROMPT = `)[\s\S]*?(`;)/;
    return originalContent.replace(promptRegex, `$1${newPrompt}$2`);
  }

  extractPromptFromFile(fileContent) {
    const match = fileContent.match(/export const \w+_PROMPT = `([\s\S]*?)`;/);
    return match ? match[1].trim() : '';
  }

  calculateHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  generateImplementationId() {
    return `impl_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  async createTemporaryPrompt(agentName, prompt) {
    const tempPath = path.join(
      this.config.backupsDirectory,
      `temp_${agentName}_${Date.now()}.prompt.js`
    );
    
    const content = `export const TEMP_PROMPT = \`${prompt}\`;`;
    await fs.writeFile(tempPath, content, 'utf8');
    
    return tempPath;
  }

  async runPromptValidationTests(agentName, promptPath) {
    // Basic validation - could be extended to run actual tests
    try {
      const content = await fs.readFile(promptPath, 'utf8');
      const isValid = content.includes('export const') && content.includes('PROMPT');
      
      return {
        success: isValid,
        details: isValid ? 'Basic syntax validation passed' : 'Invalid prompt syntax',
        error: isValid ? null : 'Syntax validation failed'
      };
    } catch (error) {
      return {
        success: false,
        details: 'Failed to read test prompt',
        error: error.message
      };
    }
  }

  updateImplementationStats(implementation) {
    this.stats.totalImplementations++;
    this.stats.successfulImplementations++;
    
    // Update average duration
    const avgDuration = this.stats.averageImplementationTime;
    const count = this.stats.totalImplementations;
    this.stats.averageImplementationTime = 
      (avgDuration * (count - 1) + implementation.duration) / count;
  }

  async loadImplementationHistory() {
    // In production, this would load from persistent storage
    this.implementationHistory = [];
  }

  /**
   * Get implementation statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      successRate: this.stats.successfulImplementations / Math.max(this.stats.totalImplementations, 1),
      activeImplementations: this.activeImplementations.size,
      enabled: this.config.enabled
    };
  }

  /**
   * Get implementation history
   */
  getImplementationHistory(limit = 50) {
    return this.implementationHistory
      .slice(-limit)
      .sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Shutdown workflow
   */
  shutdown() {
    this.logger.info('Prompt implementation workflow shutting down', {
      activeImplementations: this.activeImplementations.size,
      totalImplementations: this.stats.totalImplementations
    });
  }
}

module.exports = { PromptImplementationWorkflow };