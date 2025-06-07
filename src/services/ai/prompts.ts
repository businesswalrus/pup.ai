import { PromptTemplate } from '../../types/ai';

export class PromptManager {
  private templates: Map<string, PromptTemplate>;

  constructor() {
    this.templates = new Map();
    this.loadDefaultTemplates();
  }

  private loadDefaultTemplates(): void {
    const defaultTemplates: PromptTemplate[] = [
      {
        id: 'default',
        name: 'Default Assistant',
        template: `You are pup.ai, a helpful and friendly AI assistant in Slack. 
You're responding to {{userName}} in {{channelType}}.
Be concise but friendly. Use appropriate emoji occasionally.
Current context: {{context}}

User message: {{message}}`,
        variables: ['userName', 'channelType', 'context', 'message'],
        description: 'Default template for general assistance'
      },
      {
        id: 'direct_message',
        name: 'Direct Message',
        template: `You are pup.ai, having a private conversation with {{userName}}.
Be friendly and personable. Remember this is a one-on-one chat.
Previous context: {{context}}

{{userName}} says: {{message}}`,
        variables: ['userName', 'context', 'message'],
        description: 'Template for direct messages'
      },
      {
        id: 'technical',
        name: 'Technical Assistant',
        template: `You are pup.ai, a technical assistant helping {{userName}} with programming and technical questions.
Provide clear, accurate technical information with code examples when appropriate.
Use markdown formatting for code blocks.
Context: {{context}}

Technical question: {{message}}`,
        variables: ['userName', 'context', 'message'],
        description: 'Template for technical assistance'
      },
      {
        id: 'summary',
        name: 'Conversation Summary',
        template: `Summarize the following Slack conversation in a clear, concise manner.
Focus on key points, decisions made, and action items.
Channel: {{channelName}}

Conversation:
{{conversation}}`,
        variables: ['channelName', 'conversation'],
        description: 'Template for summarizing conversations'
      },
      {
        id: 'code_review',
        name: 'Code Review',
        template: `Review the following code snippet and provide constructive feedback.
Focus on: code quality, potential bugs, performance, and best practices.
Language: {{language}}

Code:
{{code}}

Specific concerns: {{concerns}}`,
        variables: ['language', 'code', 'concerns'],
        description: 'Template for code review assistance'
      },
    ];

    defaultTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  addTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  removeTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  renderTemplate(templateId: string, variables: Record<string, string>): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    let rendered = template.template;

    // Replace all variables in the template
    template.variables.forEach(variable => {
      const value = variables[variable] || '';
      const placeholder = new RegExp(`{{\\s*${variable}\\s*}}`, 'g');
      rendered = rendered.replace(placeholder, value);
    });

    return rendered;
  }

  validateVariables(templateId: string, variables: Record<string, string>): {
    valid: boolean;
    missing: string[];
  } {
    const template = this.templates.get(templateId);
    if (!template) {
      return { valid: false, missing: [] };
    }

    const missing = template.variables.filter(v => !variables[v]);
    return {
      valid: missing.length === 0,
      missing
    };
  }

  // Create a system prompt for the AI based on configuration
  createSystemPrompt(config: {
    personality?: 'professional' | 'casual' | 'playful';
    useEmojis?: boolean;
    maxResponseLength?: number;
  }): string {
    const personalities = {
      professional: 'Be professional and concise. Focus on clarity and accuracy.',
      casual: 'Be friendly and conversational, but still helpful and informative.',
      playful: 'Be fun and engaging! Use humor when appropriate, but remain helpful.'
    };

    let prompt = `You are pup.ai, an intelligent Slack assistant. ${personalities[config.personality || 'casual']}`;
    
    if (config.useEmojis) {
      prompt += ' Feel free to use emojis to make responses more engaging.';
    }
    
    if (config.maxResponseLength) {
      prompt += ` Generally aim for responses around ${config.maxResponseLength} words, but can extend up to 1000 words when the topic requires more depth or detail.`;
    }

    prompt += ' Always be helpful, accurate, and respectful.';

    return prompt;
  }
}