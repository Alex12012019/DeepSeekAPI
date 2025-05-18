import os
import json
from flask import Flask, request, jsonify, render_template, send_from_directory
from openai import OpenAI
import datetime
import re
from pathlib import Path

# Загрузка конфигурации
def load_config():
    try:
        with open('config.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        raise RuntimeError(f"Ошибка загрузки config.json: {str(e)}")

config = load_config()

app = Flask(__name__)
app.secret_key = config['app']['secret_key']
UPLOAD_FOLDER = config['app']['upload_folder']
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Инициализация клиента OpenAI
client = OpenAI(
    api_key=config['openai']['api_key'],
    base_url=config['openai']['base_url']
)

def sanitize_filename(name):
    """Очищает имя файла от спецсимволов"""
    return re.sub(r'[\\/*?:"<>|]', "", name)[:50]

def generate_chat_name(conversation):
    """Генерирует имя чата на основе первого сообщения"""
    if not conversation:
        return "Новый чат"
    
    first_msg = next((msg for msg in conversation if msg["role"] == "user"), None)
    if not first_msg:
        return "Новый чат"
    
    content = first_msg["content"]
    return sanitize_filename(content[:30].strip() + ("..." if len(content) > 30 else ""))

@app.route('/')
def home():
    try:
        files = []
        for f in os.listdir(UPLOAD_FOLDER):
            if f.endswith('.json'):
                filepath = os.path.join(UPLOAD_FOLDER, f)
                with open(filepath, 'r', encoding='utf-8') as file:
                    try:
                        data = json.load(file)
                        name = data.get('meta', {}).get('name', generate_chat_name(data.get('messages', [])))
                    except:
                        name = "Ошибка чтения"
                
                files.append({
                    'filename': f,
                    'name': name,
                    'date': datetime.datetime.fromtimestamp(os.path.getmtime(filepath)).strftime('%Y-%m-%d %H:%M:%S')
                })
        
        files.sort(key=lambda x: os.path.getmtime(os.path.join(UPLOAD_FOLDER, x['filename'])), reverse=True)
        return render_template('index.html', conversations=files)
    except Exception as e:
        print(f"Error loading conversations: {str(e)}")
        return render_template('index.html', conversations=[])

@app.route('/api/send_message', methods=['POST'])
def send_message():
    data = request.json
    user_message = data.get('message', '')
    conversation = data.get('messages', [])
    
    if not user_message:
        return jsonify({'error': 'Empty message'}), 400
    
    try:
        messages = [{"role": msg["role"], "content": msg["content"]} for msg in conversation]
        messages.append({"role": "user", "content": user_message})
        
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            temperature=0.7,
            max_tokens=12000
        )
        
        assistant_reply = response.choices[0].message.content
        new_messages = conversation + [
            {"role": "user", "content": user_message, "timestamp": datetime.datetime.now().isoformat()},
            {"role": "assistant", "content": assistant_reply, "timestamp": datetime.datetime.now().isoformat()}
        ]
        
        return jsonify({
            'status': 'success',
            'assistant_reply': assistant_reply,
            'messages': new_messages
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e),
            'messages': conversation
        }), 500

@app.route('/api/get_conversations')
def get_conversations():
    conversations = []
    for filename in os.listdir(UPLOAD_FOLDER):
        if filename.endswith('.json'):
            path = os.path.join(UPLOAD_FOLDER, filename)
            with open(path, 'r') as f:
                data = json.load(f)
            conversations.append({
                'filename': filename,
                'name': data.get('meta', {}).get('name', 'Новый диалог'),
                'date': os.path.getmtime(path)
            })
    return jsonify(conversations)

@app.route('/api/save_conversation', methods=['POST'])
def save_conversation():
    data = request.json
    messages = data.get('messages', [])
    custom_name = data.get('name', '')
    
    if not messages:
        return jsonify({'error': 'Empty conversation'}), 400
    
    try:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        name = sanitize_filename(custom_name) if custom_name else generate_chat_name(messages)
        filename = f"conv_{timestamp}_{name}.json"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump({
                'meta': {
                    'name': name,
                    'created': datetime.datetime.now().isoformat()
                },
                'messages': messages
            }, f, indent=2, ensure_ascii=False)
        
        return jsonify({
            'status': 'success',
            'filename': filename,
            'name': name
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/api/rename_chat/<filename>', methods=['POST'])
def rename_chat(filename):
    new_name = request.json.get('new_name')
    if not new_name:
        return jsonify({'error': 'No new name provided'}), 400
    
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    
    with open(filepath, 'r+') as f:
        data = json.load(f)
        data['meta']['name'] = new_name
        f.seek(0)
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.truncate()
    
    return jsonify({'status': 'success'})

@app.route('/api/delete_chat/<filename>', methods=['POST'])
def delete_chat(filename):
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    if os.path.exists(filepath):
        os.remove(filepath)
    return jsonify({'status': 'success'})

@app.route('/api/load_conversation/<filename>')
def load_conversation(filename):
    if not filename.endswith('.json') or '/' in filename:
        return jsonify({'error': 'Invalid filename'}), 400
    
    path = os.path.join(UPLOAD_FOLDER, filename)
    with open(path, 'r') as f:
        data = json.load(f)
    
    return jsonify({
        'messages': data.get('messages', []),
        'name': data.get('meta', {}).get('name', 'Без названия')
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)