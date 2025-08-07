// ==========================================
// SERVICES/COGNITIVE-CORE/src/agents/analyst.js
// ==========================================
import { BaseAgent } from './base-agent.js';
import { ANALYST_PROMPT } from '../prompts/analyst.prompt.js';

class AnalystAgent extends BaseAgent {
  getTaskDescription(input, context) {
    return `Analyzing system logs for improvement opportunities`;
  }

  async executeTask(logData, context = {}) {
    const { qualityMode = 'pro' } = context; // Use pro model for analysis

    // Prepare log data for analysis
    const logText = Array.isArray(logData) ? logData.join('\n') : logData;

    const prompt = `${ANALYST_PROMPT}\n\n# LOG-DATEN ZUR ANALYSE\n${logText}\n\n# DEINE ANALYSE (NUR JSON):`;
    
    const response = await this.callModel(prompt, qualityMode);

    // Validate response
    if (!response.recommendation || typeof response.recommendation !== 'string') {
      throw new Error('Analyst must return a recommendation field with string content');
    }

    this.logger.logAgentAction(this.agentName, 'Log analysis completed', {
      logDataLength: logText.length,
      recommendationLength: response.recommendation.length,
      hasSourceAgent: !!response.sourceAgent,
    });

    return response;
  }

  /**
   * Analyze a learning episode to diagnose the problem
   */
  async analyzeLearningEpisode(episode, context = {}) {
    const { qualityMode = 'pro' } = context;

    // Prepare episode data for analysis
    const episodeAnalysis = this.prepareEpisodeForAnalysis(episode);
    
    const prompt = `${ANALYST_PROMPT}

# LERN-EPISODE ZUR ANALYSE
Die folgende Episode zeigt einen Fall, wo ein Nutzer eine KI-Antwort korrigiert hat:

## ORIGINAL PLAN
${episode.originalPlan || 'Nicht verfügbar'}

## NUTZER FEEDBACK (KORREKTUR)
${episode.userFeedback}

## ERFOLGREICHER PLAN (Nach Korrektur)
${episode.successfulPlan || 'Noch nicht verfügbar'}

## KONTEXT
- Agent: ${episode.agentUsed}
- Qualitätsmodus: ${episode.qualityMode}
- Intent: ${episode.classification?.intent}
- Aufgaben: ${episode.classification?.tasks?.join(', ') || 'Keine'}

# DEINE AUFGABE
Analysiere die Diskrepanz zwischen dem originalen Plan und dem Nutzer-Feedback. 
Identifiziere die wahrscheinlichste Ursache für den Fehler und formuliere eine konkrete Empfehlung zur Prompt-Verbesserung.

# DEINE ANALYSE (NUR JSON):`;

    const response = await this.callModel(prompt, qualityMode);

    // Validate learning episode analysis response
    this.validateLearningAnalysis(response, episode);

    // Prepare structured analysis result
    const analysisResult = {
      episodeId: episode.episodeId,
      sourceAgent: response.sourceAgent || episode.agentUsed,
      detectedProblem: response.recommendation,
      confidence: response.confidence || 0.8,
      evidence: {
        originalPlan: episode.originalPlan,
        userFeedback: episode.userFeedback,
        successfulPlan: episode.successfulPlan,
        classification: episode.classification
      },
      analysisMetadata: {
        analyzedAt: new Date(),
        analyzerAgent: this.agentName,
        qualityMode
      }
    };

    this.logger.logAgentAction(this.agentName, 'Learning episode analyzed', {
      episodeId: episode.episodeId,
      sourceAgent: analysisResult.sourceAgent,
      problemLength: analysisResult.detectedProblem.length,
      confidence: analysisResult.confidence
    });

    return analysisResult;
  }

  /**
   * Prepare episode data for analysis
   */
  prepareEpisodeForAnalysis(episode) {
    return {
      originalPlanLength: episode.originalPlan?.length || 0,
      feedbackLength: episode.userFeedback?.length || 0,
      successfulPlanLength: episode.successfulPlan?.length || 0,
      timeToCorrection: episode.completedAt - episode.createdAt,
      agentUsed: episode.agentUsed,
      qualityMode: episode.qualityMode
    };
  }

  /**
   * Validate learning episode analysis response
   */
  validateLearningAnalysis(response, episode) {
    if (!response.recommendation || typeof response.recommendation !== 'string') {
      throw new Error('Learning analysis must return a recommendation field');
    }

    if (response.recommendation.length < 20) {
      throw new Error('Learning analysis recommendation too short');
    }

    // Optional fields validation
    if (response.sourceAgent && typeof response.sourceAgent !== 'string') {
      throw new Error('sourceAgent must be a string if provided');
    }

    if (response.confidence && (typeof response.confidence !== 'number' || 
        response.confidence < 0 || response.confidence > 1)) {
      throw new Error('confidence must be a number between 0 and 1');
    }
  }
}

export { AnalystAgent };