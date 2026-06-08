export type VoiceProviderName = "elevenlabs";

export type VoiceSessionMode = "interactive_lesson" | "osce_patient" | "osce_examiner";

export interface VoiceSessionRequest {
  mode: VoiceSessionMode;
  personaId: string;
  sessionId: string;
  studentId: string;
}

export interface VoiceSessionConfig {
  provider: VoiceProviderName;
  providerAgentId: string;
  sessionId: string;
  signedUrl?: string;
  tools: VoiceToolDefinition[];
}

export interface VoiceToolDefinition {
  description: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface VoiceTranscriptTurn {
  speaker: "student" | "patient" | "examiner" | "lesson_guide" | "system";
  text: string;
  timestamp: string;
}

export interface VoiceSessionEvent {
  payload: Record<string, unknown>;
  provider: VoiceProviderName;
  sessionId: string;
  type: "started" | "transcript_turn" | "tool_call" | "ended" | "error";
}

export interface VoiceProvider {
  createSession(request: VoiceSessionRequest): Promise<VoiceSessionConfig>;
  parseWebhook(payload: unknown): VoiceSessionEvent;
}

export const ELEVENLABS_PROVIDER: VoiceProviderName = "elevenlabs";
