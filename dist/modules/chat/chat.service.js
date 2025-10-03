"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let ChatService = class ChatService {
    sessions = new Map();
    messages = new Map();
    createSession(dto) {
        const id = (0, crypto_1.randomUUID)();
        const session = {
            id,
            channel: dto.channel,
            channelUserId: dto.channelUserId,
            preferVoice: dto.preferVoice ?? false,
            email: dto.email ?? null,
            createdAt: new Date().toISOString(),
        };
        this.sessions.set(id, session);
        this.messages.set(id, []);
        return session;
    }
    postMessage(dto) {
        if (!this.sessions.has(dto.sessionId)) {
            throw new common_1.NotFoundException('Session not found');
        }
        const msg = {
            id: (0, crypto_1.randomUUID)(),
            sessionId: dto.sessionId,
            sender: dto.sender,
            text: dto.text ?? null,
            voiceUrl: dto.voiceUrl ?? null,
            fileUrl: dto.fileUrl ?? null,
            createdAt: new Date().toISOString(),
        };
        this.messages.get(dto.sessionId).push(msg);
        return msg;
    }
    getMessages(sessionId) {
        if (!this.sessions.has(sessionId)) {
            throw new common_1.NotFoundException('Session not found');
        }
        return { items: this.messages.get(sessionId) ?? [] };
    }
};
exports.ChatService = ChatService;
exports.ChatService = ChatService = __decorate([
    (0, common_1.Injectable)()
], ChatService);
//# sourceMappingURL=chat.service.js.map