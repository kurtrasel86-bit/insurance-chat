import { ChatService } from './chat.service';
import type { CreateSessionDto, PostMessageDto } from './chat.dtos';
export declare class ChatController {
    private readonly chatService;
    constructor(chatService: ChatService);
    createSession(dto: CreateSessionDto): import("./chat.dtos").Session;
    postMessage(dto: PostMessageDto): import("./chat.dtos").Message;
    getMessages(id: string): {
        items: import("./chat.dtos").Message[];
    };
}
