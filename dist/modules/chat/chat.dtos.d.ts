export type CreateSessionDto = {
    channel: 'web' | 'telegram' | 'whatsapp';
    channelUserId: string;
    preferVoice?: boolean;
    email?: string;
};
export type PostMessageDto = {
    sessionId: string;
    sender: 'user' | 'agent';
    text?: string;
    voiceUrl?: string;
    fileUrl?: string;
};
export type Session = {
    id: string;
    channel: string;
    channelUserId: string;
    preferVoice: boolean;
    email: string | null;
    createdAt: string;
};
export type Message = {
    id: string;
    sessionId: string;
    sender: 'user' | 'agent' | 'ai' | 'system';
    text: string | null;
    voiceUrl: string | null;
    fileUrl: string | null;
    createdAt: string;
};
