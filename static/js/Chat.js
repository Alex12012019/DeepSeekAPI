import { Message } from './Message.js';

export class Chat {
    constructor({ id, name, filename = '', created = null, updated = null, messages = [], fileAnalysis = null, isNew = false }) {
        this.id = id || crypto.randomUUID();
        this.name = name;
        this.filename = filename;
        this.created = created || new Date().toISOString();
        this.updated = updated || new Date().toISOString();
        this.messages = messages.map(msg => msg instanceof Message ? msg : new Message(msg.role, msg.content, msg.timestamp));
        this.fileAnalysis = fileAnalysis;
        this.isNew = isNew;
    }

    addMessage(message) {
        this.messages.push(message);
        this.updated = new Date().toISOString();
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            filename: this.filename,
            created: this.created,
            updated: this.updated,
            messages: this.messages,
            fileAnalysis: this.fileAnalysis,
            isNew: this.isNew
        };
    }
}
