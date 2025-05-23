import { Message } from './Message.js';

export class Chat {
    constructor({ id, name, filename = '', created = null, updated = null, messages = [], fileAnalysis = null, isNew = false, isEdit = false}) {
        this._id = id || crypto.randomUUID();
        this._name = name;
        this._filename = filename;
        this.created = created || new Date().toISOString();
        this.updated = updated || new Date().toISOString();
        this.messages = messages.map(msg => msg instanceof Message ? msg : new Message(msg.role, msg.content, msg.timestamp));
        this.fileAnalysis = fileAnalysis;
        this.isNew = isNew;
        this.isEdit = isEdit;
    }

    addMessage(message) {
        this.messages.push(message);
        this.updated = new Date().toISOString();
        this.isEdit = true;
    }

    toJSON() {
        return {
            id: this._id,
            name: this._name,
            filename: this._filename,
            created: this.created,
            updated: this.updated,
            messages: this.messages,
            fileAnalysis: this.fileAnalysis,
            isNew: this.isNew,
            isEdit: this.isEdit
        };
    }

    get id() {
        return this._id;
    }

    set id(value) {
        if (this._id !== value) {
            this._id = value;
            this.isEdit = true;
            this.updated = new Date().toISOString();
        }
    }

    get name() {
        return this._name;
    }

    set name(value) {
        if (this._name !== value) {
            this._name = value;
            this.isEdit = true;
            this.updated = new Date().toISOString();
        }
    }

    get filename() {
        return this._filename;
    }

    set filename(value) {
        if (this._filename !== value) {
            this._filename = value;
            this.isEdit = true;
            this.updated = new Date().toISOString();
        }
    }


}
