import { CreateSessionDto, Message, PostMessageDto, Session } from './chat.dtos';
export declare class ChatService {
    private sessions;
    private messages;
    createSession(dto: CreateSessionDto): Session;
    postMessage(dto: PostMessageDto): Message;
    getMessages(sessionId: string): {
        items: Message[];
    };
}
